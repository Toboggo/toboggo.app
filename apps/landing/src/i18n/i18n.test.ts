import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, isLocale } from "./config";
import { fr } from "./translations/fr";
import { en } from "./translations/en";
import { es } from "./translations/es";
import { getDictionary, getLangFromUrl } from "./utils";

// Garde-fou : les 3 dictionnaires doivent exposer exactement les mêmes clés,
// pour qu'aucune traduction ne soit silencieusement oubliée quand le shell
// (Header/Footer) évolue. Ne vérifie pas la qualité des traductions, juste
// leur complétude structurelle.
function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    collectKeyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n dictionaries", () => {
  it("fr/en/es expose exactly the same key paths", () => {
    const frKeys = collectKeyPaths(fr).sort();
    const enKeys = collectKeyPaths(en).sort();
    const esKeys = collectKeyPaths(es).sort();

    expect(enKeys).toEqual(frKeys);
    expect(esKeys).toEqual(frKeys);
  });

  it("no dictionary has an empty string value", () => {
    for (const locale of LOCALES) {
      const values = collectKeyPaths(getDictionary(locale)).map((path) =>
        path.split(".").reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], getDictionary(locale)),
      );
      for (const value of values) {
        expect(typeof value).toBe("string");
        expect((value as string).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("isLocale", () => {
  it("accepts fr/en/es and rejects anything else", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("es")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale("")).toBe(false);
  });
});

describe("getLangFromUrl", () => {
  it("falls back to the default locale when the URL has no locale segment", () => {
    expect(getLangFromUrl(new URL("https://toboggo-website.vercel.app/faq"))).toBe(DEFAULT_LOCALE);
    expect(getLangFromUrl(new URL("https://toboggo-website.vercel.app/"))).toBe(DEFAULT_LOCALE);
  });

  it("reads a locale segment when present", () => {
    expect(getLangFromUrl(new URL("https://toboggo-website.vercel.app/en/faq"))).toBe("en");
    expect(getLangFromUrl(new URL("https://toboggo-website.vercel.app/es/"))).toBe("es");
  });
});
