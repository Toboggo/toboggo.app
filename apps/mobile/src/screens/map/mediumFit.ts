/**
 * Height of the Explorer sheet's intermediate ("medium") snap.
 *
 * It used to be a flat share (47 %) of the zone between the search bar and the
 * bottom nav. The content shown there — header, contextual filters, carousel
 * — has an almost fixed height, so on any viewport shorter than the one the
 * ratio was tuned on (Safari with its bars, a nav that grew by the iOS
 * safe-area, iPhone SE) the cards ended up under the floating nav. The panel
 * is the part of the sheet above the nav (`BottomSheet` paints it down to the
 * screen edge behind the nav), so "cards fully visible" means:
 *   panelH >= grab strip + content above the cards + card height + margin.
 *
 * Pure so the invariant is testable without layout.
 */
import { SHEET_GRAB_H } from "@toboggo/design-system";

/** Breathing room kept between the bottom of the cards and the nav (px). */
export const MEDIUM_BOTTOM_MARGIN = 12;
/** The cards never shrink below this height (px): name, rating and age stay legible. */
export const MIN_CARD_H = 148;
/** Cards are 3:4 (see ParkCard.module.css `.card`). */
export const CARD_ASPECT = 4 / 3;
/** Share of the useful zone the medium snap may take before the cards shrink instead. */
export const MEDIUM_MAX_RATIO = 0.74;

export interface MediumFitInput {
  /** Viewport minus search-bar strip minus bottom nav (what the sheet may use). */
  usefulZoneH: number;
  /** Legacy proportional height (`usefulZoneH * MEDIUM_RATIO`) — the floor. */
  ratioH: number;
  /** Distance from the top of the sheet content to the top of the first card. */
  aboveCardsH: number;
  /** Card height at its natural 3:4 size. */
  naturalCardH: number;
}

export interface MediumFit {
  /** Panel height (above the nav) of the medium snap. */
  mediumH: number;
  /** Forced card height when the natural one doesn't fit, else `null`. */
  cardH: number | null;
}

export function fitMedium({ usefulZoneH, ratioH, aboveCardsH, naturalCardH }: MediumFitInput): MediumFit {
  const chrome = SHEET_GRAB_H + aboveCardsH + MEDIUM_BOTTOM_MARGIN;
  const needed = chrome + naturalCardH;
  const cap = Math.max(ratioH, Math.round(usefulZoneH * MEDIUM_MAX_RATIO));
  if (needed <= cap) return { mediumH: Math.round(Math.max(ratioH, needed)), cardH: null };
  // Too tall for the cap: shrink the cards (never below MIN_CARD_H), keeping the
  // text readable; if even that overflows, take what the zone allows.
  const cardH = Math.max(MIN_CARD_H, cap - chrome);
  return {
    mediumH: Math.round(Math.min(usefulZoneH, chrome + cardH)),
    cardH: cardH < naturalCardH ? cardH : null,
  };
}

/** Natural card height for a measured card width. */
export const naturalCardHeight = (cardWidth: number) => Math.round(cardWidth * CARD_ASPECT);
