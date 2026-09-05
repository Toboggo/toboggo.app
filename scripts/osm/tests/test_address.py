#!/usr/bin/env python3
"""Tests unitaires purs pour scripts/osm/address.py — aucune dépendance DB.

Lancer : python3 -m unittest scripts.osm.tests.test_address -v
     ou : python3 scripts/osm/tests/test_address.py
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import address


class TestExtractAddressFromTags(unittest.TestCase):
    def test_no_addr_tags_returns_none(self):
        self.assertIsNone(address.extract_address_from_tags({"leisure": "playground"}))

    def test_empty_props_returns_none(self):
        self.assertIsNone(address.extract_address_from_tags({}))

    def test_housenumber_and_street_build_address_line(self):
        result = address.extract_address_from_tags(
            {"addr:housenumber": "8", "addr:street": "Quai du Temple"}
        )
        self.assertEqual(result["address_line"], "8 Quai du Temple")
        self.assertIsNone(result["postal_code"])
        self.assertIsNone(result["city"])

    def test_street_only_no_housenumber(self):
        result = address.extract_address_from_tags({"addr:street": "Rue Ramond"})
        self.assertEqual(result["address_line"], "Rue Ramond")

    def test_housenumber_without_street_yields_no_address_line(self):
        # Un numéro seul, sans rue, ne permet de rien construire de sensé.
        result = address.extract_address_from_tags({"addr:housenumber": "8"})
        self.assertIsNone(result["address_line"])

    def test_postcode_and_city_only(self):
        result = address.extract_address_from_tags(
            {"addr:postcode": "65260", "addr:city": "Pierrefitte-Nestalas"}
        )
        self.assertIsNone(result["address_line"])
        self.assertEqual(result["postal_code"], "65260")
        self.assertEqual(result["city"], "Pierrefitte-Nestalas")

    def test_city_only(self):
        result = address.extract_address_from_tags({"addr:city": "Masseube"})
        self.assertEqual(result["city"], "Masseube")
        self.assertIsNone(result["postal_code"])

    def test_full_address(self):
        result = address.extract_address_from_tags(
            {
                "addr:housenumber": "2",
                "addr:street": "Rue de l'Égalité",
                "addr:postcode": "31200",
                "addr:city": "Toulouse",
            }
        )
        self.assertEqual(result["address_line"], "2 Rue de l'Égalité")
        self.assertEqual(result["postal_code"], "31200")
        self.assertEqual(result["city"], "Toulouse")

    def test_admin_areas_always_none_from_osm(self):
        # Confirmé par le diagnostic : addr:* OSM FR ne porte jamais ces
        # niveaux — seul le reverse geocoding les renseigne.
        result = address.extract_address_from_tags(
            {"addr:city": "Toulouse", "addr:postcode": "31000"}
        )
        self.assertIsNone(result["admin_area_1"])
        self.assertIsNone(result["admin_area_2"])

    def test_irrelevant_tags_ignored(self):
        result = address.extract_address_from_tags(
            {"addr:place": "somewhere", "is_in": "France", "operator": "Mairie X"}
        )
        # Ces tags ne sont jamais apparus dans le jeu de données Midi-Pyrénées
        # (diagnostic) et ne sont pas exploités par extract_address_from_tags.
        self.assertIsNone(result)


class TestHasUsableAddress(unittest.TestCase):
    def test_none_is_not_usable(self):
        self.assertFalse(address.has_usable_address(None))

    def test_all_none_fields_not_usable(self):
        empty = {
            "address_line": None, "postal_code": None, "city": None,
            "admin_area_1": None, "admin_area_2": None,
        }
        self.assertFalse(address.has_usable_address(empty))

    def test_one_field_present_is_usable(self):
        d = {
            "address_line": None, "postal_code": None, "city": "Toulouse",
            "admin_area_1": None, "admin_area_2": None,
        }
        self.assertTrue(address.has_usable_address(d))


class TestBuildFormattedAddress(unittest.TestCase):
    def test_none_returns_none(self):
        self.assertIsNone(address.build_formatted_address(None))

    def test_empty_dict_returns_none(self):
        empty = {
            "address_line": None, "postal_code": None, "city": None,
            "admin_area_1": None, "admin_area_2": None,
        }
        self.assertIsNone(address.build_formatted_address(empty))

    def test_full_address_formatted(self):
        d = {
            "address_line": "2 Rue de l'Égalité", "postal_code": "31200",
            "city": "Toulouse", "admin_area_1": None, "admin_area_2": None,
        }
        self.assertEqual(
            address.build_formatted_address(d), "2 Rue de l'Égalité, 31200 Toulouse"
        )

    def test_city_only_formatted(self):
        d = {
            "address_line": None, "postal_code": None, "city": "Masseube",
            "admin_area_1": None, "admin_area_2": None,
        }
        self.assertEqual(address.build_formatted_address(d), "Masseube")

    def test_postcode_and_city_formatted(self):
        d = {
            "address_line": None, "postal_code": "65260",
            "city": "Pierrefitte-Nestalas", "admin_area_1": None, "admin_area_2": None,
        }
        self.assertEqual(
            address.build_formatted_address(d), "65260 Pierrefitte-Nestalas"
        )


class TestDecodeOsmValue(unittest.TestCase):
    def test_none_passthrough(self):
        self.assertIsNone(address.decode_osm_value(None))

    def test_plain_value_stripped(self):
        self.assertEqual(address.decode_osm_value("  Toulouse  "), "Toulouse")

    def test_percent_encoded_space(self):
        self.assertEqual(address.decode_osm_value("Rue%20du%20Temple"), "Rue du Temple")


if __name__ == "__main__":
    unittest.main()
