import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import "./testInit";
import { useFormat } from "./useFormat";

const band = (min: number | null | undefined, max: number | null | undefined) =>
  renderHook(() => useFormat()).result.current.ageBand(min, max);

describe("useFormat().ageBand", () => {
  it("keeps 'Tout âge' for the full 0–12 span (and anything wider)", () => {
    expect(band(0, 12)).toBe("Tout âge");
    expect(band(0, 14)).toBe("Tout âge");
  });

  it("shows the real range for the Millau-like ranges, never a coarse '3–6'", () => {
    expect(band(1, 12)).toBe("1–12 ans");
    expect(band(2, 12)).toBe("2–12 ans");
    expect(band(2, 9)).toBe("2–9 ans");
  });

  it("shows ranges that used to be bucketed (−3 / 3–6 / 6–12) as they are", () => {
    expect(band(0, 3)).toBe("0–3 ans");
    expect(band(0, 2)).toBe("0–2 ans");
    expect(band(3, 6)).toBe("3–6 ans");
    expect(band(4, 8)).toBe("4–8 ans");
    expect(band(6, 12)).toBe("6–12 ans");
    expect(band(8, 12)).toBe("8–12 ans");
    expect(band(1, 12)).not.toBe("3–6 ans");
  });

  it("collapses an identical min/max to a single age", () => {
    expect(band(5, 5)).toBe("5 ans");
  });

  it("returns null when an age bound is unknown (unchanged behaviour)", () => {
    expect(band(null, null)).toBeNull();
    expect(band(undefined, undefined)).toBeNull();
    expect(band(3, null)).toBeNull();
    expect(band(null, 12)).toBeNull();
  });
});
