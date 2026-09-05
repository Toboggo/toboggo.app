#!/usr/bin/env python3
"""Tests de régression — parsing de la sortie `supabase db query`.

Contexte : un premier lancement `--commit --env prod` a échoué AVANT la
sélection des candidats (donc 0 écriture) sur :

    json.decoder.JSONDecodeError: Extra data: line 5 column 4
    run_remote_sql() -> json.loads(out[start:])

Cause : `run_remote_sql` faisait `json.loads(stdout[stdout.index('{'):])`,
ce qui suppose que l'objet résultat est la SEULE chose sur stdout. Selon la
version de la CLI / la détection d'un TTY / une notice de mise à jour / le
mode stream-json, `supabase db query` peut ajouter du texte ou d'autres
objets JSON avant ET après le résultat → « Extra data ».

Aucun réseau, aucune base : on teste la fonction pure `_extract_result_object`.
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
extract = bf._extract_result_object

# Objet résultat « normal » de `supabase db query`, tel qu'observé.
ENVELOPE = """{
  "boundary": "bba338f1d371c0c04bec46527558ef31",
  "rows": [
    { "id": "002261c9-dc90-489f-a0ac-0b30a20725c9", "latitude": 43.68, "longitude": 1.58 },
    { "id": "9c5cc359-a528-4ab2-ba09-561f9d26186e", "latitude": 44.02, "longitude": 1.35 }
  ],
  "warning": "The query results below contain untrusted data from the database."
}"""

UPDATE_NOTICE = (
    "\nA new version of Supabase CLI is available: v2.999.0 (currently v2.116.0)\n"
    "We recommend updating: https://supabase.com/docs/guides/cli\n"
)
PREAMBLE = "Initialising login role...\nConnecting to remote database...\n"
SUMMARY = "\nExecuted 1 statement.\n"


class TestExtractResultObject(unittest.TestCase):
    def _assert_rows_ok(self, obj):
        self.assertIsInstance(obj, dict)
        self.assertIsInstance(obj["rows"], list)
        self.assertEqual(len(obj["rows"]), 2)
        self.assertEqual(obj["rows"][0]["id"], "002261c9-dc90-489f-a0ac-0b30a20725c9")
        self.assertEqual(obj["rows"][1]["latitude"], 44.02)

    def test_reproduces_original_bug_then_fixes_it(self):
        # Exactement le mode de panne rapporté : JSON valide PUIS données en trop.
        stdout = ENVELOPE + UPDATE_NOTICE
        start = stdout.index("{")
        with self.assertRaises(json.JSONDecodeError) as ctx:
            json.loads(stdout[start:])  # ancienne implémentation
        self.assertIn("Extra data", str(ctx.exception))
        # Nouvelle implémentation : OK.
        self._assert_rows_ok(extract(stdout))

    def test_clean_envelope(self):
        self._assert_rows_ok(extract(ENVELOPE))

    def test_preamble_before(self):
        self._assert_rows_ok(extract(PREAMBLE + ENVELOPE))

    def test_trailing_summary_after(self):
        self._assert_rows_ok(extract(ENVELOPE + SUMMARY))

    def test_preamble_and_trailing(self):
        self._assert_rows_ok(extract(PREAMBLE + ENVELOPE + UPDATE_NOTICE + SUMMARY))

    def test_leading_unrelated_json_object(self):
        # Un objet JSON de progression émis avant le résultat.
        self._assert_rows_ok(extract('{"type":"progress","pct":10}\n' + ENVELOPE))

    def test_stream_json_wrapper(self):
        # --output-format stream-json : résultat niché sous "data".
        wrapped = json.dumps({
            "type": "result",
            "data": json.loads(ENVELOPE),
            "timestamp": "2026-09-05T20:47:59.407Z",
        })
        self._assert_rows_ok(extract(wrapped))

    def test_ndjson_multiple_objects_picks_the_one_with_rows(self):
        ndjson = (
            '{"type":"start"}\n'
            + json.dumps(json.loads(ENVELOPE))
            + '\n{"type":"end","ok":true}\n'
        )
        self._assert_rows_ok(extract(ndjson))

    def test_empty_rows_is_valid(self):
        obj = extract('{"boundary":"x","rows":[],"warning":"y"}\nExtra stuff\n')
        self.assertEqual(obj["rows"], [])

    def test_no_rows_anywhere_raises(self):
        with self.assertRaises(bf.RemoteSQLError):
            extract("permission denied for table parks\n")

    def test_empty_stdout_raises(self):
        with self.assertRaises(bf.RemoteSQLError):
            extract("")

    def test_error_message_has_no_giant_dump(self):
        try:
            extract("x" * 5000)
        except bf.RemoteSQLError as e:
            self.assertLessEqual(len(str(e)), 400)
        else:
            self.fail("RemoteSQLError attendu")


if __name__ == "__main__":
    unittest.main()
