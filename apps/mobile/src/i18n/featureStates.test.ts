import { describe, expect, it } from "vitest";
import { createInstance } from "i18next";
import fr from "./locales/fr/features.json";
import en from "./locales/en/features.json";
import es from "./locales/es/features.json";

const catalogs = { fr, en, es };

async function tFor(lng: keyof typeof catalogs) {
  const i18n = createInstance();
  await i18n.init({ lng, resources: { [lng]: { features: catalogs[lng] } }, defaultNS: "features", interpolation: { escapeValue: false } });
  return i18n.t.bind(i18n);
}

describe("états des équipements — libellés FR / EN / ES", () => {
  it("« +N » : pluriel et singulier dans la langue, sans mélange", async () => {
    const fr_ = await tFor("fr");
    const en_ = await tFor("en");
    const es_ = await tFor("es");
    expect(fr_("state.more", { count: 3 })).toBe("3 caractéristiques supplémentaires dans la fiche");
    expect(fr_("state.more", { count: 1 })).toBe("1 caractéristique supplémentaire dans la fiche");
    expect(en_("state.more", { count: 3 })).toBe("3 more features in the park details");
    expect(en_("state.more", { count: 1 })).toBe("1 more feature in the park details");
    expect(es_("state.more", { count: 3 })).toBe("3 características más en la ficha");
    expect(es_("state.more", { count: 1 })).toBe("1 característica más en la ficha");
  });

  it("l'état inconnu s'intitule « Non renseigné » / « Not specified » / « Sin información »", async () => {
    for (const [lng, label] of [["fr", "Non renseigné"], ["en", "Not specified"], ["es", "Sin información"]] as const) {
      const t = await tFor(lng);
      expect(t("state.titles.unknown")).toBe(label);
      expect(t("state.short.unknown")).toBe(label);
    }
  });

  it("l'indisponibilité temporaire a ses propres libellés dans les 3 langues", () => {
    for (const c of Object.values(catalogs)) {
      expect(Object.keys(c.state.temporary).sort()).toEqual(Object.keys(c.state.unknown).sort());
      expect(c.state.titles.temporary).toBeTruthy();
      expect(c.state.short.temporary).toBeTruthy();
      expect(c.state.temporaryGame).toContain("{{item}}");
    }
  });
});
