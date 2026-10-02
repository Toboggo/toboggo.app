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
