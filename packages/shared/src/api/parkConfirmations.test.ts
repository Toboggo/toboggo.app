import { describe, expect, it } from "vitest";
import type { Feature, Park } from "../types";
import { listParksToVerify } from "./parkConfirmations";

const feat = (id: string, code: string, category: Feature["category"], sort_order = 0): Feature => ({
  id, code, category, label_key: code, icon_key: null, value_set: null, sort_order, is_active: true, created_at: "",
});
const CATALOGUE = [feat("f1", "toilets", "service"), feat("f2", "slide", "play"), feat("f3", "shade", "environment")];

type P = Park & { distance_m: number };
function park(id: string, distance_m: number, features: Record<string, { status: string; verified_at?: string | null }>): P {
  const fm = Object.fromEntries(
    Object.entries(features).map(([k, v]) => [k, { status: v.status, value: null, quantity: null, category: "service", verified_at: v.verified_at ?? null }]),
  );
  return { id, distance_m, features: fm } as unknown as P;
}

const NOW = new Date("2026-10-04T10:00:00Z").getTime();

describe("listParksToVerify", () => {
  it("returns null with no park or only unknown features", () => {
    expect(listParksToVerify([], CATALOGUE, new Set(), NOW)).toEqual([]);
    expect(listParksToVerify([park("a", 100, { toilets: { status: "unknown" } })], CATALOGUE, new Set(), NOW)).toEqual([]);
  });

  it("picks the closest park and the service feature first", () => {
    const far = park("far", 900, { toilets: { status: "available" } });
    const near = park("near", 100, { slide: { status: "available" }, toilets: { status: "unavailable" } });
    const r = listParksToVerify([far, near], CATALOGUE, new Set(), NOW);
    expect(r.map((x) => x.park.id)).toEqual(["near", "far"]);
    expect(r[0]?.feature.code).toBe("toilets");
    expect(r[0]?.status).toBe("unavailable");
  });

  it("skips already confirmed and recently verified features, moving to the next", () => {
    const a = park("a", 100, { toilets: { status: "available" }, slide: { status: "available", verified_at: "2026-09-30T00:00:00Z" } });
    const b = park("b", 200, { slide: { status: "available" } });
    const r = listParksToVerify([a, b], CATALOGUE, new Set(["a:f1"]), NOW);
    expect(r).toHaveLength(1);
    expect(r[0]?.park.id).toBe("b");
    expect(r[0]?.feature.code).toBe("slide");
  });

  it("never asks a yes/no question about a valued feature", () => {
    const valued = { ...feat("f9", "surface_type", "environment"), value_set: ["sand", "grass"] };
    expect(listParksToVerify([park("a", 1, { surface_type: { status: "available" } })], [valued], new Set(), NOW)).toEqual([]);
  });

  it("ignores features missing from the catalogue", () => {
    expect(listParksToVerify([park("a", 1, { ghost: { status: "available" } })], CATALOGUE, new Set(), NOW)).toEqual([]);
  });
});
