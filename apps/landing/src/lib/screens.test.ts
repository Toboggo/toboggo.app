import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_SCREENS, appScreen } from "./screens";

const dir = fileURLToPath(new URL("../../public/screenshots/", import.meta.url));

describe("app screens registry", () => {
  it("has unique ids and files", () => {
    expect(new Set(APP_SCREENS.map((s) => s.id)).size).toBe(APP_SCREENS.length);
    expect(new Set(APP_SCREENS.map((s) => s.file)).size).toBe(APP_SCREENS.length);
  });

  it("every available screen has its file, and every file is declared available", () => {
    for (const s of APP_SCREENS.filter((x) => x.available)) expect(existsSync(dir + s.file), s.file).toBe(true);
    const declared = new Set(APP_SCREENS.filter((s) => s.available).map((s) => s.file));
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".webp"))) expect(declared.has(file), `${file} non déclaré`).toBe(true);
  });

  it("ne sert que du WebP : aucun PNG brut oublié dans public/screenshots", () => {
    const raw = readdirSync(dir).filter((f) => f.endsWith(".png"));
    expect(raw, "convertir avec scripts/optimize-images.mjs puis supprimer les PNG").toEqual([]);
  });

  it("never returns a planned (missing) screen", () => {
    expect(appScreen("explorer")?.src).toBe("/screenshots/explorer.webp");
    expect(appScreen("compare")).toBeNull();
    expect(appScreen("inconnu")).toBeNull();
  });

  it("describes every screen with alt text and a caption", () => {
    for (const s of APP_SCREENS) {
      expect(s.alt.length).toBeGreaterThan(10);
      expect(s.caption.length).toBeGreaterThan(3);
    }
  });
});
