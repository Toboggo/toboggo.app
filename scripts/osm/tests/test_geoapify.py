#!/usr/bin/env python3
"""Tests unitaires purs pour scripts/osm/geoapify.py — aucun appel réseau.

`GeoapifyClient._extract` est testé directement avec des payloads Geoapify
simulés ; aucune clé API n'est nécessaire pour ces tests (le constructeur
n'est jamais instancié ici).
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geoapify import GeoapifyClient


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
