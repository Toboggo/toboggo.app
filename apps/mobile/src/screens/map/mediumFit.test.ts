import { describe, expect, it } from "vitest";
import { SHEET_GRAB_H } from "@toboggo/design-system";
import { MEDIUM_BOTTOM_MARGIN, MIN_CARD_H, fitMedium, naturalCardHeight } from "./mediumFit";

// Geometry of the Explorer sheet at its intermediate snap. The panel sits
// above the floating nav (`navTop = vh - navH`), its top is `navTop - mediumH`,
// the cards start `GRAB_H + aboveCardsH` below that. The invariant the real
// iPhone broke: cards bottom <= nav top - margin.
const MEDIUM_RATIO = 0.47; // MapExplore.tsx
const NAV_CONTENT_H = 56 + 10; // tokens: --bottom-nav-content-h + --bottom-nav-gap
const HEADER_BOTTOM = 78;
const ABOVE_CARDS_H = 86; // header + filter chips, as measured in the browser

const WIDTHS = [375, 390, 414];
const HEIGHTS = [568, 640, 664, 667, 736, 812, 844, 852, 896, 932];
const SAFE_BOTTOM = [0, 34]; // Safari with bars / standalone PWA with home indicator

function layout(vw: number, vh: number, safe: number) {
  const navH = NAV_CONTENT_H + safe;
  const usefulZoneH = vh - (HEADER_BOTTOM + 12) - navH;
  const cardW = Math.round((vw - 68) / 2); // two cards + 28px peek (ParkCard.module.css)
  const fit = fitMedium({
    usefulZoneH,
    ratioH: Math.round(usefulZoneH * MEDIUM_RATIO),
    aboveCardsH: ABOVE_CARDS_H,
    naturalCardH: naturalCardHeight(cardW),
  });
  const navTop = vh - navH;
  const sheetTop = navTop - fit.mediumH;
  const cardH = fit.cardH ?? naturalCardHeight(cardW);
  const cardsBottom = sheetTop + SHEET_GRAB_H + ABOVE_CARDS_H + cardH;
  return { fit, navTop, sheetTop, cardH, cardsBottom, usefulZoneH };
}

describe("fitMedium — cards stay above the nav at the intermediate snap", () => {
  for (const vw of WIDTHS)
    for (const vh of HEIGHTS)
      for (const safe of SAFE_BOTTOM) {
        it(`${vw}×${vh}, safe-area ${safe}px`, () => {
          const { fit, navTop, sheetTop, cardH, cardsBottom, usefulZoneH } = layout(vw, vh, safe);
          expect(cardsBottom).toBeLessThanOrEqual(navTop - MEDIUM_BOTTOM_MARGIN + 1); // 1px rounding
          expect(cardH).toBeGreaterThanOrEqual(MIN_CARD_H);
          expect(fit.mediumH).toBeLessThanOrEqual(usefulZoneH);
          // the map keeps some room above the sheet
          expect(sheetTop).toBeGreaterThanOrEqual(HEADER_BOTTOM + 12);
        });
      }

  it("keeps the natural 3:4 cards whenever they fit (no needless shrink)", () => {
    expect(layout(390, 844, 34).fit.cardH).toBeNull();
    expect(layout(414, 896, 34).fit.cardH).toBeNull();
    expect(layout(390, 664, 0).fit.cardH).toBeNull();
  });

  it("shrinks the cards, never below the legible minimum, on a very short screen", () => {
    const { fit, cardH } = layout(375, 568, 0);
    expect(fit.cardH).not.toBeNull();
    expect(cardH).toBeGreaterThanOrEqual(MIN_CARD_H);
    expect(cardH).toBeLessThan(naturalCardHeight(154));
  });

  it("never goes below the legacy proportional height", () => {
    const usefulZoneH = 700;
    const ratioH = Math.round(usefulZoneH * MEDIUM_RATIO);
    const fit = fitMedium({ usefulZoneH, ratioH, aboveCardsH: 10, naturalCardH: 100 });
    expect(fit.mediumH).toBe(ratioH);
    expect(fit.cardH).toBeNull();
  });
});
