import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Garde-fou identité : les fichiers de marque servis par le site sont des copies
// OCTET POUR OCTET du kit officiel v3 (docs/brand-kit-v3). Aucun redessin possible.
const root = fileURLToPath(new URL("../../../..", import.meta.url));
const landing = join(root, "apps/landing");
const kit = (p: string) => readFileSync(join(root, "docs/brand-kit-v3", p));
const pub = (p: string) => readFileSync(join(landing, "public", p));

const COPIES: [string, string][] = [
  ["logo/toboggo-color.svg", "brand/toboggo-color.svg"],
  ["logo/toboggo-white.svg", "brand/toboggo-white.svg"],
  ["favicon/favicon.svg", "favicon.svg"],
  ["favicon/favicon.ico", "favicon.ico"],
  ["favicon/apple-touch-icon.png", "apple-touch-icon.png"],
  ["icon/app-icon-512.png", "icon-512.png"],
  ["cover/og-1200x630-light.png", "og-default.png"],
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sources(full) : /\.(astro|ts)$/.test(name) ? [full] : [];
  });
}

describe("identité de marque v3", () => {
  it.each(COPIES)("%s est servi à l'identique (%s)", (from, to) => {
    expect(existsSync(join(landing, "public", to))).toBe(true);
    expect(pub(to).equals(kit(from))).toBe(true);
  });

  it("l'image Open Graph par défaut fait 1200×630", () => {
    const png = pub("og-default.png");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("le composant Logo n'embarque aucun tracé ni dégradé maison", () => {
    const src = readFileSync(join(landing, "src/components/Logo.astro"), "utf8");
    expect(src).not.toMatch(/<svg|linearGradient|<path|<circle/);
    expect(src).toContain("/brand/toboggo-");
  });

  it("aucune page ne référence l'ancien visuel de partage carré par défaut", () => {
    const offenders = sources(join(landing, "src")).filter((f) => !f.endsWith(".test.ts") && /DEFAULT_OG_IMAGE\s*=\s*"\/icon-512\.png"/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
