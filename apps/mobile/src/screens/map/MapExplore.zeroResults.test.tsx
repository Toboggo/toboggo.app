import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fetchNearbyParks, type Park } from "@toboggo/shared";
import "../../i18n/testInit";
import MapExplore from "./MapExplore";
import { useGeo, DEFAULT_GEO_LABEL } from "../../lib/geo";
import { useFilters } from "../../lib/filters";

// Full fixture (mirrors MapExplore.test.tsx's PARK_A) — several downstream
// components (ParkCard, the contextual carousel selection) read fields beyond
// id/name/coords, so a partial object risks crashing the render rather than
// exercising the "has real results" path this suite needs.
const REAL_PARK: Park & { distance_m: number } = {
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

/**
 * Timing of `zero_results` on the map screen — separate from
 * MapExplore.test.tsx (which fixes `fetchNearbyParks` to always resolve with
 * 2 parks) because these tests need to control exactly when/how the
 * nearby-parks query settles: still pending, rejected, or resolved empty.
 * Regression coverage for the bug found in the analytics audit: the event
 * used to be derived from `hasResults` alone, which defaults to `false`
 * (`parks = []`) for the entire loading window, firing `zero_results` before
 * the query had actually resolved.
 */

// Same rationale as MapExplore.test.tsx: MapCanvas imports maplibre-gl
// unconditionally, which crashes under jsdom merely by being imported.
vi.mock("maplibre-gl", () => ({
  __esModule: true,
  default: { Map: class {}, Marker: class {}, NavigationControl: class {} },
}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    fetchNearbyParks: vi.fn(),
    fetchWeather: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("../../lib/session", () => ({
  useSession: (sel?: (s: unknown) => unknown) => {
    const s = { userId: null, profile: { favorites: [] as string[] }, toggleFavorite: vi.fn() };
    return sel ? sel(s) : s;
  },
}));

const trackEventMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/analytics", () => ({ trackEvent: trackEventMock }));

function renderExplore() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/map"]}>
        <Routes>
          <Route path="/map" element={<MapExplore />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function zeroResultsCalls() {
  return trackEventMock.mock.calls.filter(([event]) => event === "zero_results");
}

describe("MapExplore — zero_results timing", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    // Permission granted, no place searched, no filters active: the only
    // reason left once the query settles empty is "default_area" (see
    // `deriveMapZeroResultReason`).
    useGeo.setState({ lat: 45.764, lng: 4.8357, label: DEFAULT_GEO_LABEL, permission: "granted", hasFix: true });
    useFilters.getState().reset();
  });

  afterEach(() => {
    vi.mocked(fetchNearbyParks).mockReset();
  });

  it("never tracks zero_results while the query is still loading, even though it would resolve empty", async () => {
    const gate = deferred<(Park & { distance_m: number })[]>();
    vi.mocked(fetchNearbyParks).mockReturnValueOnce(gate.promise);

    renderExplore();
    await screen.findByText("Recherche des parcs autour de vous…");
    expect(zeroResultsCalls()).toEqual([]);

    gate.resolve([]);
    await waitFor(() => expect(zeroResultsCalls()).toHaveLength(1));
    expect(zeroResultsCalls()[0][1]).toEqual({ reason: "default_area" });
  });

  it("never tracks zero_results when the query errors — a fetch failure isn't a real 0-result state", async () => {
    vi.mocked(fetchNearbyParks).mockRejectedValueOnce(new Error("network down"));

    renderExplore();
    await screen.findByText("Impossible de charger les parcs");

    expect(zeroResultsCalls()).toEqual([]);
  });

  it("tracks zero_results exactly once, only once the query has genuinely resolved with zero results", async () => {
    vi.mocked(fetchNearbyParks).mockResolvedValueOnce([]);

    renderExplore();
    await waitFor(() => expect(zeroResultsCalls()).toHaveLength(1));
    expect(zeroResultsCalls()[0][1]).toEqual({ reason: "default_area" });

    // Stays at exactly one call — no duplicate on subsequent re-renders
    // while the resolved "0 résultat" state doesn't change.
    await new Promise((r) => setTimeout(r, 0));
    expect(zeroResultsCalls()).toHaveLength(1);
  });

  it("does not track zero_results at all when the query resolves with real results", async () => {
    vi.mocked(fetchNearbyParks).mockResolvedValueOnce([REAL_PARK]);

    renderExplore();
    await screen.findByText("Square Voltaire");

    expect(zeroResultsCalls()).toEqual([]);
  });
});
