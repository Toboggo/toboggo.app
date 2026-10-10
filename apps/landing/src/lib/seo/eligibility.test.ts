import { describe, expect, it } from "vitest";
import { many, park, rich } from "./fixtures";
import { evaluateEligibility, hasValidCoordinates, isDocumented, isListable, THRESHOLDS } from "./eligibility";

describe("listing / documentation rules", () => {
  it("requires valid coordinates and a postal code", () => {
    expect(isListable(park())).toBe(true);
    expect(isListable(park({ postalCode: null }))).toBe(false);
    expect(isListable(park({ postalCode: "  " }))).toBe(false);
    expect(hasValidCoordinates(park({ latitude: null }))).toBe(false);
    expect(hasValidCoordinates(park({ latitude: 0, longitude: 0 }))).toBe(false);
    expect(hasValidCoordinates(park({ latitude: 91 }))).toBe(false);
  });

  it("documented = complete age range OR >= 3 useful declared infos", () => {
    expect(isDocumented(park())).toBe(false);
    expect(isDocumented(park({ minAge: 1 }))).toBe(false);
    expect(isDocumented(park({ minAge: 1, maxAge: 12 }))).toBe(true);
    const two = { slide: { status: "available" }, toilets: { status: "available" } };
    expect(isDocumented(park({ features: two }))).toBe(false);
    expect(isDocumented(park({ features: { ...two, benches: { status: "available" } } }))).toBe(true);
    expect(isDocumented(park({ features: { surface_type: { status: "available", value: "rubber" }, slide: { status: "unavailable" } } }))).toBe(false);
  });
});

describe("eligibility V2", () => {
  const eligible = [...many(4, () => rich()), ...many(6, () => park())]; // 10 affichables, 4 documentés (40 %)

  it("thresholds are the validated ones", () => {
    expect(THRESHOLDS).toMatchObject({ minListedParks: 5, minDocumentedParks: 3, minDocumentedRatio: 0.2 });
  });

  it("passes with >= 5 listed, >= 3 documented and >= 20 % documented", () => {
    const r = evaluateEligibility(eligible);
    expect(r.eligible).toBe(true);
    expect(r.checks.map((c) => c.id)).toEqual(["listed", "documented", "documentedRatio"]);
  });

  it("fails with fewer than 5 listed parks", () => {
    expect(evaluateEligibility([rich(), rich(), rich(), park()]).eligible).toBe(false);
  });

  it("fails with fewer than 3 documented parks", () => {
    const r = evaluateEligibility([rich(), rich(), ...many(8, () => park())]);
    expect(r.eligible).toBe(false);
    expect(r.checks.find((c) => c.id === "documented")?.passed).toBe(false);
  });

  it("fails when documented parks are under 20 % of listed parks (large thin city)", () => {
    const r = evaluateEligibility([...many(11, () => rich()), ...many(270, () => park())]); // 11 / 281 ≈ 3.9 %
    expect(r.eligible).toBe(false);
    expect(r.checks.find((c) => c.id === "listed")?.passed).toBe(true);
    expect(r.checks.find((c) => c.id === "documented")?.passed).toBe(true);
    expect(r.checks.find((c) => c.id === "documentedRatio")?.passed).toBe(false);
  });

  it("accepts exactly 20 % and rejects just below", () => {
    expect(evaluateEligibility([...many(3, () => rich()), ...many(12, () => park())]).eligible).toBe(true); // 3/15 = 20 %
    expect(evaluateEligibility([...many(3, () => rich()), ...many(13, () => park())]).eligible).toBe(false); // 3/16 = 18.75 %
  });

  it("does not count non-listable parks in the ratio or the thresholds", () => {
    const parks = [...many(5, () => park()), ...many(3, () => rich()), ...many(50, () => park({ postalCode: null }))];
    const r = evaluateEligibility(parks);
    expect(r.listed).toBe(8);
    expect(r.eligible).toBe(true);
  });

  it("is not eligible without parks", () => {
    expect(evaluateEligibility([]).eligible).toBe(false);
  });
});
