import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeChildAge, MAX_CHILD_AGE_YEARS } from "./childAge.ts";

describe("computeChildAge", () => {
  it("counts a full past birth month as already had this year's birthday", () => {
    // Born September 2022, evaluated in December 2026 → birthday (Sep) already passed this year.
    assert.equal(computeChildAge({ birth_month: 9, birth_year: 2022 }, new Date(2026, 11, 1)), 4);
  });

  it("increments the age as soon as the current calendar month is the birth month", () => {
    // Born September 2022, evaluated in September 2026 → turns 4 this month (no known day, so already 4).
    assert.equal(computeChildAge({ birth_month: 9, birth_year: 2022 }, new Date(2026, 8, 1)), 4);
  });

  it("does not increment the age before the birth month is reached", () => {
    // Born September 2022, evaluated in August 2026 → still 3, birthday hasn't come yet this year.
    assert.equal(computeChildAge({ birth_month: 9, birth_year: 2022 }, new Date(2026, 7, 15)), 3);
  });

  it("handles the December → January wrap", () => {
    // Born December 2020, evaluated in January 2026 → 5 (turns 6 in December 2026).
    assert.equal(computeChildAge({ birth_month: 12, birth_year: 2020 }, new Date(2026, 0, 5)), 5);
  });

  it("returns 0 for a child born earlier this same calendar year", () => {
    assert.equal(computeChildAge({ birth_month: 2, birth_year: 2026 }, new Date(2026, 5, 1)), 0);
  });

  it("rejects a birth month/year in the future relative to `at`", () => {
    assert.equal(computeChildAge({ birth_month: 3, birth_year: 2027 }, new Date(2026, 5, 1)), null);
    // Same year, month not yet reached → also future.
    assert.equal(computeChildAge({ birth_month: 9, birth_year: 2026 }, new Date(2026, 5, 1)), null);
  });

  it("rejects invalid birth_month values", () => {
    assert.equal(computeChildAge({ birth_month: 0, birth_year: 2022 }), null);
    assert.equal(computeChildAge({ birth_month: 13, birth_year: 2022 }), null);
    assert.equal(computeChildAge({ birth_month: 1.5, birth_year: 2022 }), null);
  });

  it("rejects invalid birth_year values", () => {
    assert.equal(computeChildAge({ birth_month: 6, birth_year: NaN }), null);
  });

  it("exposes the recommendation age ceiling used to bound the birth-year picker", () => {
    assert.equal(MAX_CHILD_AGE_YEARS, 12);
  });
});
