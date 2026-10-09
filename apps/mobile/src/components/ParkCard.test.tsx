import { describe, expect, it, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Park } from "@toboggo/shared";
import "../i18n/testInit";
import { ParkCard } from "./ParkCard";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Non-regression of the Explore `carousel` card: everything the pre-redesign
// card showed (photo, age, favourite, name, rating + review count, distance +
// walking time) must still show when the data exists — and stay absent when
// it doesn't. Test fixture only.
// `Intl` may emit (narrow) no-break spaces — compare on normalised text.
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const distLine = (card: HTMLElement) => norm(card.querySelector('[class*="_cardDist_"]')?.textContent);

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

describe("ParkCard carousel — non-regression", () => {
  const full = park({
    photos: ["https://example.test/p.jpg"],
    rating: 4.8,
    review_count: 23,
    age_min: 3,
    age_max: 6,
    pmr: true,
  });

  it("shows photo, age, favourite, name, rating, review count, distance and walking time", () => {
    const card = renderCard(full, { favorite: true, distanceM: 350 });
    const q = within(card);

    const photo = card.querySelector("img") as HTMLImageElement;
    expect(photo.getAttribute("src")).toBe("https://example.test/p.jpg");
    expect(q.getByText("Parc de la Mairie")).toBeTruthy();
    expect(q.getByText("4,8")).toBeTruthy();
    expect(q.getByText("(23)")).toBeTruthy();
    expect(distLine(card)).toBe("350 m · 4 min"); // shared `walkMinutes` (~4.8 km/h)
    expect(q.getByText("3–6 ans")).toBeTruthy();
    expect(q.getByRole("img", { name: "PMR" })).toBeTruthy(); // known attribute kept
    const fav = q.getByRole("button", { name: "Retirer des favoris" });
    expect(fav.getAttribute("aria-pressed")).toBe("true");
  });

  it("puts the age badge on the photo and the favourite heart over it, brand-green when active", () => {
    const card = renderCard(full, { favorite: true });
    const media = card.querySelector('[class*="_media_"]') as HTMLElement;
    expect(within(media).getByText("3–6 ans")).toBeTruthy();
    const heart = within(media).getByRole("button", { name: "Retirer des favoris" });
    expect((heart.querySelector("svg") as SVGElement).style.color).toBe("var(--color-primary)");
  });

  it("orders the body: name, rating + reviews, distance · walking time", () => {
    const card = renderCard(full);
    const body = norm((card.querySelector('[class*="_cardBody_"]') as HTMLElement).textContent);
    const i = (txt: string) => body.indexOf(txt);
    expect(i("Parc de la Mairie")).toBeLessThan(i("4,8"));
    expect(i("4,8")).toBeLessThan(i("(23)"));
    expect(i("(23)")).toBeLessThan(i("350 m"));
  });

  it("shows up to two known attributes, and none when the park has none", () => {
    const both = renderCard(park({ pmr: true, shade: true, fenced: true }));
    const labels = Array.from(both.querySelectorAll('[class*="_fact_"]')).map((el) => el.getAttribute("aria-label"));
    expect(labels).toEqual(["Clôturé", "Ombragé"]);
    const none = renderCard(park({ age_min: 3, age_max: 6 }));
    expect(none.querySelectorAll('[class*="_fact_"]')).toHaveLength(0);
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
    expect(card.querySelector('[style*="background-image"]')).toBeNull();
    expect(within(card).getByRole("img", { name: /photo/i })).toBeTruthy(); // branded placeholder
  });

  it("hides distance and walking time when the distance is unknown", () => {
    const card = renderCard(full, { distanceM: undefined });
    expect(card.textContent).not.toMatch(/ m ·| km ·|min/);
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
});

describe("ParkCard carousel — walking time reuses the shared helper", () => {
  it("formats distance · minutes exactly like the list card", () => {
    render(
      <MemoryRouter>
        <ParkCard park={park()} distanceM={1240} variant="list" />
      </MemoryRouter>,
    );
    const listText = norm(document.body.querySelector('[class*="_listDist_"]')?.textContent);
    expect(listText).toMatch(/^1,2 km · \d+ min$/);
    const card = renderCard(park(), { distanceM: 1240 });
    expect(distLine(card)).toBe(listText);
  });
});

describe("ParkCard carousel — same vertical structure whatever the name length", () => {
  // jsdom has no layout: the alignment contract lives in the CSS rule itself.
  const cardCss = readFileSync(resolve(__dirname, "ParkCard.module.css"), "utf8");
  const rule = (name: string) => cardCss.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1] ?? "";

  it("always reserves two lines for the name, clamped at two with an ellipsis beyond", () => {
    const name = rule("cardName");
    expect(name).toMatch(/line-height: 1\.25;/);
    expect(name).toMatch(/min-height: calc\(2 \* 1\.25em\);/);
    expect(name).toMatch(/-webkit-line-clamp: 2;/);
    expect(name).toMatch(/overflow: hidden;/);
  });

  it("keeps a little extra space between distance · time and the attribute pictograms, on the same line", () => {
    expect(cardCss).toMatch(/\.cardDist \+ \.fact \{\s*margin-left: 4px;/);
    const card = renderCard(park({ pmr: true, shade: true }), { distanceM: 180 });
    const meta = card.querySelector('[class*="_cardMeta_"]') as HTMLElement;
    expect(norm(meta.querySelector('[class*="_cardDist_"]')?.textContent)).toBe("180 m · 2 min");
    expect(Array.from(meta.querySelectorAll('[class*="_fact_"]')).map((el) => el.getAttribute("aria-label"))).toEqual([
      "Ombragé",
      "PMR",
    ]);
  });

  it.each([
    ["short", "Parc Voltaire"],
    ["long", "Aire de jeux du Quai Sully-Chaliès et du jardin des Plantes de Millau"],
  ])("%s name: full name kept, same row order, rating + reviews + distance · time + attributes", (_, name) => {
    const onOpen = vi.fn();
    const onToggleFavorite = vi.fn();
    const card = renderCard(park({ name, rating: 4.8, review_count: 23, pmr: true }), { onOpen, onToggleFavorite });
    const body = card.querySelector('[class*="_cardBody_"]') as HTMLElement;
    const rows = Array.from(body.children).map((el) => el.className.match(/_(cardName|compactRating|cardMeta)_/)?.[1]);
    expect(rows).toEqual(["cardName", "compactRating", "cardMeta"]);
    expect(body.children[0].textContent).toBe(name); // never truncated in the data, only visually clamped
    expect(within(body).getByText("4,8")).toBeTruthy();
    expect(within(body).getByText("(23)")).toBeTruthy();
    expect(distLine(card)).toBe("350 m · 4 min");
    expect(within(card).getByRole("img", { name: "PMR" })).toBeTruthy();

    fireEvent.click(card);
    fireEvent.click(within(card).getByRole("button", { name: /favoris/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
  });

  it("does not reserve a fake rating row when the park has no review", () => {
    const card = renderCard(park({ name: "Parc Voltaire" }));
    const body = card.querySelector('[class*="_cardBody_"]') as HTMLElement;
    expect(Array.from(body.children).map((el) => el.className.match(/_(cardName|compactRating|cardMeta)_/)?.[1])).toEqual([
      "cardName",
      "cardMeta",
    ]);
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
