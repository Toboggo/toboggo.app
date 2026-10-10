#!/usr/bin/env python3
"""Retour arrière du lot OSM — périmètre strict, préconditions, atomicité.

Tests « DB » : base LOCALE uniquement (skip sinon), tout dans une transaction
ANNULÉE (aucune donnée persistée). Jamais staging/prod.
"""
import importlib.util
import re
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

try:
    import psycopg
except ImportError:  # pragma: no cover
    psycopg = None

LOCAL_DSN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
spec = importlib.util.spec_from_file_location("rollback_batch", HERE / "rollback-osm-batch.py")
rb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rb)

BATCH = ["node/99900001", "way/99900002"]
STARTED = "2000-01-01T00:00:00Z"


def _db_available():
    if psycopg is None:
        return False
    try:
        with psycopg.connect(LOCAL_DSN, connect_timeout=2) as c:
            c.execute("select 1")
        return True
    except Exception:
        return False


def _body(sql):
    """Retire begin/commit du script (le test gère sa propre transaction annulée)."""
    sql = re.sub(r"(?m)^begin;\s*$", "", sql, count=1)
    return re.sub(r"(?m)^commit;\s*$", "", sql)


class TestPureSql(unittest.TestCase):
    def test_script_is_a_single_guarded_transaction(self):
        sql = rb.build_rollback_sql(BATCH, 2, STARTED, "US")
        self.assertEqual(sql.count("\nbegin;"), 1)
        self.assertTrue(sql.rstrip().endswith("commit;"))
        self.assertEqual(sql.count("delete from parks"), 1)
        # la suppression ne cible QUE les parcs du lot, jamais un filtre large
        self.assertIn("join _batch_ids b on b.external_id = e.external_id where e.provider = 'osm'", sql)
        self.assertNotRegex(sql, r"delete from parks\s*;")
        self.assertNotIn("truncate", sql.lower())
        for ids in BATCH:
            self.assertIn(f"('{ids}')", sql)

    def test_guards_present(self):
        sql = rb.build_rollback_sql(BATCH, 2, STARTED, "US")
        for needle in ("moderation_status <> 'pending'", "created_by is not null", "created_at < started",
                       "source_type not in ('osm', 'reverse_geocode')", "ROLLBACK ARRÊTÉ", "expected int := 2"):
            self.assertIn(needle, sql)
        for t in ("reviews", "reports", "park_media", "park_edits"):
            self.assertIn(f"'{t}'", sql)

    def test_empty_batch_refused_and_quotes_escaped(self):
        with self.assertRaises(ValueError):
            rb.build_rollback_sql([], 0, STARTED)
        self.assertIn("'way/1''x'", rb.build_rollback_sql(["way/1'x"], 1, STARTED))


@unittest.skipUnless(_db_available(), "Supabase local injoignable (supabase start ?)")
class TestAgainstLocalDb(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg.connect(LOCAL_DSN)
        self.cur = self.conn.cursor()
        c = self.cur
        # parcs du lot (US, pending, créés par l'import) + témoins hors lot
        for pid, name, cc, tz, status, ext in (
            ("e0490000-0000-4000-a000-0000000000a1", "zzz_rb_a", "US", "America/New_York", "pending", "node/99900001"),
            ("e0490000-0000-4000-a000-0000000000a2", "zzz_rb_b", "US", "America/New_York", "pending", "way/99900002"),
            ("e0490000-0000-4000-a000-0000000000c1", "zzz_rb_other_us", "US", "America/New_York", "pending", "node/99900003"),
            ("e0490000-0000-4000-a000-0000000000d1", "zzz_rb_fr", "FR", "Europe/Paris", "published", "node/99900004"),
        ):
            c.execute("insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status) "
                      "values (%s, %s, 40.7, -73.9, %s, %s, %s)", (pid, name, cc, tz, status))
            c.execute("insert into external_ids (park_id, provider, external_id) values (%s, 'osm', %s)", (pid, ext))
            c.execute("insert into park_sources (park_id, source_type, source_name) values (%s, 'osm', 'OpenStreetMap')", (pid,))
        c.execute("insert into park_features (park_id, feature_id, status, source_id) "
                  "select 'e0490000-0000-4000-a000-0000000000a1', f.id, 'available', ps.id "
                  "from features f, park_sources ps where f.code = 'slide' and ps.park_id = 'e0490000-0000-4000-a000-0000000000a1'")
        self.sql = _body(rb.build_rollback_sql(BATCH, 2, STARTED, "US"))

    def tearDown(self):
        self.conn.rollback()
        self.conn.close()

    def _count(self, where):
        self.cur.execute(f"select count(*) from parks where {where}")
        return self.cur.fetchone()[0]

    def _run_expect_abort(self, sql, pattern):
        with self.assertRaisesRegex(psycopg.errors.RaiseException, pattern):
            with self.conn.transaction():
                self.cur.execute(sql)
        # rien n'a été supprimé
        self.assertEqual(self._count("name like 'zzz_rb_%'"), 4)

    def test_success_deletes_only_the_batch(self):
        self.cur.execute(self.sql)
        self.assertEqual(self._count("name in ('zzz_rb_a','zzz_rb_b')"), 0)
        self.assertEqual(self._count("name = 'zzz_rb_other_us'"), 1)   # autre parc US pending hors lot
        self.assertEqual(self._count("name = 'zzz_rb_fr'"), 1)         # FR/ES jamais touchés
        self.cur.execute("select count(*) from external_ids where external_id in ('node/99900001','way/99900002')")
        self.assertEqual(self.cur.fetchone()[0], 0)
        self.cur.execute("select count(*) from park_features where park_id = 'e0490000-0000-4000-a000-0000000000a1'")
        self.assertEqual(self.cur.fetchone()[0], 0)                    # cascade sur les données dérivées d'OSM
        self.cur.execute("select count(*) from external_ids where external_id in ('node/99900003','node/99900004')")
        self.assertEqual(self.cur.fetchone()[0], 2)

    def test_abort_if_a_park_was_published(self):
        self.cur.execute("update parks set moderation_status = 'published' where name = 'zzz_rb_a'")
        self._run_expect_abort(self.sql, "hors périmètre")

    def test_abort_if_created_by_set(self):
        self.cur.execute("insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) "
                         "values ('e0490000-0000-4000-a000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-rb@test.local', '', now(), now(), now())")
        self.cur.execute("update parks set created_by = 'e0490000-0000-4000-a000-0000000000f1' where name = 'zzz_rb_b'")
        self._run_expect_abort(self.sql, "hors périmètre")

    def test_abort_if_human_data_attached(self):
        self.cur.execute("insert into park_names (park_id, lang, name, is_primary) values ('e0490000-0000-4000-a000-0000000000a2', 'en', 'zzz', false)")
        self._run_expect_abort(self.sql, "park_names")

    def test_abort_if_foreign_external_id(self):
        self.cur.execute("insert into external_ids (park_id, provider, external_id) values ('e0490000-0000-4000-a000-0000000000a1', 'google', 'zzz-1')")
        self._run_expect_abort(self.sql, "identité")

    def test_abort_if_non_osm_source(self):
        self.cur.execute("insert into park_sources (park_id, source_type, source_name) values ('e0490000-0000-4000-a000-0000000000a2', 'toboggo', 'Admin')")
        self._run_expect_abort(self.sql, "source")

    def test_abort_if_feature_not_from_osm(self):
        self.cur.execute("insert into park_features (park_id, feature_id, status) "
                         "select 'e0490000-0000-4000-a000-0000000000a2', id, 'available' from features where code = 'swing'")
        self._run_expect_abort(self.sql, "équipement")

    def test_abort_on_count_mismatch(self):
        self._run_expect_abort(_body(rb.build_rollback_sql(BATCH, 3, STARTED, "US")), "attendu")

    def test_abort_if_batch_parks_predate_import(self):
        self._run_expect_abort(_body(rb.build_rollback_sql(BATCH, 2, "2999-01-01T00:00:00Z", "US")), "hors périmètre")

    def test_abort_on_wrong_country(self):
        self._run_expect_abort(_body(rb.build_rollback_sql(BATCH, 2, STARTED, "FR")), "hors périmètre")


if __name__ == "__main__":
    unittest.main()
