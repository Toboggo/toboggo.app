#!/usr/bin/env python3
"""Adresses US (New York) — format, normalisation Geoapify/OSM, provenance, FR/ES inchangés.

Aucun appel réseau, aucun Geoapify. Les tests « DB » exigent la base LOCALE
(skip automatique sinon) et tournent dans une transaction ANNULÉE : jamais
staging/prod.
"""
import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import address  # noqa: E402
import naming  # noqa: E402
from geoapify import GeoapifyClient  # noqa: E402

try:
    import psycopg
except ImportError:  # pragma: no cover
    psycopg = None

CASES = json.loads((HERE / "tests" / "fixtures" / "address_format_cases.json").read_text(encoding="utf-8"))["cases"]
LOCAL_DSN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _parts(c):
    return {k: c[k] for k in ("address_line", "postal_code", "city", "admin_area_1")}


class TestFormatCases(unittest.TestCase):
    def test_every_shared_case(self):
        for c in CASES:
            with self.subTest(c["name"]):
                self.assertEqual(address.build_formatted_address(_parts(c), c["country_code"]), c["expected"])

    def test_default_without_country_is_the_historical_french_format(self):
        d = {"address_line": "12 Rue X", "postal_code": "31000", "city": "Toulouse", "admin_area_1": "Occitanie"}
        self.assertEqual(address.build_formatted_address(d), "12 Rue X, 31000 Toulouse")
        self.assertEqual(address.build_formatted_address(d, "FR"), "12 Rue X, 31000 Toulouse")
        self.assertEqual(address.build_formatted_address(d, "ES"), "12 Rue X, 31000 Toulouse")

    def test_us_case_insensitive_country(self):
        d = {"address_line": "1 Main St", "postal_code": "14201", "city": "Buffalo", "admin_area_1": "New York"}
        self.assertEqual(address.build_formatted_address(d, "us"), "1 Main St, Buffalo, NY 14201")


class TestUsHelpers(unittest.TestCase):
    def test_state_abbreviation_and_name(self):
        self.assertEqual(address.us_state_abbr("New York"), "NY")
        self.assertEqual(address.us_state_abbr("ny"), "NY")
        self.assertEqual(address.us_state_abbr("Ontario"), "Ontario")   # jamais inventé
        self.assertIsNone(address.us_state_abbr(None))
        self.assertEqual(address.us_state_name("NY"), "New York")
        self.assertEqual(address.us_state_name("district of columbia"), "District of Columbia")
        self.assertIsNone(address.us_state_name("Occitanie"))
        self.assertIsNone(address.us_state_name("Cataluña"))

    def test_street_abbreviation_is_conservative(self):
        a = address.abbreviate_us_street
        self.assertEqual(a("West 42nd Street"), "W 42nd St")
        self.assertEqual(a("North Moore Street"), "N Moore St")
        self.assertEqual(a("Park Avenue"), "Park Ave")
        self.assertEqual(a("West Street"), "West St")       # « West » est le nom, pas une direction
        self.assertEqual(a("Broadway"), "Broadway")
        self.assertEqual(a("Place"), "Place")                # le suffixe seul n'est pas abrégé
        self.assertIsNone(a(None))

    def test_state_table_complete(self):
        self.assertEqual(len(address.US_STATES), len({c for c, _ in address.US_STATES}))
        self.assertIn(("NY", "New York"), address.US_STATES)
        self.assertGreaterEqual(len(address.US_STATES), 51)


class TestOsmTags(unittest.TestCase):
    TAGS = {"addr:housenumber": "123", "addr:street": "West 42nd Street", "addr:postcode": "10036",
            "addr:city": "New York", "addr:state": "NY"}

    def test_us_full(self):
        self.assertEqual(address.extract_address_from_tags(self.TAGS, "US"), {
            "address_line": "123 W 42nd St", "postal_code": "10036", "city": "New York",
            "admin_area_1": "New York", "admin_area_2": None})

    def test_fr_es_unchanged_even_with_state_tag(self):
        fr = {"addr:housenumber": "12", "addr:street": "West Street", "addr:postcode": "31000", "addr:city": "Toulouse", "addr:state": "NY"}
        for cc in (None, "FR", "ES"):
            with self.subTest(cc):
                r = address.extract_address_from_tags(fr, cc)
                self.assertEqual(r["address_line"], "12 West Street")
                self.assertIsNone(r["admin_area_1"])

    def test_us_incomplete_addresses(self):
        self.assertEqual(address.extract_address_from_tags({"addr:city": "Albany"}, "US")["address_line"], None)
        self.assertEqual(address.extract_address_from_tags({"addr:street": "Elm Street"}, "US")["address_line"], "Elm St")
        r = address.extract_address_from_tags({"addr:housenumber": "5", "addr:postcode": "12207"}, "US")
        self.assertIsNone(r["address_line"])   # numéro sans rue : jamais d'adresse partielle trompeuse
        self.assertIsNone(address.extract_address_from_tags({"leisure": "playground"}, "US"))
        self.assertIsNone(address.extract_address_from_tags({"addr:state": "NY"}, "US"))   # l'État seul n'est pas une adresse

    def test_unrecognized_us_state_dropped(self):
        t = dict(self.TAGS, **{"addr:state": "Atlantis"})
        self.assertIsNone(address.extract_address_from_tags(t, "US")["admin_area_1"])


class TestGeoapifyExtract(unittest.TestCase):
    NYC = {"results": [{"housenumber": "123", "street": "West 42nd Street", "postcode": "10036", "city": "New York",
                        "state": "New York", "state_code": "NY", "county": "New York County", "suburb": "Manhattan",
                        "country_code": "us", "formatted": "123 West 42nd Street, New York, NY 10036, United States of America"}]}

    def test_us(self):
        r = GeoapifyClient._extract(self.NYC)
        self.assertEqual((r["address_line"], r["postal_code"], r["city"], r["admin_area_1"], r["admin_area_2"]),
                         ("123 W 42nd St", "10036", "New York", "New York", "New York County"))
        self.assertEqual((r["country_code"], r["neighbourhood"], r["state_code"]), ("US", "Manhattan", "NY"))

    def test_us_hamlet_and_neighbourhood_fallbacks(self):
        r = GeoapifyClient._extract({"results": [{"street": "Main Street", "hamlet": "Wading River", "neighbourhood": "Old Town", "country_code": "us"}]})
        self.assertEqual((r["address_line"], r["city"], r["neighbourhood"]), ("Main St", "Wading River", "Old Town"))

    def test_us_incomplete_still_rejected_when_empty(self):
        self.assertIsNone(GeoapifyClient._extract({"results": [{"state": "New York", "country_code": "us"}]}))
        self.assertIsNone(GeoapifyClient._extract({"results": []}))

    def test_fr_es_output_unchanged(self):
        fr = GeoapifyClient._extract({"results": [{"housenumber": "8", "street": "Avenue du Parc", "postcode": "69000", "city": "Lyon",
                                                   "state": "Auvergne-Rhône-Alpes", "county": "Rhône", "suburb": "Presqu'île", "hamlet": "H",
                                                   "state_code": "ARA", "country_code": "fr"}]})
        self.assertEqual((fr["address_line"], fr["city"], fr["admin_area_1"], fr["admin_area_2"]),
                         ("8 Avenue du Parc", "Lyon", "Auvergne-Rhône-Alpes", "Rhône"))
        self.assertEqual((fr["country_code"], fr["neighbourhood"], fr["state_code"]), ("FR", None, None))   # US seulement
        es = GeoapifyClient._extract({"results": [{"housenumber": "401", "street": "Carrer de Mallorca", "postcode": "08013", "city": "Barcelona", "country_code": "es"}]})
        self.assertEqual(es["address_line"], "401 Carrer de Mallorca")
        self.assertIsNone(GeoapifyClient._extract({"results": [{"street": "Rue X", "hamlet": "Hameau", "country_code": "fr"}]})["city"])


class TestBackfillProvenance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bf = _load("bf_us", "backfill-addresses.py")

    def test_flags(self):
        self.assertIn("sans_etat", self.bf.flag_result({"city": "X", "postal_code": "1", "address_line": "a", "admin_area_1": None}, "US"))
        self.assertNotIn("sans_etat", self.bf.flag_result({"city": "X", "postal_code": "1", "address_line": "a", "admin_area_1": None}, "FR"))
        self.assertEqual(self.bf.flag_result({"city": "X", "postal_code": "1", "address_line": "a", "admin_area_1": "New York"}, "US"), [])

    def test_fr_write_sql_unchanged_and_source_gates_kept(self):
        value = {"address_line": "12 Rue X", "postal_code": "31000", "city": "Toulouse", "admin_area_1": "Occitanie", "admin_area_2": "Haute-Garonne"}
        sql = self.bf.build_write_sql("11111111-1111-1111-1111-111111111111", value, None)
        self.assertEqual(json.loads(sql.split("::jsonb")[0].rsplit("'", 2)[-2].replace("''", "'")), value)
        self.assertNotIn("neighbourhood", sql)
        # provenance & priorités des sources : gates conservés (reverse_geocode, can_source_replace_attribute)
        self.assertIn("can_source_replace_attribute('11111111-1111-1111-1111-111111111111', 'address', 'reverse_geocode')", sql)
        self.assertIn("set_park_attribute_source", sql)
        self.assertIn("source_type='reverse_geocode'", sql)

    def test_us_provenance_carries_neighbourhood_but_columns_do_not(self):
        value = {"address_line": "123 W 42nd St", "postal_code": "10036", "city": "New York", "admin_area_1": "New York", "admin_area_2": "New York County"}
        prov = dict(value, neighbourhood="Manhattan", state_code="NY")
        sql = self.bf.build_write_sql("22222222-2222-2222-2222-222222222222", value, 0.9, prov)
        self.assertIn('"neighbourhood": "Manhattan"', sql)
        self.assertIn("admin_area_2='New York County'", sql)
        # les colonnes `parks` restent les 5 champs (aucune colonne quartier)
        self.assertNotIn("neighbourhood=", sql)


class TestNamesAndPlaceholders(unittest.TestCase):
    def test_generic_name_us_vs_fr(self):
        decode = lambda v: v.strip()
        self.assertEqual(naming.resolve_park_name(None, decode, "Playground"), ("Playground", False))
        self.assertEqual(naming.resolve_park_name(None, decode), ("Aire de jeux", False))
        self.assertEqual(naming.resolve_park_name("Tom Otterness Playground", decode, "Playground"), ("Tom Otterness Playground", True))

    def test_formatted_address_never_falls_back_to_name(self):
        # parc générique sans adresse : aucune adresse fabriquée (ni nom, ni « Playground »)
        self.assertIsNone(address.build_formatted_address({"address_line": None, "postal_code": None, "city": None, "admin_area_1": None}, "US"))
        self.assertIsNone(address.build_formatted_address({"address_line": None, "postal_code": None, "city": None, "admin_area_1": None}))


def _db_available():
    if psycopg is None:
        return False
    try:
        with psycopg.connect(LOCAL_DSN, connect_timeout=2) as c:
            c.execute("select 1")
        return True
    except Exception:
        return False


@unittest.skipUnless(_db_available(), "Supabase local injoignable (supabase start ?)")
class TestViewFormattedAddress(unittest.TestCase):
    """Migration 0049 appliquée dans une transaction ANNULÉE, jamais committée."""

    def test_view_matches_shared_cases_and_fr_es_unchanged(self):
        migration = (ROOT / "supabase" / "migrations" / "0049_formatted_address_us.sql").read_text(encoding="utf-8")
        with psycopg.connect(LOCAL_DSN) as conn:
            try:
                cur = conn.cursor()
                cur.execute("select md5(coalesce(string_agg(id::text || coalesce(formatted_address, '∅'), '|' order by id), '')) from park_public")
                before = cur.fetchone()[0]
                cur.execute(migration)
                # FR/ES : la vue renvoie EXACTEMENT les mêmes adresses qu'avant 0049
                cur.execute("select md5(coalesce(string_agg(id::text || coalesce(formatted_address, '∅'), '|' order by id), '')) from park_public")
                self.assertEqual(cur.fetchone()[0], before, "FR/ES : formatted_address modifié par 0049")
                # idempotence : seconde application sans erreur
                cur.execute(migration)
                # table des États : SQL == Python (nom → code, code → code, inconnu inchangé)
                for code, name in address.US_STATES:
                    cur.execute("select us_state_abbr(%s), us_state_abbr(%s), us_state_abbr(%s)", (name, code.lower(), name.upper()))
                    self.assertEqual(cur.fetchone(), (code, code, code), name)
                cur.execute("select us_state_abbr('Ontario'), us_state_abbr(''), us_state_abbr(null)")
                self.assertEqual(cur.fetchone(), ("Ontario", None, None))
                for i, c in enumerate(CASES):
                    cur.execute(
                        "insert into parks (name, latitude, longitude, country_code, timezone, moderation_status, "
                        "address_line, postal_code, city, admin_area_1) "
                        "values (%s, 40.7, -73.9, %s, 'America/New_York', 'published', %s, %s, %s, %s) returning id",
                        (f"zzz_fmt_{i}", c["country_code"], c["address_line"], c["postal_code"], c["city"], c["admin_area_1"]),
                    )
                    pid = cur.fetchone()[0]
                    cur.execute("select formatted_address from park_public where id = %s", (pid,))
                    self.assertEqual(cur.fetchone()[0], c["expected"], c["name"])
            finally:
                conn.rollback()


def _strip_tx(sql):
    import re
    sql = re.sub(r"(?m)^begin;\s*$", "", sql, count=1)
    return re.sub(r"(?m)^commit;\s*$", "", sql)


@unittest.skipUnless(_db_available(), "Supabase local injoignable (supabase start ?)")
class TestApplyAndRollbackScripts(unittest.TestCase):
    """Scripts manuels 0049 (apply + rollback) : vue, droits, propriétaire, options restaurés
    EXACTEMENT, y compris avec une ACL / un commentaire propres à l'environnement."""

    META = ("select md5(pg_get_viewdef('public.park_public'::regclass, true)), c.relowner::regrole::text, "
            "coalesce(c.relacl::text, ''), coalesce(c.reloptions::text, ''), coalesce(obj_description(c.oid, 'pg_class'), '') "
            "from pg_class c where c.oid = 'public.park_public'::regclass")

    def _roundtrip(self, prepare_sql=""):
        apply_sql = _strip_tx((ROOT / "supabase" / "manual" / "0049_apply_in_transaction.sql").read_text(encoding="utf-8"))
        rollback_sql = _strip_tx((ROOT / "supabase" / "manual" / "0049_rollback.sql").read_text(encoding="utf-8"))
        with psycopg.connect(LOCAL_DSN) as conn:
            try:
                cur = conn.cursor()
                if prepare_sql:
                    cur.execute(prepare_sql)
                cur.execute(self.META); before = cur.fetchone()
                cur.execute(apply_sql)
                cur.execute(self.META); applied = cur.fetchone()
                self.assertNotEqual(applied[0], before[0])          # la vue a bien changé…
                self.assertEqual(applied[1:], before[1:])           # …mais pas propriétaire / droits / options / commentaire
                cur.execute("select count(*) from supabase_migrations.schema_migrations where version = '0049'")
                self.assertEqual(cur.fetchone()[0], 1)
                cur.execute(rollback_sql)
                cur.execute(self.META); after = cur.fetchone()
                self.assertEqual(after, before)                     # restauration EXACTE
                cur.execute("select count(*) from pg_proc where proname = 'us_state_abbr'")
                self.assertEqual(cur.fetchone()[0], 0)
            finally:
                conn.rollback()

    def test_default_environment(self):
        self._roundtrip()

    def test_environment_specific_acl_and_comment_preserved(self):
        self._roundtrip("comment on view public.park_public is 'zzz env specific'; grant insert on public.park_public to service_role;")

    def test_rollback_refuses_when_not_applied_or_view_modified(self):
        rollback_sql = _strip_tx((ROOT / "supabase" / "manual" / "0049_rollback.sql").read_text(encoding="utf-8"))
        with psycopg.connect(LOCAL_DSN) as conn:
            try:
                with self.assertRaisesRegex(psycopg.errors.RaiseException, "non enregistrée"):
                    with conn.transaction():
                        conn.execute(rollback_sql)
            finally:
                conn.rollback()


if __name__ == "__main__":
    unittest.main()
