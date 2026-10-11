import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractAddress } from "./address.ts";

// Parité avec le pipeline OSM : le MÊME parsing Geoapify doit s'appliquer à
// l'ajout utilisateur (TS) et à `scripts/osm/geoapify.py::_extract` (Python).
// Écart volontaire, hors fixtures : Python laisse passer une chaîne vide (`postcode: ""`
// → `""`), le TS la normalise en `null`. Geoapify n'en émet pas ; `null` est la
// représentation saine (jamais de code postal vide en base).
const FIXTURES: unknown[] = [
  { results: [{ housenumber: "12", street: "Rue de la Capelle", postcode: "12100", city: "Millau", state: "Occitanie", county: "Aveyron", country_code: "fr", formatted: "12 Rue de la Capelle, 12100 Millau" }] },
  { results: [{ street: "Chemin du Lac", village: "Creissels", state_district: "Sud", postcode: "12100" }] },
  { results: [{ address_line1: "Parc des Sports", town: "Saint-Georges", state: "Occitanie" }] },
  { results: [{ housenumber: "3", postcode: "69000", city: "Lyon" }] },
  { results: [{ state: "Occitanie", country_code: "fr" }] },
  { results: [{ street: "", city: "", town: "Rodez" }] },
  { results: [] },
  {},
  // États-Unis : direction + suffixe abrégés, hamlet accepté comme ville
  { results: [{ housenumber: "123", street: "West 42nd Street", postcode: "10036", city: "New York", state: "New York", state_code: "NY", county: "New York County", suburb: "Manhattan", country_code: "us", formatted: "123 West 42nd Street, New York, NY 10036, United States of America" }] },
  { results: [{ housenumber: "5", street: "East Main Street", hamlet: "Wading River", state: "New York", postcode: "11792", country_code: "us" }] },
  { results: [{ street: "North Moore Street", postcode: "10013", city: "New York", country_code: "us" }] },
  { results: [{ housenumber: "10", street: "Park Avenue", city: "Albany", country_code: "us" }] },
  { results: [{ housenumber: "1", street: "West Street", city: "Buffalo", country_code: "us" }] },
  { results: [{ housenumber: "9", street: "Broadway", city: "Brooklyn", country_code: "us" }] },
  // FR/ES : jamais d'abréviation (« Avenue » reste « Avenue »)
  { results: [{ housenumber: "8", street: "Avenue du Parc", city: "Lyon", country_code: "fr" }] },
  { results: [{ housenumber: "8", street: "Calle Norte Avenida", city: "Madrid", country_code: "es" }] },
];

const root = fileURLToPath(new URL("../../../scripts/osm", import.meta.url));
const py = spawnSync(
  "python3",
  ["-c", "import sys,json;sys.path.insert(0,sys.argv[1]);from geoapify import GeoapifyClient as C;print(json.dumps([C._extract(f) for f in json.loads(sys.stdin.read())]))", root],
  { input: JSON.stringify(FIXTURES), encoding: "utf-8" },
);
const pythonOk = py.status === 0;

describe.skipIf(!pythonOk)("parité TS ↔ scripts/osm/geoapify.py", () => {
  it("mêmes champs adresse sur les mêmes réponses Geoapify", () => {
    const expected = JSON.parse(py.stdout) as Array<Record<string, string | null> | null>;
    FIXTURES.forEach((f, i) => {
      const ts = extractAddress(f);
      const e = expected[i];
      if (e === null) return expect(ts).toBeNull();
      expect(ts).not.toBeNull();
      for (const k of ["address_line", "postal_code", "city", "admin_area_1", "admin_area_2", "formatted"] as const) {
        expect(ts![k], `fixture ${i} · ${k}`).toBe(e[k]);
      }
    });
  });
});

describe("country_code (seule extension TS, absente du pipeline OSM)", () => {
  it("est normalisé en majuscules et n'influence pas la règle de rejet", () => {
    expect(extractAddress({ results: [{ city: "Millau", country_code: "fr" }] })?.country_code).toBe("FR");
    expect(extractAddress({ results: [{ country_code: "fr" }] })).toBeNull();
  });
});

describe("États-Unis (normalisation de la rue)", () => {
  it("abrège direction en tête et suffixe en fin, jamais le nom entier", () => {
    const us = (street: string) => extractAddress({ results: [{ housenumber: "1", street, city: "X", country_code: "us" }] })!.address_line;
    expect(us("West 42nd Street")).toBe("1 W 42nd St");
    expect(us("North Moore Street")).toBe("1 N Moore St");
    expect(us("West Street")).toBe("1 West St");
    expect(us("Park Avenue")).toBe("1 Park Ave");
    expect(us("Broadway")).toBe("1 Broadway");
  });
  it("FR/ES : rue inchangée", () => {
    expect(extractAddress({ results: [{ housenumber: "8", street: "Avenue du Parc", city: "Lyon", country_code: "fr" }] })!.address_line).toBe("8 Avenue du Parc");
    expect(extractAddress({ results: [{ housenumber: "8", street: "Calle Mayor", city: "Madrid", country_code: "es" }] })!.address_line).toBe("8 Calle Mayor");
  });
  it("hamlet : ville uniquement aux US", () => {
    expect(extractAddress({ results: [{ street: "Main Street", hamlet: "Wading River", country_code: "us" }] })!.city).toBe("Wading River");
    expect(extractAddress({ results: [{ street: "Rue X", hamlet: "Hameau", country_code: "fr" }] })!.city).toBeNull();
  });
});
