import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
const mapCanvasCss = read("./MapCanvas.module.css");
const markersSource = read("./markers.ts");
const exploreCss = read("./MapExplore.module.css");

const zs = (src: string) => [...src.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1]));

describe("empilement — le contrôle d'attribution reste au-dessus des marqueurs", () => {
  const ctrlRule = mapCanvasCss.match(/\.maplibregl-ctrl-bottom-left\)\s*\{([^}]*)\}/)?.[1] ?? "";
  const ctrlZ = Number(ctrlRule.match(/z-index:\s*(\d+)/)?.[1]);

  it("z-index du contrôle défini et supérieur à tout marqueur (sélectionné = 3)", () => {
    expect(Number.isFinite(ctrlZ)).toBe(true);
    expect(ctrlZ).toBeGreaterThan(Math.max(...zs(markersSource)));
  });

  it("reste sous l'en-tête et les boutons flottants (z-index 20)", () => {
    expect(ctrlZ).toBeLessThan(Math.min(...zs(exploreCss)));
  });
});
