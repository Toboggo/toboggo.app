/**
 * `isGenericParkName` / `cleanStreetName` / `getParkDisplayName` — targeted
 * tests, no framework: Node's built-in test runner + TS stripping
 * (`node --experimental-strip-types --test`, Node ≥ 22.6), same zero-new-
 * dependency spirit as this repo's SQL migrations, which self-test via
 * inline `do $$ … raise exception … end $$` assertion blocks rather than a
 * framework. Run: `npm run test -w @toboggo/shared`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanStreetName, getParkDisplayName, isGenericParkName, type DisplayNameT } from "./parkName.ts";

// ── isGenericParkName ────────────────────────────────────────────────────

test("isGenericParkName: real names are not generic", () => {
  assert.equal(isGenericParkName("Square des Enfants"), false);
  assert.equal(isGenericParkName("Parc de la Victoire"), false);
  assert.equal(isGenericParkName("Séde"), false); // short but real
  assert.equal(isGenericParkName("La Maourine 2"), false);
  assert.equal(isGenericParkName("Cyclogym"), false);
});

test("isGenericParkName: the OSM-import fallback and its real casing variants", () => {
  assert.equal(isGenericParkName("Aire de jeux"), true);
  assert.equal(isGenericParkName("Aire de Jeux"), true); // capitalization variant seen in prod
  assert.equal(isGenericParkName("AIRE DE JEUX"), true);
  assert.equal(isGenericParkName("aire de jeux"), true);
  assert.equal(isGenericParkName("Aire de jeu"), true); // singular, seen in prod
  assert.equal(isGenericParkName("Jeux pour enfants"), true);
  assert.equal(isGenericParkName("Jardin d'enfants"), true);
  assert.equal(isGenericParkName("Jardin d’enfants"), true); // curly apostrophe
});

test("isGenericParkName: a real name that merely starts with the generic phrase is NOT generic", () => {
  assert.equal(isGenericParkName("Aire de jeux Robespierre"), false);
  assert.equal(isGenericParkName("Aire de jeux du Pigeonnier"), false);
});

test("isGenericParkName: equipment-only OSM names are NOT treated as generic", () => {
  assert.equal(isGenericParkName("Balançoire"), false);
  assert.equal(isGenericParkName("Pumptrack"), false);
  assert.equal(isGenericParkName("Toboggan"), false);
  assert.equal(isGenericParkName("Trampolines"), false);
  assert.equal(isGenericParkName("Structure multifonctions"), false);
});

test("isGenericParkName: EN / ES generic labels", () => {
  assert.equal(isGenericParkName("Playground"), true);
  assert.equal(isGenericParkName("playground"), true);
  assert.equal(isGenericParkName("Children's playground"), true);
  assert.equal(isGenericParkName("Children’s playground"), true);
  assert.equal(isGenericParkName("Área de juegos"), true);
  assert.equal(isGenericParkName("area de juegos"), true);
});

test("isGenericParkName: whitespace / casing noise is normalized", () => {
  assert.equal(isGenericParkName("  Aire   de    jeux  "), true);
  assert.equal(isGenericParkName("AiRe De JeUx"), true);
});

test("isGenericParkName: null / undefined / empty are treated as generic (no exploitable name)", () => {
  assert.equal(isGenericParkName(null), true);
  assert.equal(isGenericParkName(undefined), true);
  assert.equal(isGenericParkName(""), true);
  assert.equal(isGenericParkName("   "), true);
});

// ── cleanStreetName ──────────────────────────────────────────────────────

test("cleanStreetName: strips a plain leading housenumber", () => {
  assert.equal(cleanStreetName("17 Rue Victor Hugo"), "Rue Victor Hugo");
  assert.equal(cleanStreetName("1649 Route De l'Ecole"), "Route De l'Ecole");
});

test("cleanStreetName: strips a 'bis'/'ter' suffix, space-separated or glued", () => {
  assert.equal(cleanStreetName("2 bis Avenue Jean Jaurès"), "Avenue Jean Jaurès");
  assert.equal(cleanStreetName("4bis Place Du Maréchal Ney"), "Place Du Maréchal Ney");
});

test("cleanStreetName: strips a single building-letter suffix", () => {
  assert.equal(cleanStreetName("66 G Avenue de Toulouse"), "Avenue de Toulouse");
});

test("cleanStreetName: a number genuinely part of the street name is untouched", () => {
  assert.equal(cleanStreetName("Avenue du 8 Mai 1945"), "Avenue du 8 Mai 1945");
  assert.equal(cleanStreetName("Rue du 11 Novembre"), "Rue du 11 Novembre");
});

test("cleanStreetName: missing / empty address", () => {
  assert.equal(cleanStreetName(null), null);
  assert.equal(cleanStreetName(undefined), null);
  assert.equal(cleanStreetName(""), null);
  assert.equal(cleanStreetName("   "), null);
});

test("cleanStreetName: collapses stray internal whitespace without otherwise altering the street", () => {
  assert.equal(cleanStreetName("Rue   Victor    Hugo"), "Rue Victor Hugo");
});

test("cleanStreetName: never destructive on its input — pure function, no shared/global state touched", () => {
  const input = "17 Rue Victor Hugo";
  cleanStreetName(input);
  assert.equal(input, "17 Rue Victor Hugo");
});

// ── getParkDisplayName ───────────────────────────────────────────────────

/** Fake `t` — mirrors i18next's `common.json` catalog for one language, and
 * records which keys were requested (to assert the proper name is never
 * passed through `t()`). */
function fakeT(catalog: { generic: string; template: string }): DisplayNameT & { calls: string[] } {
  const calls: string[] = [];
  const t = ((key: string, options?: Record<string, unknown>) => {
    calls.push(key);
    if (key === "park.generic") return catalog.generic;
    if (key === "park.displayName") {
      const { generic, qualifier } = options as { generic: string; qualifier: string };
      return catalog.template.replace("{{generic}}", generic).replace("{{qualifier}}", qualifier);
    }
    return key;
  }) as DisplayNameT & { calls: string[] };
  t.calls = calls;
  return t;
}

const FR = { generic: "Aire de jeux", template: "{{generic}} • {{qualifier}}" };
const EN = { generic: "Playground", template: "{{generic}} • {{qualifier}}" };
const ES = { generic: "Área de juegos", template: "{{generic}} • {{qualifier}}" };

test("getParkDisplayName: a real, non-generic name is returned as-is — never translated", () => {
  const t = fakeT(FR);
  const name = getParkDisplayName(
    { name: "Square des Enfants", address_line: "17 Rue Victor Hugo", city: "Millau" },
    t,
  );
  assert.equal(name, "Square des Enfants");
  assert.deepEqual(t.calls, []); // the proper name never goes through t()
});

test("getParkDisplayName: generic name + street → '<generic> • <street>' (FR)", () => {
  const t = fakeT(FR);
  const name = getParkDisplayName(
    { name: "Aire de jeux", address_line: "17 Rue du Mandarous", city: "Millau" },
    t,
  );
  assert.equal(name, "Aire de jeux • Rue du Mandarous");
});

test("getParkDisplayName: generic name + street → EN", () => {
  const t = fakeT(EN);
  const name = getParkDisplayName(
    { name: "Aire de jeux", address_line: "17 Rue du Mandarous", city: "Millau" },
    t,
  );
  assert.equal(name, "Playground • Rue du Mandarous");
});

test("getParkDisplayName: generic name + street → ES (the street is never translated either)", () => {
  const t = fakeT(ES);
  const name = getParkDisplayName(
    { name: "Aire de jeux", address_line: "17 Rue du Mandarous", city: "Millau" },
    t,
  );
  assert.equal(name, "Área de juegos • Rue du Mandarous");
});

test("getParkDisplayName: generic name, no street, usable commune → '<generic> • <city>'", () => {
  const t = fakeT(FR);
  const name = getParkDisplayName({ name: "Aire de jeux", address_line: null, city: "Millau" }, t);
  assert.equal(name, "Aire de jeux • Millau");
});

test("getParkDisplayName: generic name, empty-string address_line falls back to commune", () => {
  const t = fakeT(FR);
  const name = getParkDisplayName({ name: "Aire de jeux", address_line: "   ", city: "Millau" }, t);
  assert.equal(name, "Aire de jeux • Millau");
});

test("getParkDisplayName: generic name, nothing usable → the generic label alone", () => {
  const t = fakeT(FR);
  assert.equal(getParkDisplayName({ name: "Aire de jeux", address_line: null, city: null }, t), "Aire de jeux");
  assert.equal(
    getParkDisplayName({ name: "Aire de jeux", address_line: "  ", city: "  " }, t),
    "Aire de jeux",
  );
});

test("getParkDisplayName: missing name entirely behaves like a generic name", () => {
  const t = fakeT(FR);
  assert.equal(
    getParkDisplayName({ name: null, address_line: "17 Rue du Mandarous", city: "Millau" }, t),
    "Aire de jeux • Rue du Mandarous",
  );
  assert.equal(getParkDisplayName({ address_line: null, city: null }, t), "Aire de jeux");
});

test("getParkDisplayName: qualifier already identical to the generic label is skipped", () => {
  const t = fakeT(FR);
  // Degenerate/unlikely but defensive: a `city` literally equal to the
  // generic word must not produce "Aire de jeux • Aire de jeux".
  const name = getParkDisplayName({ name: "Aire de jeux", address_line: null, city: "Aire de jeux" }, t);
  assert.equal(name, "Aire de jeux");
});

test("getParkDisplayName: street housenumber is stripped before assembly (reuses cleanStreetName)", () => {
  const t = fakeT(FR);
  const name = getParkDisplayName(
    { name: "Aire de Jeux", address_line: "2 bis Avenue Jean Jaurès", city: "Toulouse" },
    t,
  );
  assert.equal(name, "Aire de jeux • Avenue Jean Jaurès");
});

test("getParkDisplayName: no stray whitespace in the assembled title", () => {
  const t = fakeT(FR);
  const name = getParkDisplayName(
    { name: "  Aire de jeux  ", address_line: "  17   Rue du Mandarous  ", city: "Millau" },
    t,
  );
  assert.equal(name, "Aire de jeux • Rue du Mandarous");
  assert.equal(name.includes("  "), false);
});
