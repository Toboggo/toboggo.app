import { describe, expect, it } from "vitest";
import { computeCanScroll } from "./BottomSheet";

// A carousel row taller than either crop — peek and medium are deliberately
// shorter than their content (see `MapExplore`'s `PEEK_H` / medium snap), so
// this same "overflowing" content must still not scroll below the tallest snap.
const CONTENT_H = 400;
const FIT_RESERVE = 12;

describe("computeCanScroll", () => {
  it("is false at peek (index 0 of 2), even with overflowing content", () => {
    expect(
      computeCanScroll({ lockScroll: false, index: 0, lastIdx: 2, contentH: CONTENT_H, fitReserve: FIT_RESERVE, height: 137 }),
    ).toBe(false);
  });

  it("is false at medium (index 1 of 2), even with overflowing content", () => {
    expect(
      computeCanScroll({ lockScroll: false, index: 1, lastIdx: 2, contentH: CONTENT_H, fitReserve: FIT_RESERVE, height: 300 }),
    ).toBe(false);
  });

  it("is true at expanded (the tallest snap) when the content overflows the panel", () => {
    expect(
      computeCanScroll({ lockScroll: false, index: 2, lastIdx: 2, contentH: CONTENT_H, fitReserve: FIT_RESERVE, height: 300 }),
    ).toBe(true);
  });

  it("is false at expanded when the content actually fits the panel", () => {
    expect(
      computeCanScroll({ lockScroll: false, index: 2, lastIdx: 2, contentH: 100, fitReserve: FIT_RESERVE, height: 600 }),
    ).toBe(false);
  });

  it("is always false when scroll is locked (a single-snap hand-off sheet)", () => {
    expect(
      computeCanScroll({ lockScroll: true, index: 0, lastIdx: 0, contentH: CONTENT_H, fitReserve: FIT_RESERVE, height: 137 }),
    ).toBe(false);
  });
});
