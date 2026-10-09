#!/usr/bin/env python3
"""Tests purs (aucun réseau, aucune base) : libellé de remplissage des parcs
sans nom OSM, mapping équipements US (swings / swing set / multi-valeur) et
configuration région New York."""
import importlib.util
import json
import re
import sys
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import equipment  # noqa: E402
import naming  # noqa: E402


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


local = _load("osm_local_naming", "import-osm-local.py")
remote = _load("osm_remote_naming", "import-osm-remote.py")
MAPPING = json.loads((HERE / "mappings" / "playground-v1.json").read_text(encoding="utf-8"))
REGIONS = json.loads((HERE / "regions.json").read_text(encoding="utf-8"))["regions"]


class TestResolveParkName(unittest.TestCase):
    def test_real_name_is_kept_and_flagged(self):
        self.assertEqual(
            naming.resolve_park_name("Central Park", local.decode_osm_value),
            ("Central Park", True),
        )

    def test_missing_name_uses_default_placeholder_not_osm(self):
        self.assertEqual(
            naming.resolve_park_name(None, local.decode_osm_value),
            ("Aire de jeux", False),
        )

    def test_missing_name_uses_region_placeholder(self):
        self.assertEqual(
            naming.resolve_park_name(None, local.decode_osm_value, "Playground"),
            ("Playground", False),
        )

    def test_blank_or_garbage_name_is_not_a_real_osm_name(self):
        for raw in ("", "   ", "%", " % "):
            with self.subTest(raw=raw):
                self.assertEqual(
                    naming.resolve_park_name(raw, local.decode_osm_value, "Playground"),
                    ("Playground", False),
                )

    def test_real_name_ignores_placeholder(self):
        self.assertEqual(
            naming.resolve_park_name("Aire de jeux Robespierre", local.decode_osm_value, "Playground"),
            ("Aire de jeux Robespierre", True),
        )


class TestRemoteCandidatesNaming(unittest.TestCase):
    """`build_candidates` (chemin STAGING/PROD) avec osmium simulé."""

    FEATURES = [
        {"properties": {"@type": "node", "@id": 1, "leisure": "playground", "name": "Prospect Park Playground"},
         "geometry": {"type": "Point", "coordinates": [-73.97, 40.66]}},
        {"properties": {"@type": "way", "@id": 2, "leisure": "playground"},
         "geometry": {"type": "Point", "coordinates": [-73.9, 40.7]}},
    ]

    def _candidates(self, placeholder=None):
        def fake_run(cmd, **kw):
            if "export" in cmd:
                out = Path(cmd[cmd.index("-o") + 1])
                out.write_text("\n".join(json.dumps(f) for f in self.FEATURES), encoding="utf-8")

        with mock.patch.object(remote.subprocess, "run", side_effect=fake_run), \
             mock.patch.object(local, "load_mapping", return_value=MAPPING):
            args = (Path("x.pbf"), local) + ((placeholder,) if placeholder else ())
            cands, _, _ = remote.build_candidates(*args)
        return {c["osm_id"]: c for c in cands}

    def test_default_placeholder_keeps_fr_es_behaviour(self):
        c = self._candidates()
        self.assertEqual((c["1"]["name"], c["1"]["has_osm_name"]), ("Prospect Park Playground", True))
        self.assertEqual((c["2"]["name"], c["2"]["has_osm_name"]), ("Aire de jeux", False))

    def test_us_placeholder_never_flagged_as_osm_name(self):
        c = self._candidates("Playground")
        self.assertEqual((c["2"]["name"], c["2"]["has_osm_name"]), ("Playground", False))
        unnamed = remote.park_sql(c["2"], False, "US", "America/New_York")
        named = remote.park_sql(c["1"], False, "US", "America/New_York")
        # le libellé est inséré (parks.name NOT NULL) mais sans provenance 'osm'
        self.assertIn("'Playground'", unnamed)
        self.assertNotIn("set_park_attribute_source(\n      v_park_id, 'name'", unnamed)
        # un vrai nom OSM, lui, enregistre sa provenance
        self.assertIn("set_park_attribute_source(\n      v_park_id, 'name'", named)


class TestEquipmentMapping(unittest.TestCase):
    def m(self, raw):
        return local.map_playground_features(raw, MAPPING)

    def test_swings_and_swing_set_map_to_swing(self):
        self.assertEqual(self.m("swings"), ["swing"])
        self.assertEqual(self.m("swing set"), ["swing"])
        self.assertEqual(self.m("swing  set"), ["swing"])  # artefact de décodage OPL

    def test_existing_mappings_unchanged(self):
        self.assertEqual(self.m("swing"), ["swing"])
        self.assertEqual(self.m("slide;swing;climbingframe"), ["slide", "swing", "climbing"])
        self.assertEqual(self.m("splash_pad"), ["water_play"])

    def test_ambiguous_free_text_values_are_not_mapped(self):
        for raw in ("map", "chessboard", "water pump", "exercise", "tic-tac-toe"):
            with self.subTest(raw=raw):
                self.assertEqual(self.m(raw), [])

    def test_comma_multivalue_only_split_when_all_tokens_known(self):
        # teenshelter ignoré, slide direct, climbingwall normalisé
        self.assertEqual(self.m("teenshelter, slide, climbingwall"), ["slide", "climbing"])
        self.assertEqual(self.m("teenshelter,   slide,   climbingwall"), ["slide", "climbing"])
        # un jeton inconnu ⇒ segment laissé intact, rien n'est deviné
        self.assertEqual(self.m("slide, hoverboard"), [])

    def test_split_helper(self):
        self.assertEqual(
            equipment.split_playground_values("slide;swing; ", MAPPING), ["slide", "swing"]
        )
        self.assertEqual(
            equipment.split_playground_values("slide, hoverboard", MAPPING), ["slide, hoverboard"]
        )


class TestRegionsConfig(unittest.TestCase):
    def test_new_york_region(self):
        ny = REGIONS["new-york"]
        self.assertEqual(ny["country_code"], "US")
        self.assertEqual(ny["timezone"], "America/New_York")
        self.assertEqual(ny["placeholder_name"], "Playground")

    def test_fr_es_have_no_placeholder_override(self):
        for key in ("midi-pyrenees", "france", "spain"):
            self.assertNotIn("placeholder_name", REGIONS[key])

    def test_every_placeholder_is_a_generic_name_known_to_the_app(self):
        """Un libellé de remplissage absent de GENERIC_NAMES (parkName.ts)
        serait affiché tel quel comme un vrai nom : interdit."""
        ts = (ROOT / "packages/shared/src/utils/parkName.ts").read_text(encoding="utf-8")
        block = re.search(r"const GENERIC_NAMES = \[(.*?)\] as const", ts, re.S).group(1)
        generics = {
            re.sub(r"[̀-ͯ]", "", __import__("unicodedata").normalize("NFD", s)).lower()
            for s in re.findall(r'"([^"]+)"', block)
        }
        placeholders = {naming.DEFAULT_PLACEHOLDER_NAME} | {
            r["placeholder_name"] for r in REGIONS.values() if "placeholder_name" in r
        }
        for p in placeholders:
            with self.subTest(placeholder=p):
                self.assertIn(p.lower(), generics)

    def test_osm_py_forwards_placeholder_only_when_configured(self):
        osm = _load("osm_cli", "osm.py")
        for region, expected in (("new-york", True), ("spain", False)):
            with self.subTest(region=region):
                cmds = []
                with mock.patch.object(osm, "resolve_pbf", return_value=Path("x.pbf")), \
                     mock.patch.object(osm, "run", side_effect=cmds.append), \
                     mock.patch.object(sys, "argv", ["osm.py", "import-local", region]):
                    osm.main()
                flat = [str(x) for x in cmds[0]]
                self.assertEqual("--placeholder-name" in flat, expected)
                if expected:
                    self.assertEqual(flat[flat.index("--placeholder-name") + 1], "Playground")


if __name__ == "__main__":
    unittest.main()
