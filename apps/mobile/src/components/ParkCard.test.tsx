import { describe, expect, it, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Park } from "@toboggo/shared";
import "../i18n/testInit";
import { ParkCard } from "./ParkCard";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Explore `carousel` card (photo cards): full-bleed photo, distance pill,
// favourite, name, rating + reviews (only with reviews), age band. Walking
// time and equipment pictograms are gone. Everything stays real data: absent
// data means absent element. Test fixture only.
// `Intl` may emit (narrow) no-break spaces — compare on normalised text.
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const pill = (card: HTMLElement) => norm(card.querySelector('[class*="_distPill_"]')?.textContent);

function park(extra: Partial<Park> = {}): Park {
  return {
    id: "p1",
    name: "Parc de la Mairie",
    photos: [],
    rating: 0,
    review_count: 0,
    age_min: null,
    age_max: null,
    fenced: null,
    shade: null,
    wc: null,
    pmr: null,
    ...extra,
  } as Park;
}

function renderCard(p: Park, props: { favorite?: boolean; distanceM?: number; onOpen?: () => void; onToggleFavorite?: () => void } = {}) {
  const { container } = render(
    <MemoryRouter>
      <ParkCard
        park={p}
        distanceM={"distanceM" in props ? props.distanceM : 350}
        favorite={props.favorite}
        onToggleFavorite={props.onToggleFavorite ?? vi.fn()}
        onOpen={props.onOpen ?? vi.fn()}
        variant="carousel"
      />
    </MemoryRouter>,
  );
  return container.firstElementChild as HTMLElement;
}

const cardCss = readFileSync(resolve(__dirname, "ParkCard.module.css"), "utf8");
const rule = (name: string) => cardCss.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1] ?? "";

describe("ParkCard carousel — photo card", () => {
  const full = park({
    photos: ["https://example.test/p.jpg"],
    rating: 4.8,
    review_count: 23,
    age_min: 3,
    age_max: 6,
    pmr: true,
    shade: true,
  });

  it("shows photo, distance, favourite, name, rating, review count and age", () => {
    const card = renderCard(full, { favorite: true, distanceM: 350 });
    const q = within(card);
    expect((card.querySelector("img") as HTMLImageElement).getAttribute("src")).toBe("https://example.test/p.jpg");
    expect(q.getByText("Parc de la Mairie")).toBeTruthy();
    expect(q.getByText("4,8")).toBeTruthy();
    expect(q.getByText("(23)")).toBeTruthy();
    expect(q.getByText("3–6 ans")).toBeTruthy();
    expect(pill(card)).toBe("350 m");
    const fav = q.getByRole("button", { name: "Retirer des favoris" });
    expect(fav.getAttribute("aria-pressed")).toBe("true");
    expect((fav.querySelector("svg") as SVGElement).style.color).toBe("var(--color-primary)");
  });

  it("no longer shows walking time nor equipment pictograms", () => {
    const card = renderCard(full, { distanceM: 350 });
    expect(card.textContent).not.toMatch(/min/);
    expect(within(card).queryByRole("img", { name: "PMR" })).toBeNull();
    expect(within(card).queryByRole("img", { name: "Ombragé" })).toBeNull();
    expect(card.querySelector('[class*="_fact_"]')).toBeNull();
  });

  it("orders the bottom block: name, rating + reviews, age", () => {
    const card = renderCard(full);
    const body = card.querySelector('[class*="_cardBody_"]') as HTMLElement;
    const rows = Array.from(body.children).map((el) => el.className.match(/_(cardName|cardRating|ageTag)_/)?.[1]);
    expect(rows).toEqual(["cardName", "cardRating", "ageTag"]);
  });

  it("shows an outline, unpressed heart when not a favourite", () => {
    const card = renderCard(full, { favorite: false });
    expect(within(card).getByRole("button", { name: "Ajouter aux favoris" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("never fabricates a rating, reviews, age or photo when the data is absent", () => {
    const card = renderCard(park());
    const text = card.textContent ?? "";
    expect(text).not.toMatch(/\(\d+\)/);
    expect(text).not.toContain("0,0");
    expect(text).not.toMatch(/ans|Tout âge|non renseign/);
    expect(card.querySelector('[class*="_ageTag_"]')).toBeNull();
    expect(card.querySelector('[class*="_cardRating_"]')).toBeNull();
    expect(card.querySelector('[style*="background-image"]')).toBeNull();
    expect(within(card).getByRole("img", { name: /illustration/i })).toBeTruthy(); // existing fallback, unchanged
  });

  it("keeps the 'Illustration' tag on illustrated covers, and none on a real photo", () => {
    expect(within(renderCard(park())).getByText("Illustration")).toBeTruthy();
    expect(within(renderCard(full)).queryByText("Illustration")).toBeNull();
  });

  it("hides the distance pill when the distance is unknown", () => {
    const card = renderCard(full, { distanceM: undefined });
    expect(card.querySelector('[class*="_distPill_"]')).toBeNull();
  });

  it("keeps the interactions: tap opens, Enter opens, heart toggles without opening", () => {
    const onOpen = vi.fn();
    const onToggleFavorite = vi.fn();
    const card = renderCard(full, { onOpen, onToggleFavorite });

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);

    fireEvent.click(within(card).getByRole("button", { name: /favoris/ }));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["short", "Parc Voltaire"],
    ["long", "Aire de jeux du Quai Sully-Chaliès et du jardin des Plantes de Millau"],
  ])("%s name: kept whole in the DOM, clamped to two lines by CSS", (_, name) => {
    const card = renderCard(park({ name, rating: 4.8, review_count: 23 }));
    expect(card.querySelector('[class*="_cardName_"]')?.textContent).toBe(name);
    const css = rule("cardName");
    expect(css).toMatch(/-webkit-line-clamp: 2;/);
    expect(css).toMatch(/overflow: hidden;/);
  });

  it("list variant: active heart uses the brand green token too", () => {
    const { container } = render(
      <MemoryRouter>
        <ParkCard park={park()} favorite onToggleFavorite={vi.fn()} variant="list" />
      </MemoryRouter>,
    );
    const heart = within(container).getByRole("button", { name: "Retirer des favoris" });
    expect((heart.querySelector("svg") as SVGElement).style.color).toBe("var(--color-primary)");
  });

  it("is a photo-first card: full-bleed photo, gradient scrim, 44px favourite hit area", () => {
    expect(rule("cardPhoto")).toMatch(/inset: 0;/);
    expect(rule("cardShade")).toMatch(/linear-gradient\(/);
    expect(cardCss).toMatch(/\.favFloat \.favBtn \{[^}]*width: 44px;[^}]*height: 44px;/);
  });
});

// `row` variant — used by Favorites and NotifResolved. `location` (LOT 1A,
// added for Favorites) must never change existing callers that don't pass it.
describe("ParkCard row variant", () => {
  function renderRow(
    p: Park,
    props: { distanceM?: number; location?: string | null; favorite?: boolean; onToggleFavorite?: () => void } = {},
  ) {
    const { container } = render(
      <MemoryRouter>
        <ParkCard
          park={p}
          distanceM={props.distanceM}
          location={props.location}
          favorite={props.favorite}
          onToggleFavorite={props.onToggleFavorite}
          variant="row"
        />
      </MemoryRouter>,
    );
    return container.firstElementChild as HTMLElement;
  }
  const meta = (row: HTMLElement) => norm(row.querySelector('[class*="_meta_"]')?.textContent);

  it("keeps the pre-existing meta line (distance · age, no location) when `location` isn't passed", () => {
    const row = renderRow(park({ age_min: 3, age_max: 6 }), { distanceM: 350 });
    expect(meta(row)).toBe("350 m · 3–6 ans");
  });

  it("shows the location only when there is no known distance", () => {
    const withLocation = renderRow(park({ age_min: 3, age_max: 6 }), { location: "Lyon" });
    expect(meta(withLocation)).toBe("Lyon · 3–6 ans");

    const distanceWins = renderRow(park({ age_min: 3, age_max: 6 }), { distanceM: 350, location: "Lyon" });
    expect(meta(distanceWins)).toBe("350 m · 3–6 ans");
  });

  it("never fabricates a location when the park has none", () => {
    const row = renderRow(park(), { location: null });
    expect(meta(row)).toBe("");
  });

  it("still shows photo, name, rating, review count and the favourite heart", () => {
    const row = renderRow(park({ photos: ["https://example.test/p.jpg"], rating: 4.5, review_count: 12 }), {
      favorite: true,
      onToggleFavorite: vi.fn(),
    });
    const q = within(row);
    const photo = row.querySelector("img") as HTMLImageElement;
    expect(photo.getAttribute("src")).toBe("https://example.test/p.jpg");
    expect(q.getByText("4,5")).toBeTruthy();
    expect(q.getByText("(12)")).toBeTruthy();
    expect(q.getByRole("button", { name: "Retirer des favoris" })).toBeTruthy();
  });
});

// LOT 1B — `favorite` variant (Favorites list). New composition, so exercised
// on its own rather than piggy-backing the `row` assertions above.
describe("ParkCard favorite variant", () => {
  function renderFavorite(
    p: Park,
    props: {
      distanceM?: number;
      location?: string | null;
      favorite?: boolean;
      onOpen?: () => void;
      onToggleFavorite?: () => void;
    } = {},
  ) {
    const { container } = render(
      <MemoryRouter>
        <ParkCard
          park={p}
          distanceM={props.distanceM}
          location={props.location}
          favorite={props.favorite}
          onOpen={props.onOpen}
          onToggleFavorite={props.onToggleFavorite}
          variant="favorite"
        />
      </MemoryRouter>,
    );
    return container.firstElementChild as HTMLElement;
  }
  const meta = (card: HTMLElement) => norm(card.querySelector('[class*="_favMeta_"]')?.textContent);
  const factLabels = (card: HTMLElement) =>
    Array.from(card.querySelectorAll('[class*="_favFact_"]')).map((el) => el.getAttribute("aria-label"));
  const chipTexts = (card: HTMLElement) => Array.from(card.querySelectorAll('[class*="_chip_"]')).map((el) => norm(el.textContent));

  const full = park({
    name: "Parc Voltaire",
    city: "Lyon",
    photos: ["https://example.test/p.jpg"],
    rating: 4.6,
    review_count: 31,
    age_min: 3,
    age_max: 6,
    play_equipment: ["toboggan", "swing"],
    pmr: true,
  });

  it("shows photo, name, location + distance on one line, age, equipment, rating and reviews", () => {
    const card = renderFavorite(full, { distanceM: 850, location: "Lyon" });
    const q = within(card);
    const photo = card.querySelector("img") as HTMLImageElement;
    expect(photo.getAttribute("src")).toBe("https://example.test/p.jpg");
    expect(q.getByText("Parc Voltaire")).toBeTruthy();
    expect(meta(card)).toBe("Lyon · 850 m");
    expect(chipTexts(card)).toContain("3–6 ans");
    expect(factLabels(card)).toEqual(["Toboggan", "Balançoire", "Accès fauteuil roulant"]);
    expect(q.getByText("4,6")).toBeTruthy();
    expect(q.getByText("(31)")).toBeTruthy();
  });

  it("shows only the location when there is no user position (never fabricates a distance)", () => {
    const card = renderFavorite(full, { location: "Lyon", distanceM: undefined });
    expect(meta(card)).toBe("Lyon");
  });

  it("renders no meta line at all when neither location nor distance is known", () => {
    const card = renderFavorite(park({ name: "Parc Sully" }));
    expect(card.querySelector('[class*="_favMeta_"]')).toBeNull();
  });

  it("falls back to the branded placeholder when the park has no photo", () => {
    const card = renderFavorite(park({ name: "Parc Sully" }));
    expect(card.querySelector('[style*="background-image"]')).toBeNull();
    expect(within(card).getByRole("img", { name: /photo/i })).toBeTruthy();
  });

  it("keeps a long name intact in the DOM (only visually clamped to 2 lines by CSS)", () => {
    const longName = "Aire de jeux du Quai Sully-Chaliès et du jardin des Plantes de Millau";
    const card = renderFavorite(park({ name: longName }));
    expect(within(card).getByText(longName)).toBeTruthy();
  });

  it("shows at most 3 equipment/amenity icons and a +X for the rest", () => {
    const card = renderFavorite(
      park({ play_equipment: ["toboggan", "swing", "sandbox", "springs"], pmr: true, shade: true }),
    );
    expect(factLabels(card)).toEqual(["Toboggan", "Balançoire", "Bac à sable"]);
    expect(chipTexts(card)).toContain("+3"); // springs, shade, pmr left out
  });

  it("shows no equipment icons and no age chip when the park has neither", () => {
    const card = renderFavorite(park({ name: "Parc Sully" }));
    expect(card.querySelector('[class*="_favChips_"]')).toBeNull();
  });

  it("shows the age chip alone when there's an age but no known equipment", () => {
    const card = renderFavorite(park({ age_min: 0, age_max: 12 }));
    expect(chipTexts(card)).toEqual(["Tout âge"]);
    expect(factLabels(card)).toEqual([]);
  });

  it("never fabricates a rating when the park has none", () => {
    const card = renderFavorite(park({ name: "Parc Sully" }));
    expect(card.textContent).not.toMatch(/\(\d+\)/);
  });

  it("clicking the card opens the park", () => {
    const onOpen = vi.fn();
    const card = renderFavorite(full, { onOpen });
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("removing the favorite calls onToggleFavorite without opening the card", () => {
    const onOpen = vi.fn();
    const onToggleFavorite = vi.fn();
    const card = renderFavorite(full, { favorite: true, onOpen, onToggleFavorite });
    fireEvent.click(within(card).getByRole("button", { name: "Retirer des favoris" }));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
