#!/usr/bin/env python3
"""Tests de régression — parsing de la sortie `supabase db query`.

Historique des pannes (toutes AVANT la sélection des candidats, donc
0 écriture, garde-fous jamais atteints) :

1. `json.loads(out[out.index('{'):])` → `JSONDecodeError: Extra data` dès
   qu'un suffixe non-JSON suit le résultat (notice CLI, résumé de fin…).
2. Après 1er correctif (objets `{...}` uniquement) : la CLI de l'opérateur
   renvoie un **tableau JSON racine** `[{...}, ...]` — rejeté à tort.

Formats désormais acceptés (avec préambule/suffixe éventuels) :
  - tableau racine :   [ {...}, {...} ]
  - enveloppe :        { "rows": [...] }
  - stream-json :      { "data": { "rows": [...] } }

Aucun réseau, aucune base : on teste `_extract_rows` (fonction pure).
Lancer : python3 -m unittest scripts.osm.tests.test_remote_sql_parsing -v
"""
import importlib.util
import json
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]


def _load_backfill_module():
    spec = importlib.util.spec_from_file_location(
        "backfill_addresses", HERE / "backfill-addresses.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bf = _load_backfill_module()
extract = bf._extract_rows

ROWS = [
    {"id": "002261c9-dc90-489f-a0ac-0b30a20725c9", "latitude": "43.682779", "longitude": "1.585630"},
    {"id": "9c5cc359-a528-4ab2-ba09-561f9d26186e", "latitude": "44.02", "longitude": "1.35"},
]

# --- formats de sortie ---------------------------------------------------
ROOT_ARRAY = json.dumps(ROWS)                                   # panne #2 : tableau racine
ENVELOPE = json.dumps({"boundary": "abc", "rows": ROWS, "warning": "untrusted data"})
STREAM_JSON = json.dumps({"type": "result", "data": json.loads(ENVELOPE),
                          "timestamp": "2026-09-05T20:47:59Z"})

# --- bruits d'entourage ------------------------------------------------
PREAMBLE = "Initialising login role...\nConnecting to remote database...\n"
UPDATE_NOTICE = ("\nA new version of Supabase CLI is available: v2.999.0\n"
                 "We recommend updating: https://supabase.com/docs/guides/cli\n")
SUMMARY = "\nExecuted 1 statement.\n"


class TestExtractRows(unittest.TestCase):
    def _assert_ok(self, rows):
        self.assertIsInstance(rows, list)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["id"], "002261c9-dc90-489f-a0ac-0b30a20725c9")
        self.assertEqual(rows[1]["latitude"], "44.02")

    # ---- panne #2 : tableau JSON racine (format exact observé) --------
    def test_root_array_exact_observed_format(self):
        stdout = '[{"id": "002261c9-dc90-489f-a0ac-0b30a20725c9", "latitude": "43.682779", "longitude": "1.585630"}, {"id": "9c5cc359-a528-4ab2-ba09-561f9d26186e", "latitude": "44.02", "longitude": "1.35"}]'
        self._assert_ok(extract(stdout))

    def test_root_array_with_preamble_and_suffix(self):
        self._assert_ok(extract(PREAMBLE + ROOT_ARRAY + UPDATE_NOTICE + SUMMARY))

    def test_root_array_multiline(self):
        self._assert_ok(extract("[\n  " + ",\n  ".join(json.dumps(r) for r in ROWS) + "\n]\n"))

    def test_root_empty_array(self):
        self.assertEqual(extract("[]\n"), [])
        self.assertEqual(extract(PREAMBLE + "[]" + SUMMARY), [])

    # ---- panne #1 : enveloppe + données en trop ----------------------
    def test_reproduces_extra_data_bug_then_fixes_it(self):
        stdout = ENVELOPE + UPDATE_NOTICE
        start = stdout.index("{")
        with self.assertRaises(json.JSONDecodeError) as ctx:
            json.loads(stdout[start:])  # implémentation d'origine
        self.assertIn("Extra data", str(ctx.exception))
        self._assert_ok(extract(stdout))

    # ---- enveloppe classique ---------------------------------------
    def test_envelope_clean(self):
        self._assert_ok(extract(ENVELOPE))

    def test_envelope_with_preamble_and_suffix(self):
        self._assert_ok(extract(PREAMBLE + ENVELOPE + UPDATE_NOTICE + SUMMARY))

    def test_envelope_pretty_printed(self):
        self._assert_ok(extract(PREAMBLE + json.dumps(json.loads(ENVELOPE), indent=2) + SUMMARY))

    # ---- stream-json (rows sous data) -----------------------------
    def test_stream_json_wrapper(self):
        self._assert_ok(extract(STREAM_JSON))

    def test_stream_json_with_noise(self):
        self._assert_ok(extract('{"type":"start"}\n' + STREAM_JSON + '\n{"type":"end"}\n'))

    # ---- objets/brackets parasites avant le vrai résultat ---------
    def test_skips_leading_bracket_noise(self):
        self._assert_ok(extract("[INFO] connecting\n[warn] slow\n" + ROOT_ARRAY))

    def test_skips_leading_unrelated_json_object(self):
        self._assert_ok(extract('{"type":"progress","pct":10}\n' + ENVELOPE))

    # ---- erreurs -------------------------------------------------
    def test_no_recognised_format_raises(self):
        with self.assertRaises(bf.RemoteSQLError):
            extract("permission denied for table parks\n")

    def test_empty_stdout_raises(self):
        with self.assertRaises(bf.RemoteSQLError):
            extract("")

    def test_error_message_is_bounded(self):
        try:
            extract("z" * 5000)
        except bf.RemoteSQLError as e:
            self.assertLessEqual(len(str(e)), 400)
        else:
            self.fail("RemoteSQLError attendu")


class TestRowsFromJsonValue(unittest.TestCase):
    def test_list_returned_as_is(self):
        self.assertEqual(bf._rows_from_json_value([1, 2]), [1, 2])

    def test_dict_with_rows(self):
        self.assertEqual(bf._rows_from_json_value({"rows": [{"a": 1}]}), [{"a": 1}])

    def test_dict_with_data_rows(self):
        self.assertEqual(bf._rows_from_json_value({"data": {"rows": [{"a": 1}]}}), [{"a": 1}])

    def test_unrelated_dict_returns_none(self):
        self.assertIsNone(bf._rows_from_json_value({"type": "progress"}))

    def test_scalar_returns_none(self):
        self.assertIsNone(bf._rows_from_json_value("hello"))
        self.assertIsNone(bf._rows_from_json_value(42))


if __name__ == "__main__":
    unittest.main()
