#!/usr/bin/env python3
"""Tests unitaires purs pour scripts/osm/geoapify.py — aucun appel réseau.

`GeoapifyClient._extract` est testé directement avec des payloads Geoapify
simulés ; aucune clé API n'est nécessaire pour ces tests (le constructeur
n'est jamais instancié ici).
"""
import io
import json
import socket
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geoapify import GeoapifyClient, GeoapifyError


class TestExtractConfidence(unittest.TestCase):
    """Coeur de la correction demandée : ne jamais fabriquer une confiance
    par défaut quand Geoapify n'en fournit pas — NULL, pas 0.5."""

    def test_missing_rank_yields_none_confidence(self):
        data = {"results": [{"city": "Toulouse", "postcode": "31000"}]}
        result = GeoapifyClient._extract(data)
        self.assertIsNone(result["confidence"])

    def test_rank_without_confidence_key_yields_none(self):
        data = {"results": [{"city": "Toulouse", "postcode": "31000", "rank": {}}]}
        result = GeoapifyClient._extract(data)
        self.assertIsNone(result["confidence"])

    def test_real_confidence_value_preserved(self):
        data = {
            "results": [
                {"city": "Toulouse", "postcode": "31000", "rank": {"confidence": 0.87}}
            ]
        }
        result = GeoapifyClient._extract(data)
        self.assertEqual(result["confidence"], 0.87)

    def test_confidence_zero_is_preserved_not_treated_as_missing(self):
        # 0.0 est une valeur réelle (confiance nulle mesurée), pas une absence
        # de donnée — ne doit jamais être confondue avec None.
        data = {
            "results": [
                {"city": "Toulouse", "postcode": "31000", "rank": {"confidence": 0.0}}
            ]
        }
        result = GeoapifyClient._extract(data)
        self.assertEqual(result["confidence"], 0.0)
        self.assertIsNotNone(result["confidence"])


class TestExtractAddressFields(unittest.TestCase):
    def test_no_results_returns_none(self):
        self.assertIsNone(GeoapifyClient._extract({"results": []}))
        self.assertIsNone(GeoapifyClient._extract({}))

    def test_housenumber_and_street(self):
        data = {"results": [{"housenumber": "12", "street": "Rue de Paris"}]}
        result = GeoapifyClient._extract(data)
        self.assertEqual(result["address_line"], "12 Rue de Paris")

    def test_falls_back_to_address_line1_without_street(self):
        data = {"results": [{"address_line1": "Lieu-dit Les Chênes", "city": "X"}]}
        result = GeoapifyClient._extract(data)
        self.assertEqual(result["address_line"], "Lieu-dit Les Chênes")

    def test_city_fallback_chain(self):
        self.assertEqual(
            GeoapifyClient._extract({"results": [{"town": "Millau"}]})["city"], "Millau"
        )
        self.assertEqual(
            GeoapifyClient._extract({"results": [{"village": "Nages"}]})["city"], "Nages"
        )

    def test_admin_areas_from_state_and_county(self):
        data = {"results": [{"city": "X", "state": "Occitanie", "county": "Aveyron"}]}
        result = GeoapifyClient._extract(data)
        self.assertEqual(result["admin_area_1"], "Occitanie")
        self.assertEqual(result["admin_area_2"], "Aveyron")

    def test_all_fields_absent_returns_none(self):
        data = {"results": [{"country": "France"}]}  # aucun champ adresse exploitable
        self.assertIsNone(GeoapifyClient._extract(data))


if __name__ == "__main__":
    unittest.main()


class _FakeResp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _ok_resp():
    return _FakeResp(json.dumps({"results": [{"city": "Lyon", "postcode": "69001"}]}).encode())


class TestRetryOnTransientErrors(unittest.TestCase):
    """Timeouts / erreurs réseau : retry puis GeoapifyError propre (le backfill
    compte le parc en erreur et continue). Aucun réseau, aucun sleep réel."""

    def setUp(self):
        self.client = GeoapifyClient(api_key="test", min_interval_s=0, max_retries=2)
        p = mock.patch("geoapify.time.sleep")
        p.start()
        self.addCleanup(p.stop)

    def _run(self, side_effect):
        with mock.patch("geoapify.urllib.request.urlopen", side_effect=side_effect) as m:
            try:
                return self.client.reverse_geocode(45.7, 4.8), m
            finally:
                self.calls = m.call_count

    def test_socket_timeout_then_success(self):
        result, _ = self._run([socket.timeout("The read operation timed out"), _ok_resp()])
        self.assertEqual(result["city"], "Lyon")
        self.assertEqual(self.calls, 2)

    def test_timeout_error_then_success(self):
        result, _ = self._run([TimeoutError("timed out"), _ok_resp()])
        self.assertEqual(result["city"], "Lyon")
        self.assertEqual(self.calls, 2)

    def test_connection_reset_then_success(self):
        result, _ = self._run([ConnectionResetError("reset"), _ok_resp()])
        self.assertEqual(result["city"], "Lyon")

    def test_timeouts_until_retries_exhausted_raise_geoapify_error(self):
        with self.assertRaises(GeoapifyError):
            self._run(socket.timeout("The read operation timed out"))
        # 1 tentative initiale + max_retries (2) = 3
        self.assertEqual(self.calls, 3)

    def test_non_retryable_http_error_not_retried(self):
        import urllib.error

        err = urllib.error.HTTPError("u", 401, "Unauthorized", {}, None)
        with self.assertRaises(GeoapifyError):
            self._run(err)
        self.assertEqual(self.calls, 1)
