import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Park } from "@toboggo/shared";
import "../../i18n/testInit";
import MapExplore from "./MapExplore";
import { useGeo, DEFAULT_GEO_LABEL } from "../../lib/geo";
import { useFilters } from "../../lib/filters";
import { useNearbyRadius } from "../../lib/nearbyRadius";
import { trackEvent } from "../../lib/analytics";

// Mutable per-test world: the parks the RPC "returns", the session and the
// children ages. Test fixtures only — the app itself never ships any.
const world = vi.hoisted(() => {
  const base = {
    slug: null,
    description: null,
    latitude: 45.764,
    longitude: 4.8357,
    lat: 45.764,
    lng: 4.8357,
    boundary: null,
    country_code: "FR",
    timezone: "Europe/Paris",
    address_line: null,
    postal_code: null,
    city: null,
    admin_area_1: null,
    admin_area_2: null,
    min_age: null,
    max_age: null,
    ages_derived: false,
    moderation_status: "published",
    operational_status: "active",
    status_reason: null,
    status_from: null,
    status_until: null,
    verification_status: "unverified",
    created_by: null,
    rating: 0,
    review_count: 0,
    has_open_report: false,
    views: 0,
    created_at: "",
    updated_at: "",
    last_verified_at: null,
    features: {},
    cover_photo: null,
    photos: [],
    translated_names: [],
    score: null,
    has_score: false,
    age_min: null,
    age_max: null,
    status: "published",
    formatted_address: "—",
    commune_id: null,
    organization_id: null,
    surface: "non_precise",
    play_equipment: [],
    wc: null,
    shade: null,
    fenced: null,
    pmr: null,
    benches: null,
    water: null,
    parking: null,
  };
  return {
    base,
    parks: [] as unknown[],
    userId: null as string | null,
    favorites: [] as string[],
    childAges: [] as number[],
  };
});

function park(id: string, name: string, distance_m: number, extra: Partial<Park> = {}) {
  return { ...world.base, id, name, distance_m, ...extra } as Park & { distance_m: number };
}

vi.mock("maplibre-gl", () => ({
  __esModule: true,
  default: { Map: class {}, Marker: class {}, NavigationControl: class {} },
}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    fetchNearbyParks: vi.fn(() => Promise.resolve(world.parks)),
    fetchWeather: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("../../lib/session", () => ({
  useSession: (sel?: (s: unknown) => unknown) => {
    const s = { userId: world.userId, profile: { favorites: world.favorites }, toggleFavorite: vi.fn() };
    return sel ? sel(s) : s;
  },
}));

vi.mock("../../lib/children", () => ({
  useChildAges: () => world.childAges,
  useChildren: () => ({ data: [] }),
}));

vi.mock("../../lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/analytics")>();
  return { ...actual, trackEvent: vi.fn() };
});

function renderExplore() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/map"]}>
        <Routes>
          <Route path="/map" element={<MapExplore />} />
          <Route path="/park/:id" element={<div>FICHE PARC</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tapHandle = () => {
  const handle = document.body.querySelector("[data-sheet-handle]") as Element;
  fireEvent.pointerDown(handle, { pointerId: 1, clientY: 500 });
  fireEvent.pointerUp(handle, { pointerId: 1, clientY: 500 });
};
// CSS-module class names keep the source name (`_card_<hash>`) under Vitest.
const carouselCards = () => document.body.querySelectorAll('[class*="_card_"]');
const listCards = () => document.body.querySelectorAll('[class*="_listCard_"]');
const sheetText = () => document.body.textContent ?? "";
// Scoped: the bottom nav also has a "Favoris" tab.
const filterChips = () => screen.getByRole("group", { name: "Filtrer les parcs autour de vous" });

async function toMedium(peekCount: string | RegExp) {
  await screen.findByText(peekCount);
  tapHandle();
  await screen.findByText("À proximité");
}

beforeEach(() => {
  useGeo.setState({ lat: 45.764, lng: 4.8357, label: DEFAULT_GEO_LABEL, permission: "granted", hasFix: true });
  useFilters.getState().reset();
  useNearbyRadius.setState({ radiusKm: 2 });
  world.parks = [];
  world.userId = null;
  world.favorites = [];
  world.childAges = [];
  vi.mocked(trackEvent).mockClear();
});

describe("Autour de vous — peek", () => {
  it("shows only the compact header: count within the default 2 km radius + Zone, no card", async () => {
    world.parks = [park("a", "Parc A", 300), park("b", "Parc B", 1200), park("c", "Parc C", 1900), park("far", "Parc Loin", 8000)];
    renderExplore();

    expect(await screen.findByText("3 parcs à moins de 2 km")).toBeTruthy();
    expect(screen.getByText("Autour de vous")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Zone de recherche : 2 km/ })).toBeTruthy();
    expect(screen.getByText("Zone : 2 km")).toBeTruthy();
    expect(carouselCards()).toHaveLength(0);
    expect(screen.queryByText("À proximité")).toBeNull();
  });

  it("the chevron raises the sheet to medium", async () => {
    world.parks = [park("a", "Parc A", 300)];
    renderExplore();
    await screen.findByText("1 parc à moins de 2 km");
    fireEvent.click(screen.getByRole("button", { name: "Afficher les parcs autour de vous" }));
    expect(await screen.findByText("À proximité")).toBeTruthy();
  });
});

describe("Autour de vous — medium", () => {
  it("caps the carousel at 8 cards while the count stays the total", async () => {
    world.parks = Array.from({ length: 62 }, (_, i) => park(`p${i}`, `Parc ${i}`, 10 + i * 30));
    renderExplore();
    await toMedium("62 parcs à moins de 2 km");
    expect(carouselCards()).toHaveLength(8);
  });

  it("shows only the parks available when fewer than 8, nearest first", async () => {
    world.parks = [park("b", "Parc B", 900), park("a", "Parc A", 200), park("c", "Parc C", 1500), park("far", "Parc Loin", 6000)];
    renderExplore();
    await toMedium("3 parcs à moins de 2 km");
    const cards = carouselCards();
    expect(cards).toHaveLength(3);
    expect(cards[0].textContent).toContain("Parc A");
    const dist = (cards[0].querySelector('[class*="_cardDist_"]')?.textContent ?? "").replace(/\s+/g, " ");
    expect(dist).toBe("200 m · 3 min"); // distance + walking time kept on the card
  });

  it("offers 'Envie de plus d'options ?' only when parks exist beyond the radius", async () => {
    world.parks = [park("a", "Parc A", 200), park("far", "Parc Loin", 6000)];
    renderExplore();
    await toMedium("1 parc à moins de 2 km");
    fireEvent.click(screen.getByText("Envie de plus d’options ?"));
    expect(await screen.findByText("Zone de recherche")).toBeTruthy();
    expect(useNearbyRadius.getState().radiusKm).toBe(2); // opens the picker, never changes the radius itself
  });

  it("hides 'Envie de plus d'options ?' when nothing lies beyond the radius", async () => {
    world.parks = [park("a", "Parc A", 200)];
    renderExplore();
    await toMedium("1 parc à moins de 2 km");
    expect(screen.queryByText("Envie de plus d’options ?")).toBeNull();
  });

  it("never shows the removed blocks, Nouveautés, Populaires nor any emoji", async () => {
    world.parks = [park("a", "Parc A", 200)];
    world.userId = "u1";
    world.favorites = ["a"];
    world.childAges = [4];
    renderExplore();
    await toMedium("1 parc à moins de 2 km");
    const text = sheetText();
    for (const gone of ["Vos favoris à proximité", "À découvrir", "Nouveautés", "Populaires"]) {
      expect(text).not.toContain(gone);
    }
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("Autour de vous — contextual filters", () => {
  const parks = () => [
    park("fav", "Parc Favori", 300, { age_min: 3, age_max: 6 }),
    park("kid", "Parc Petits", 600, { age_min: 1, age_max: 3 }),
    park("other", "Parc Autre", 900),
  ];

  it("hides Favoris and Pour mes enfants for a guest without children", async () => {
    world.parks = parks();
    renderExplore();
    await toMedium("3 parcs à moins de 2 km");
    expect(within(filterChips()).getAllByRole("button").map((b) => b.textContent)).toEqual(["À proximité"]);
  });

  it("Favoris (logged in) keeps only favorites of the zone, heart filled", async () => {
    world.parks = parks();
    world.userId = "u1";
    world.favorites = ["fav"];
    renderExplore();
    await toMedium("3 parcs à moins de 2 km");
    fireEvent.click(within(filterChips()).getByRole("button", { name: "Favoris" }));
    const cards = carouselCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain("Parc Favori");
    expect(within(cards[0] as HTMLElement).getByRole("button", { name: /Retirer des favoris/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("3 parcs à moins de 2 km")).toBeTruthy(); // count = the whole zone
  });

  it("Pour mes enfants appears with a known child age and filters by age range", async () => {
    world.parks = parks();
    world.childAges = [2];
    renderExplore();
    await toMedium("3 parcs à moins de 2 km");
    const chips = filterChips();
    fireEvent.click(within(chips).getByRole("button", { name: "Pour mes enfants" }));
    const cards = carouselCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain("Parc Petits");
  });
});

describe("Autour de vous — expanded", () => {
  it("keeps ParkList, restricted to the active radius", async () => {
    world.parks = [park("a", "Parc A", 500), park("b", "Parc B", 1500), park("far", "Parc Loin", 4000)];
    renderExplore();
    await toMedium("2 parcs à moins de 2 km");
    tapHandle(); // medium → expanded
    expect(await screen.findByText("Tous les parcs autour de vous")).toBeTruthy();
    expect(screen.getByText("Proximité")).toBeTruthy(); // ParkList's own sort chips kept
    expect(listCards()).toHaveLength(2);
    expect(Array.from(listCards()).some((c) => c.textContent?.includes("Parc Loin"))).toBe(false);
  });
});

describe("Autour de vous — zone picker", () => {
  it("2 → 5 km through the picker changes count, carousel and list", async () => {
    world.parks = [park("a", "Parc A", 500), park("b", "Parc B", 3000), park("c", "Parc C", 4500), park("far", "Parc Loin", 12000)];
    renderExplore();
    await screen.findByText("1 parc à moins de 2 km");

    fireEvent.click(screen.getByRole("button", { name: /Zone de recherche : 2 km/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Afficher les parcs autour de votre position")).toBeTruthy();
    expect(within(dialog).getAllByRole("radio")).toHaveLength(5);
    expect(within(dialog).getByRole("radio", { name: /^2 km/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(dialog).getByRole("radio", { name: /^5 km/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Appliquer" }));

    expect(await screen.findByText("3 parcs à moins de 5 km")).toBeTruthy();
    expect(screen.getByText("Zone : 5 km")).toBeTruthy();
    expect(useNearbyRadius.getState().radiusKm).toBe(5);
    tapHandle();
    await screen.findByText("À proximité");
    expect(carouselCards()).toHaveLength(3);
  });

  it("closing the picker without applying keeps the radius", async () => {
    world.parks = [park("a", "Parc A", 500)];
    renderExplore();
    await screen.findByText("1 parc à moins de 2 km");
    fireEvent.click(screen.getByRole("button", { name: /Zone de recherche : 2 km/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /^20 km/ }));
    fireEvent.click(dialog.parentElement as HTMLElement); // backdrop
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useNearbyRadius.getState().radiusKm).toBe(2);
  });
});

describe("Autour de vous — empty zone", () => {
  it("0 park within 2 km: real suggestions up to 10 km, radius untouched until the explicit CTA", async () => {
    world.parks = [park("x", "Parc X", 3200), park("y", "Parc Y", 5600), park("z", "Parc Z", 7400), park("out", "Parc Hors", 14000)];
    renderExplore();
    expect(await screen.findByText("Aucun parc à moins de 2 km")).toBeTruthy();
    expect(carouselCards()).toHaveLength(0); // peek: still no card

    tapHandle();
    expect(await screen.findByText("Des parcs un peu plus loin")).toBeTruthy();
    expect(carouselCards()).toHaveLength(3);
    expect(sheetText()).not.toContain("Parc Hors");
    expect(screen.getByText("Zone : 2 km")).toBeTruthy();
    expect(useNearbyRadius.getState().radiusKm).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Voir des parcs à moins de 10 km" }));
    expect(await screen.findByText("3 parcs à moins de 10 km")).toBeTruthy();
    expect(screen.getByText("Zone : 10 km")).toBeTruthy();
    expect(useNearbyRadius.getState().radiusKm).toBe(10);
  });

  it("nothing up to 10 km: Toboggo empty state whose CTA opens the zone picker", async () => {
    world.parks = [park("out", "Parc Hors", 15000)];
    renderExplore();
    await screen.findByText("Aucun parc à moins de 2 km");
    tapHandle();
    expect(await screen.findByText("Aucun parc à proximité")).toBeTruthy();
    expect(screen.getByText("Élargissez la zone pour découvrir des parcs un peu plus loin.")).toBeTruthy();
    const art = document.body.querySelector('img[src*="04-playground-scene"]');
    expect(art).toBeTruthy();
    expect(carouselCards()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Élargir la zone" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(useNearbyRadius.getState().radiusKm).toBe(2);
  });
});

describe("Autour de vous — analytics", () => {
  it("only reuses existing events and never sends coordinates or personal data", async () => {
    world.parks = [park("a", "Parc A", 300, { age_min: 1, age_max: 5 }), park("far", "Parc Loin", 6000)];
    world.childAges = [3];
    renderExplore();
    await toMedium("1 parc à moins de 2 km");

    const chips = filterChips();
    fireEvent.click(within(chips).getByRole("button", { name: "Pour mes enfants" }));
    fireEvent.click(screen.getByRole("button", { name: /Zone de recherche : 2 km/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /^10 km/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Appliquer" }));
    await screen.findByText("2 parcs à moins de 10 km");

    const calls = vi.mocked(trackEvent).mock.calls;
    expect(calls).toContainEqual(["filter_applied", { filter_type: "for_children", filter_value: "true" }]);
    // No new event name: the radius change itself is not tracked in V1.
    const names = new Set(calls.map(([n]) => n));
    expect([...names].every((n) => ["map_viewed", "filter_applied", "zero_results"].includes(n))).toBe(true);
    for (const [, props] of calls) {
      const json = JSON.stringify(props ?? {});
      expect(json).not.toMatch(/lat|lng|latitude|longitude|address|45\.76|4\.83/i);
    }
  });
});
