import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Park } from "@toboggo/shared";
import "../../i18n/testInit";
import MapExplore from "./MapExplore";
import { useGeo, DEFAULT_GEO_LABEL } from "../../lib/geo";
import { useFilters } from "../../lib/filters";

// No VITE_MAP_STYLE_URL in this test env → MapCanvas renders the FakeMap
// fallback, whose pins are plain `<button aria-label={parkName}>` elements —
// real enough to exercise "tap a marker" vs. "tap the background" without a
// MapLibre mock (this screen has no other DOM handle on the map). Built inside
// `vi.hoisted` since `vi.mock` factories below are hoisted above this module's
// own top-level consts.
const { PARK_A, PARK_B } = vi.hoisted(() => {
  const a: Park & { distance_m?: number } = {
    id: "p1",
    name: "Square Voltaire",
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
    formatted_address: "1 rue de la Paix, 69000 Lyon",
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
    distance_m: 120,
  };
  const b: Park & { distance_m?: number } = {
    ...a,
    id: "p2",
    name: "Parc de la Tête d'Or",
    latitude: 45.7736,
    longitude: 4.8546,
    lat: 45.7736,
    lng: 4.8546,
    distance_m: 900,
  };
  return { PARK_A: a, PARK_B: b };
});

// MapCanvas imports "maplibre-gl" unconditionally — merely importing it
// crashes under jsdom (it calls `window.URL.createObjectURL` at module scope)
// regardless of which branch (real map vs. FakeMap) ends up rendering. No
// VITE_MAP_STYLE_URL is set in this test env, so MapCanvas always falls back
// to FakeMap here; this stub only needs to exist, not to do anything.
vi.mock("maplibre-gl", () => ({
  __esModule: true,
  default: { Map: class {}, Marker: class {}, NavigationControl: class {} },
}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    fetchNearbyParks: vi.fn().mockResolvedValue([PARK_A, PARK_B]),
    fetchWeather: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("../../lib/session", () => ({
  useSession: (sel?: (s: unknown) => unknown) => {
    const s = { userId: null, profile: { favorites: [] as string[] }, toggleFavorite: vi.fn() };
    return sel ? sel(s) : s;
  },
}));

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

// Peek shows the "Autour de vous" header alone: its count within the active
// (default 2 km) radius is the peek marker. Medium adds the contextual
// filters, whose always-present "À proximité" chip is the medium marker.
const PEEK_COUNT = "2 parcs à moins de 2 km";
const MEDIUM_MARKER = "À proximité";

// Pins render as `<button aria-label={parkName}>` in the FakeMap fallback,
// once the parks query has resolved — `findByRole` waits for that.
const pin = (name: string) => screen.findByRole("button", { name });
// The sheet's drag handle — a plain tap on it advances one snap for
// discoverability (BottomSheet's own behaviour, untouched here); used to
// reach medium/expanded without simulating a real drag gesture.
const tapHandle = () => {
  const handle = document.body.querySelector('[data-sheet-handle]') as Element;
  fireEvent.pointerDown(handle, { pointerId: 1, clientY: 500 });
  fireEvent.pointerUp(handle, { pointerId: 1, clientY: 500 });
};
const tapMapBackground = () => {
  const bg = document.body.querySelector('[class*="map"]') as Element;
  fireEvent.click(bg);
};

describe("Explorer — map tap behaviour", () => {
  beforeEach(() => {
    useGeo.setState({ lat: 45.764, lng: 4.8357, label: DEFAULT_GEO_LABEL, permission: "granted", hasFix: true });
    useFilters.getState().reset();
  });

  it("selected park + tap on empty map → deselects and the sheet returns to peek", async () => {
    renderExplore();
    fireEvent.click(await pin("Square Voltaire"));
    expect(await screen.findByText("Itinéraire")).toBeTruthy(); // ParkPreview-only CTA

    tapMapBackground();

    // Deselected: the preview panel is gone, back to the list sheet's peek content.
    expect(screen.queryByText("Itinéraire")).toBeNull();
    expect(await screen.findByText(PEEK_COUNT)).toBeTruthy();
  });

  it("selected park A + tap on marker B → B shows directly, no flash through peek", async () => {
    renderExplore();
    fireEvent.click(await pin("Square Voltaire"));
    await screen.findByText("Square Voltaire");

    fireEvent.click(await pin("Parc de la Tête d'Or"));

    expect(await screen.findByText("Parc de la Tête d'Or")).toBeTruthy();
    expect(screen.queryByText("Square Voltaire")).toBeNull();
    // Never dropped into the list sheet's peek content in between.
    expect(screen.queryByText(PEEK_COUNT)).toBeNull();
  });

  it("sheet at medium + tap on visible map → back to peek", async () => {
    renderExplore();
    await screen.findByText(PEEK_COUNT); // peek content loaded

    tapHandle(); // peek → medium
    expect(await screen.findByText(MEDIUM_MARKER)).toBeTruthy();

    tapMapBackground();

    expect(await screen.findByText(PEEK_COUNT)).toBeTruthy();
    expect(screen.queryByText(MEDIUM_MARKER)).toBeNull();
  });

  it("sheet at expanded + tap on visible map → back to peek", async () => {
    renderExplore();
    await screen.findByText(PEEK_COUNT);

    tapHandle(); // peek → medium
    await screen.findByText(MEDIUM_MARKER);
    tapHandle(); // medium → expanded
    expect(await screen.findByText("Tous les parcs autour de vous")).toBeTruthy();

    tapMapBackground();

    expect(await screen.findByText(PEEK_COUNT)).toBeTruthy();
    expect(screen.queryByText("Tous les parcs autour de vous")).toBeNull();
  });

  it("sheet already at peek + tap on empty map → no change", async () => {
    renderExplore();
    await screen.findByText(PEEK_COUNT);

    expect(() => tapMapBackground()).not.toThrow();
    expect(await screen.findByText(PEEK_COUNT)).toBeTruthy();
  });
});
