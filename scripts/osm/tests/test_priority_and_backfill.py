#!/usr/bin/env python3
"""Tests d'intégration — priorité des sources et idempotence du backfill.

Nécessitent la base Supabase LOCALE (docker, `supabase start`) avec les
migrations 0001-0029 appliquées. Ignorés automatiquement (skip, pas
d'échec) si injoignables — jamais exécutés contre staging/prod.

Chaque test crée son propre parc jetable (préfixe de nom distinctif) et le
supprime en fin de test (cascade sur park_sources/park_attribute_sources) :
aucune interférence avec les 2201 parcs réels importés en local.

Lancer : python3 -m unittest scripts.osm.tests.test_priority_and_backfill -v
"""
import importlib.util
import json
import sys
import unittest
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import address  # noqa: E402

try:
    import psycopg
except ImportError:
    psycopg = None

LOCAL_DSN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
TEST_NAME_PREFIX = "__test_address_chantier__"


def _local_db_available() -> bool:
    if psycopg is None:
        return False
    try:
        with psycopg.connect(LOCAL_DSN, connect_timeout=2) as conn:
            with conn.cursor() as cur:
                cur.execute("select 1")
        return True
    except Exception:
        return False


def _load_backfill_module():
    spec = importlib.util.spec_from_file_location(
        "backfill_addresses", HERE / "backfill-addresses.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_DB_AVAILABLE = _local_db_available()


@unittest.skipUnless(_DB_AVAILABLE, "Supabase local injoignable (supabase start ?)")
class TestSourcePriorityLadder(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn = psycopg.connect(LOCAL_DSN)

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def _priority(self, source_type):
        with self.conn.cursor() as cur:
            cur.execute("select source_priority(%s::source_type)", (source_type,))
            return cur.fetchone()[0]

    def test_reverse_geocode_enum_value_exists(self):
        with self.conn.cursor() as cur:
            cur.execute(
                """
                select exists (
                  select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'source_type' and e.enumlabel = 'reverse_geocode'
                )
                """
            )
            self.assertTrue(cur.fetchone()[0])

    def test_priority_ladder_order(self):
        self.assertGreater(self._priority("toboggo"), self._priority("municipality"))
        self.assertGreater(self._priority("municipality"), self._priority("open_data"))
        self.assertGreater(self._priority("open_data"), self._priority("partner"))
        self.assertGreater(self._priority("partner"), self._priority("osm"))
        # Le coeur de la décision d'architecture de ce chantier :
        self.assertGreater(self._priority("osm"), self._priority("reverse_geocode"))
        self.assertGreater(self._priority("reverse_geocode"), self._priority("user"))
        self.assertGreater(self._priority("user"), self._priority("other"))

    def test_reverse_geocode_priority_is_45(self):
        self.assertEqual(self._priority("reverse_geocode"), 45)


@unittest.skipUnless(_DB_AVAILABLE, "Supabase local injoignable (supabase start ?)")
class TestAddressSourcePriorityProtection(unittest.TestCase):
    """Reproduit le scénario central : une adresse vérifiée par une source
    prioritaire (osm ou toboggo) ne doit jamais être écrasée par une source
    de priorité inférieure (reverse_geocode)."""

    def setUp(self):
        self.conn = psycopg.connect(LOCAL_DSN)
        self.park_id = str(uuid.uuid4())
        with self.conn.cursor() as cur:
            cur.execute(
                """
                insert into parks (id, name, latitude, longitude, country_code,
                    timezone, moderation_status, verification_status)
                values (%s, %s, 43.6, 1.4, 'FR', 'Europe/Paris', 'pending', 'unverified')
                """,
                (self.park_id, f"{TEST_NAME_PREFIX} priority"),
            )
        self.conn.commit()

    def tearDown(self):
        self.conn.rollback()  # au cas où un test précédent aurait laissé une transaction avortée
        with self.conn.cursor() as cur:
            cur.execute("delete from parks where id = %s::uuid", (self.park_id,))
        self.conn.commit()
        self.conn.close()

    def _set_source_address(self, source_type, value: dict, confidence=0.7):
        with self.conn.cursor() as cur:
            cur.execute(
                "insert into park_sources (park_id, source_type, source_name) "
                "values (%s::uuid, %s::source_type, %s) returning id",
                (self.park_id, source_type, f"test-{source_type}"),
            )
            source_id = cur.fetchone()[0]
            cur.execute(
                "select set_park_attribute_source(%s::uuid, 'address', %s::jsonb, %s::uuid, %s::numeric, null)",
                (self.park_id, json.dumps(value), source_id, confidence),
            )
        self.conn.commit()

    def _can_replace(self, incoming_source_type):
        with self.conn.cursor() as cur:
            cur.execute(
                "select can_source_replace_attribute(%s::uuid, 'address', %s::source_type)",
                (self.park_id, incoming_source_type),
            )
            return cur.fetchone()[0]

    def test_osm_address_blocks_reverse_geocode(self):
        self._set_source_address("osm", {"address_line": "Rue Ramond"})
        self.assertFalse(self._can_replace("reverse_geocode"))
        # OSM peut toujours se remplacer lui-même (ré-import).
        self.assertTrue(self._can_replace("osm"))

    def test_toboggo_address_blocks_osm_and_reverse_geocode(self):
        self._set_source_address("toboggo", {"city": "Ville Verifiee"}, confidence=1.0)
        self.assertFalse(self._can_replace("osm"))
        self.assertFalse(self._can_replace("reverse_geocode"))

    def test_no_existing_source_allows_reverse_geocode(self):
        # Aucune adresse enregistrée -> priorité courante = 0 -> tout passe.
        self.assertTrue(self._can_replace("reverse_geocode"))
        self.assertTrue(self._can_replace("osm"))

    def test_reverse_geocode_does_not_block_future_osm_tag(self):
        self._set_source_address("reverse_geocode", {"city": "Devinee"}, confidence=0.5)
        self.assertTrue(self._can_replace("osm"))
        self.assertTrue(self._can_replace("municipality"))
        self.assertFalse(self._can_replace("user"))


@unittest.skipUnless(_DB_AVAILABLE, "Supabase local injoignable (supabase start ?)")
class TestBackfillWriteIdempotency(unittest.TestCase):
    """Vérifie que build_write_sql() de backfill-addresses.py est repris/
    idempotent : exécuter deux fois la même écriture ne duplique rien."""

    def setUp(self):
        self.backfill = _load_backfill_module()
        self.conn = psycopg.connect(LOCAL_DSN)
        self.park_id = str(uuid.uuid4())
        with self.conn.cursor() as cur:
            cur.execute(
                """
                insert into parks (id, name, latitude, longitude, country_code,
                    timezone, moderation_status, verification_status)
                values (%s, %s, 43.6, 1.4, 'FR', 'Europe/Paris', 'pending', 'unverified')
                """,
                (self.park_id, f"{TEST_NAME_PREFIX} backfill"),
            )
        self.conn.commit()

    def tearDown(self):
        self.conn.rollback()
        with self.conn.cursor() as cur:
            cur.execute("delete from parks where id = %s::uuid", (self.park_id,))
        self.conn.commit()
        self.conn.close()

    def _run_write(self, value, confidence=0.6):
        sql = self.backfill.build_write_sql(self.park_id, value, confidence)
        with self.conn.cursor() as cur:
            cur.execute(sql)
        self.conn.commit()

    def _address_source_row_count(self):
        with self.conn.cursor() as cur:
            cur.execute(
                "select count(*) from park_attribute_sources "
                "where park_id = %s and attribute_key = 'address'",
                (self.park_id,),
            )
            return cur.fetchone()[0]

    def test_repeated_identical_write_creates_one_row(self):
        value = {
            "address_line": "1 Rue Test", "postal_code": "31000",
            "city": "Toulouse", "admin_area_1": None, "admin_area_2": None,
        }
        self._run_write(value)
        self._run_write(value)
        self._run_write(value)
        self.assertEqual(self._address_source_row_count(), 1)

    def test_write_actually_updates_parks_columns(self):
        value = {
            "address_line": "1 Rue Test", "postal_code": "31000",
            "city": "Toulouse", "admin_area_1": "Occitanie", "admin_area_2": "Haute-Garonne",
        }
        self._run_write(value)
        with self.conn.cursor() as cur:
            cur.execute(
                "select address_line, postal_code, city, admin_area_1, admin_area_2 "
                "from parks where id = %s",
                (self.park_id,),
            )
            row = cur.fetchone()
        self.assertEqual(row, ("1 Rue Test", "31000", "Toulouse", "Occitanie", "Haute-Garonne"))

    def test_write_refused_when_higher_priority_source_present(self):
        with self.conn.cursor() as cur:
            cur.execute(
                "insert into park_sources (park_id, source_type, source_name) "
                "values (%s, 'toboggo', 'test') returning id",
                (self.park_id,),
            )
            source_id = cur.fetchone()[0]
            cur.execute(
                "update parks set address_line = 'Adresse Verifiee' where id = %s",
                (self.park_id,),
            )
            cur.execute(
                "select set_park_attribute_source(%s::uuid, 'address', "
                "'{\"address_line\":\"Adresse Verifiee\"}'::jsonb, %s::uuid, 1.0, null)",
                (self.park_id, source_id),
            )
        self.conn.commit()

        self._run_write({
            "address_line": "Adresse Devinee", "postal_code": None,
            "city": None, "admin_area_1": None, "admin_area_2": None,
        })

        with self.conn.cursor() as cur:
            cur.execute("select address_line from parks where id = %s", (self.park_id,))
            self.assertEqual(cur.fetchone()[0], "Adresse Verifiee")


if __name__ == "__main__":
    unittest.main()
