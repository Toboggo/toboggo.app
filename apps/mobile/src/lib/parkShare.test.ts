import { describe, expect, it } from "vitest";
import { buildShareDescription, buildShareText, buildShareTitle, shortLocation } from "./parkShare";

const t = (key: string, o: Record<string, unknown> = {}) =>
  ({
    "share.intro": "INTRO",
    "share.metaFallback": "FALLBACK",
    "share.ratingLine": `${o.rating}/5 · ${o.count} avis`,
  })[key] ?? key;
const fmt = (n: number) => n.toFixed(1);
const base = { name: "Parc Blandan", address_line: "33 rue Cdt Pegoud", city: "Lyon", rating: 4.3, review_count: 7 };

describe("shortLocation", () => {
  it("adresse + commune", () => expect(shortLocation(base)).toBe("33 rue Cdt Pegoud, Lyon"));
  it("masque l'adresse absente", () => expect(shortLocation({ ...base, address_line: null })).toBe("Lyon"));
  it("masque la commune absente", () => expect(shortLocation({ ...base, city: " " })).toBe("33 rue Cdt Pegoud"));
  it("rien du tout → null", () => expect(shortLocation({ ...base, address_line: null, city: null })).toBeNull());
  it("évite le doublon nom / adresse", () =>
    expect(shortLocation({ ...base, address_line: "parc blandan" })).toBe("Lyon"));
  it("évite le doublon adresse / commune", () =>
    expect(shortLocation({ ...base, address_line: "Place Bellecour, Lyon" })).toBe("Place Bellecour, Lyon"));
});

describe("buildShareText", () => {
  it("format complet, URL une seule fois en dernière ligne", () => {
    const text = buildShareText(base, "https://x/park/1", t, fmt);
    expect(text).toBe("INTRO\nParc Blandan\n📍 33 rue Cdt Pegoud, Lyon\n⭐ 4.3/5 · 7 avis\nhttps://x/park/1");
    expect(text.split("https://x/park/1")).toHaveLength(2);
  });
  it("masque la note sans avis ou note nulle", () => {
    expect(buildShareText({ ...base, review_count: 0 }, "u", t, fmt)).not.toContain("⭐");
    expect(buildShareText({ ...base, rating: 0 }, "u", t, fmt)).not.toContain("⭐");
  });
  it("masque la ligne lieu si inconnue", () => {
    expect(buildShareText({ ...base, address_line: null, city: null }, "u", t, fmt)).not.toContain("📍");
  });
});

describe("buildShareDescription", () => {
  it("localisation · note", () =>
    expect(buildShareDescription(base, t, fmt)).toBe("33 rue Cdt Pegoud, Lyon · ⭐ 4.3/5 · 7 avis"));
  it("repli sans aucune donnée", () =>
    expect(buildShareDescription({ ...base, address_line: null, city: null, review_count: 0 }, t, fmt)).toBe("FALLBACK"));
});

describe("buildShareTitle", () => {
  it("nom · commune", () => expect(buildShareTitle({ name: "Parc Blandan", city: "Lyon" })).toBe("Parc Blandan · Lyon"));
  it("sans commune → nom seul", () => expect(buildShareTitle({ name: "Parc Blandan", city: null })).toBe("Parc Blandan"));
  it("commune déjà dans le nom → pas de doublon", () =>
    expect(buildShareTitle({ name: "Parc de Lyon", city: "lyon" })).toBe("Parc de Lyon"));
});
