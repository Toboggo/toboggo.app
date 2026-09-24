import { describe, expect, it } from "vitest";
import i18next from "i18next";
import fr from "../../i18n/locales/fr/map.json";
import en from "../../i18n/locales/en/map.json";
import es from "../../i18n/locales/es/map.json";
import { RADIUS_OPTIONS_KM } from "../../lib/nearbyRadius";

const catalogs = { fr, en, es } as const;

function keys(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

async function tFor(lng: keyof typeof catalogs) {
  const inst = i18next.createInstance();
  await inst.init({ lng, resources: { [lng]: { map: catalogs[lng] } }, defaultNS: "map", interpolation: { escapeValue: false } });
  return inst.t.bind(inst);
}

describe("« Autour de vous » i18n", () => {
  it("has the exact same nearby keys in FR, EN and ES", () => {
    const ref = keys(fr.nearby).sort();
    expect(keys(en.nearby).sort()).toEqual(ref);
    expect(keys(es.nearby).sort()).toEqual(ref);
  });

  it("has a hint for every radius option in every language", () => {
    for (const c of Object.values(catalogs)) {
      for (const r of RADIUS_OPTIONS_KM) expect(c.nearby.radius.hint[String(r) as "1"]).toBeTruthy();
    }
  });

  it("drops the old emoji blocks and uses no emoji at all", () => {
    for (const c of Object.values(catalogs)) {
      expect(keys(c.sheet)).not.toContain("favoritesNearby");
      expect(keys(c.sheet)).not.toContain("discoverNearby");
      expect(JSON.stringify(c.nearby)).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it.each([
    ["fr", "12 parcs à moins de 2 km", "1 parc à moins de 2 km", "Aucun parc à moins de 2 km", "Zone : 2 km"],
    ["en", "12 parks within 2 km", "1 park within 2 km", "No parks within 2 km", "Area: 2 km"],
    ["es", "12 parques a menos de 2 km", "1 parque a menos de 2 km", "Ningún parque a menos de 2 km", "Zona: 2 km"],
  ] as const)("%s: count, singular, none and Zone pill", async (lng, many, one, none, zone) => {
    const t = await tFor(lng);
    expect(t("nearby.subtitle", { count: 12, distance: "2 km" })).toBe(many);
    expect(t("nearby.subtitle", { count: 1, distance: "2 km" })).toBe(one);
    expect(t("nearby.subtitleNone", { distance: "2 km" })).toBe(none);
    expect(t("nearby.zone", { distance: "2 km" })).toBe(zone);
  });

  it.each([
    ["fr", "Zone de recherche", "Appliquer", "Voir des parcs à moins de 10 km"],
    ["en", "Search area", "Apply", "See parks within 10 km"],
    ["es", "Zona de búsqueda", "Aplicar", "Ver parques a menos de 10 km"],
  ] as const)("%s: picker and explicit 10 km CTA", async (lng, title, apply, seeWithin) => {
    const t = await tFor(lng);
    expect(t("nearby.radius.title")).toBe(title);
    expect(t("nearby.radius.apply")).toBe(apply);
    expect(t("nearby.seeWithin", { distance: "10 km" })).toBe(seeWithin);
  });
});
