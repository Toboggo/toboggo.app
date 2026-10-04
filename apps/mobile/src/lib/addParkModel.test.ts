import { describe, expect, it } from "vitest";
import { ageRangeFromBands, applyAnswers, setAnswer, toggleAgeBand } from "./addParkModel";

describe("toggleAgeBand", () => {
  it("starts a selection, extends it with a neighbour, refuses a disjoint band", () => {
    let sel = toggleAgeBand([], "3-6");
    expect(sel).toEqual({ next: ["3-6"], rejected: false });
    sel = toggleAgeBand(sel.next, "0-3");
    expect(sel.next).toEqual(["0-3", "3-6"]);
    expect(toggleAgeBand(sel.next, "12+")).toEqual({ next: ["0-3", "3-6"], rejected: true });
  });
  it("only the ends of the block can be removed — never splits it", () => {
    const all = ["0-3", "3-6", "6-12"] as const;
    expect(toggleAgeBand(all, "3-6")).toEqual({ next: ["0-3", "3-6", "6-12"], rejected: true });
    expect(toggleAgeBand(all, "6-12").next).toEqual(["0-3", "3-6"]);
  });
});

describe("ageRangeFromBands", () => {
  it("maps to the stored continuous [min, max]; none → null (unknown, nothing written)", () => {
    expect(ageRangeFromBands([])).toBeNull();
    expect(ageRangeFromBands(["0-3"])).toEqual({ min: 0, max: 3 });
    expect(ageRangeFromBands(["3-6", "6-12"])).toEqual({ min: 3, max: 12 });
    expect(ageRangeFromBands(["12+"])).toEqual({ min: 12, max: 12 });
  });
});

describe("answers", () => {
  it("unknown never becomes false", () => {
    const input: Record<string, unknown> = {};
    applyAnswers(input, { wc: "yes", benches: "no" });
    expect(input).toEqual({ wc: true, benches: false });
    expect("water" in input).toBe(false);
  });
  it("setAnswer(null) removes the key without mutating", () => {
    const a = { wc: "yes" as const };
    const b = setAnswer(a, "wc", null);
    expect(b).toEqual({});
    expect(a).toEqual({ wc: "yes" });
  });
});
