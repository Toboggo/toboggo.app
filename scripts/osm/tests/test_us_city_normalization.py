#!/usr/bin/env python3
"""Normalisation des villes US (« City/Town/Village of … ») — aucun réseau, aucune DB."""
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import address  # noqa: E402
from geoapify import GeoapifyClient  # noqa: E402


def extract(**fields):
    return GeoapifyClient._extract({"results": [fields]})


class TestNormalizeUsCity(unittest.TestCase):
    def test_strips_administrative_prefix(self):
        n = address.normalize_us_city
        self.assertEqual(n("Village of Massapequa Park"), "Massapequa Park")
        self.assertEqual(n("Town of Waterford"), "Waterford")
        self.assertEqual(n("City of Corning"), "Corning")
        self.assertEqual(n("City of Syracuse"), "Syracuse")
        self.assertEqual(n("city of buffalo"), "buffalo")
        self.assertEqual(n("  Town   of  Islip "), "Islip")

    def test_leaves_other_values_untouched(self):
        n = address.normalize_us_city
        for v in ("New York", "Seaford", "Roslyn Heights", "Port Washington", "Town of", "City of",
                  "Cityof", "Villageof Foo", "Mount of Olives", "Lake Village of Foo"):
            self.assertEqual(n(v), v, v)
        self.assertIsNone(n(None))
        self.assertEqual(n(""), "")

    def test_prefix_only_in_head_position(self):
        self.assertEqual(address.normalize_us_city("Port of Town of X"), "Port of Town of X")


class TestExtractUs(unittest.TestCase):
    BASE = dict(housenumber="41", street="Birch Lane", postcode="11762", state="New York",
                state_code="NY", county="Nassau County", country_code="us")

    def test_prefix_removed_raw_kept_in_provenance_field(self):
        r = extract(city="Village of Massapequa Park", **self.BASE)
        self.assertEqual(r["city"], "Massapequa Park")
        self.assertEqual(r["city_raw"], "Village of Massapequa Park")
        self.assertEqual(address.build_us_formatted_address(
            {**r, "admin_area_1": r["admin_area_1"]}), "41 Birch Ln, Massapequa Park, NY 11762")

    def test_town_and_village_keys(self):
        self.assertEqual(extract(town="Town of Waterford", **self.BASE)["city"], "Waterford")
        self.assertEqual(extract(village="Village of Roslyn", **self.BASE)["city"], "Roslyn")
        self.assertEqual(extract(hamlet="Hamlet Foo", **self.BASE)["city"], "Hamlet Foo")

    def test_unchanged_city_has_no_raw(self):
        r = extract(city="Seaford", **self.BASE)
        self.assertEqual(r["city"], "Seaford")
        self.assertIsNone(r["city_raw"])

    def test_nyc_boroughs_and_outside_nyc(self):
        r = extract(city="New York", suburb="Brooklyn", **{**self.BASE, "county": "Kings County"})
        self.assertEqual((r["city"], r["neighbourhood"], r["admin_area_2"]), ("New York", "Brooklyn", "Kings County"))
        self.assertIsNone(r["city_raw"])
        self.assertEqual(extract(city="Buffalo", **self.BASE)["city"], "Buffalo")
        self.assertEqual(extract(city="New Rochelle", **self.BASE)["city"], "New Rochelle")

    def test_us_specifics_preserved(self):
        r = extract(city="City of Corning", housenumber="356 REAR", street="Euclid Avenue",
                    postcode="14830-1234", state="New York", country_code="us")
        self.assertEqual(r["address_line"], "356 REAR Euclid Ave")
        self.assertEqual(r["postal_code"], "14830-1234")
        r2 = extract(city="New York", housenumber="134-29", street="166th Place", postcode="11434", country_code="us")
        self.assertEqual(r2["address_line"], "134-29 166th Pl")

    def test_fr_es_untouched(self):
        for cc, city in (("fr", "City of Lyon"), ("es", "Village of Sevilla"), ("fr", "Town of X")):
            r = extract(city=city, street="Rue X", country_code=cc)
            self.assertEqual(r["city"], city)
            self.assertIsNone(r["city_raw"])


if __name__ == "__main__":
    unittest.main()
