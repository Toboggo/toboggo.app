#!/usr/bin/env python3
"""Pilote Geoapify US : sécurité d'écriture et contrôles avant/après (aucun réseau, aucune base)."""
import importlib.util
import inspect
import json
import re
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


chk = _load("pilot_check", "geoapify-pilot-check.py")
bf = _load("bf_pilot", "backfill-addresses.py")

PARK = "11111111-1111-1111-1111-111111111111"
US_VALUE = {"address_line": "123 W 42nd St", "postal_code": "10036", "city": "New York", "admin_area_1": "New York", "admin_area_2": "New York County"}


class TestWriteSafety(unittest.TestCase):
    """Le pilote ne peut modifier ni statut, ni nom, ni coordonnées ; il ne touche que le parc ciblé."""

    def setUp(self):
        self.sql = bf.build_write_sql(PARK, US_VALUE, 0.9, dict(US_VALUE, neighbourhood="Manhattan", state_code="NY"))

    def test_updates_only_address_columns_of_the_target_park(self):
        updates = re.findall(r"update (\w+) set(.*?)where (.*?);", self.sql, re.S)
        tables = {u[0] for u in updates}
        self.assertEqual(tables, {"park_sources", "parks"})
        parks_set = [u for u in updates if u[0] == "parks"][0]
        cols = set(re.findall(r"(\w+)=", parks_set[1]))
        self.assertEqual(cols, {"address_line", "postal_code", "city", "admin_area_1", "admin_area_2", "updated_at"})
        for table, _s, where in updates:
            # parks : filtré sur l'id du parc ; park_sources : sur la source du MÊME parc (v_source_id, sélectionnée par park_id)
            self.assertIn(PARK if table == "parks" else "v_source_id", where)
        self.assertIn(f"where park_id='{PARK}' and source_type='reverse_geocode'", self.sql)

    def test_never_touches_publication_or_identity_columns(self):
        for forbidden in ("moderation_status", "verification_status", "operational_status", "status=", "name=", "latitude=", "longitude=",
                          "country_code=", "created_by", "delete ", "truncate", "drop ", "insert into parks"):
            self.assertNotIn(forbidden, self.sql, forbidden)
        self.assertEqual(set(re.findall(r"insert into (\w+)", self.sql)), {"park_sources"})

    def test_source_priority_gates_kept(self):
        self.assertIn(f"can_source_replace_attribute('{PARK}', 'address', 'reverse_geocode')", self.sql)
        self.assertIn("set_park_attribute_source", self.sql)

    def test_candidate_selection_is_read_only_and_excludes_processed_or_protected(self):
        sel = bf.SELECT_CANDIDATES_SQL.format(country_filter="and country_code = 'US'", limit=25)
        self.assertRegex(sel.strip(), r"^select ")
        self.assertNotRegex(sel, r"\b(insert|update|delete|drop)\b", )
        self.assertIn("can_source_replace_attribute(id, 'address', 'reverse_geocode')", sel)
        self.assertIn("not exists", sel)
        self.assertIn("order by id", sel)
        self.assertIn("limit 25", sel)

    def test_staging_env_targets_staging_and_prod_is_gated(self):
        src = (HERE / "backfill-addresses.py").read_text(encoding="utf-8")
        self.assertRegex(src, r'elif args\.env == "staging":\s*conn = RemoteConn\(STAGING_PROJECT_REF')
        self.assertEqual(bf.STAGING_PROJECT_REF, "hfuaouskwysqxiwpwvqy")
        self.assertNotEqual(bf.STAGING_PROJECT_REF, bf.PROD_PROJECT_REF)
        with self.assertRaises(SystemExit):     # staging n'est jamais accepté comme cible prod
            bf.confirm_prod_commit(bf.STAGING_PROJECT_REF, 25, flag_ack=True)

    def test_check_script_is_read_only(self):
        src = inspect.getsource(chk)
        for sql in re.findall(r'ro\(f?"([^"]+)"', src) + re.findall(r'snap\.ro\(f?"([^"]+)"', src):
            chk.snap.assert_read_only(re.sub(r"\{[^}]*\}", "x", sql))
        with self.assertRaises(ValueError):
            chk.snap.assert_read_only("update parks set name='x'")


class TestAddressQualityFlags(unittest.TestCase):
    def test_zip(self):
        for z in (None, "10036", "10016-1234"):
            self.assertTrue(chk.zip_valid(z), z)
        for z in ("1003", "100360", "ABCDE", "10036-12", ""):
            self.assertFalse(chk.zip_valid(z), z)

    def test_poi_heuristic_flags_place_names_not_streets(self):
        for poi in ("Prospect Park", "Tom Otterness Playground", "Parc des Merlettes", "Camping Le Roquelongue", "Lou Jassou"):
            self.assertTrue(chk.looks_like_poi(poi), poi)
        for street in ("123 W 42nd St", "FDR Dr", "Broadway", "Haskell Ave", "5-28 49th Ave", "W Ride Rd", "Knickerbocker Ave", "Pierrepont St @ Pierreont Pl"):
            self.assertFalse(chk.looks_like_poi(street), street)
        self.assertFalse(chk.looks_like_poi(None))

    def test_flags(self):
        ok = {"address_line": "123 W 42nd St", "postal_code": "10036", "city": "New York", "admin_area_1": "New York"}
        self.assertEqual(chk.flags_for(ok), [])
        self.assertIn("sans_etat", chk.flags_for(dict(ok, admin_area_1=None)))
        self.assertIn("etat_hors_NY", chk.flags_for(dict(ok, admin_area_1="Georgia")))
        self.assertIn("etat_non_reconnu", chk.flags_for(dict(ok, admin_area_1="Atlantis")))
        self.assertIn("zip_invalide", chk.flags_for(dict(ok, postal_code="1003")))
        self.assertIn("sans_ville", chk.flags_for(dict(ok, city=None)))
        self.assertIn("sans_rue", chk.flags_for(dict(ok, address_line=None)))
        self.assertIn("rue_ressemble_a_un_POI", chk.flags_for(dict(ok, address_line="Prospect Park")))


class TestLogParsing(unittest.TestCase):
    LOG = """[OK]      aaaa  (1, 2)
         -> 1 Main St, Albany, NY 12207  (confiance=n/a)
[SUSPECT] bbbb  (1, 2)
         -> Park Name  (confiance=n/a)
         signalé : sans_numero_rue
[VIDE]    cccc  (1, 2)  — Geoapify sans résultat exploitable
[ERREUR] dddd  (1, 2)
         timeout
RÉSUMÉ
------
  Traités        : 4
  Écrits         : 2
  Sans résultat  : 1
  Erreurs        : 1
  Signalés       : 1  (à relire)
"""

    def test_counts(self):
        r = chk.parse_log(self.LOG)
        self.assertEqual(r["lignes"], {"OK": 1, "SUSPECT": 1, "VIDE": 1, "ERREUR": 1})
        self.assertEqual((r["traites"], r["ecrits"], r["sans_resultat"], r["erreurs"], r["signales"]), (4, 2, 1, 1, 1))
        self.assertEqual(r["appels_geoapify_estimes"], 4)


class TestHash(unittest.TestCase):
    def test_hash_is_order_independent_and_sensitive(self):
        a = [{"id": "1", "x": "a"}, {"id": "2", "x": "b"}]
        self.assertEqual(chk.h(a, ["id", "x"]), chk.h(list(reversed(a)), ["id", "x"]))
        self.assertNotEqual(chk.h(a, ["id", "x"]), chk.h([a[0], {"id": "2", "x": "c"}], ["id", "x"]))


if __name__ == "__main__":
    unittest.main()
