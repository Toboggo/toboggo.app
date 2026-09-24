import { describe, expect, it, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Park } from "@toboggo/shared";
import "../i18n/testInit";
import { ParkCard } from "./ParkCard";

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

    const photo = card.querySelector('[style*="background-image"]') as HTMLElement;
    expect(photo.style.backgroundImage).toContain("https://example.test/p.jpg");
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
