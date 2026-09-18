import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Park } from "@toboggo/shared";
import "../../i18n/testInit";
import { ParkPreview } from "./ParkPreview";

const sess = vi.hoisted(() => ({ favorites: [] as string[] }));
vi.mock("../../lib/session", () => ({
  useSession: (sel?: (s: unknown) => unknown) => {
    const s = { profile: { favorites: sess.favorites } };
    return sel ? sel(s) : s;
  },
}));

const toasts = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock("../../lib/toast", () => ({
  useToastStore: (sel?: (s: unknown) => unknown) => {
    const s = { show: (m: string) => toasts.list.push(m) };
    return sel ? sel(s) : s;
  },
}));

const visits = vi.hoisted(() => ({ calls: [] as Array<[string, string]> }));
vi.mock("../../lib/visitPrompt", () => ({
  useVisitPrompt: (sel?: (s: unknown) => unknown) => {
    const s = { schedule: (parkId: string, parkName: string) => visits.calls.push([parkId, parkName]) };
    return sel ? sel(s) : s;
  },
}));

const PARK: Park & { distance_m?: number } = {
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
};

function renderPreview(park: Park & { distance_m?: number }) {
  return render(
    <MemoryRouter initialEntries={["/map"]}>
      <Routes>
        <Route path="/map" element={<ParkPreview park={park} onToggleFavorite={() => {}} />} />
        <Route path="/park/:id" element={<div>FICHE PARC</div>} />
        <Route path="/park/:id/directions" element={<div>ANCIEN ÉCRAN FACTICE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ParkPreview — Itinéraire CTA", () => {
  // `Location.assign` is spec-"unforgeable" (own, non-configurable) in jsdom —
  // `vi.spyOn` can't touch it, so the whole `window.location` is swapped for a
  // plain mock object instead.
  let originalLocation: Location;

  beforeEach(() => {
    toasts.list = [];
    visits.calls = [];
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  it("valid coordinates: navigates the current tab to external maps, no internal navigation to /directions", () => {
    renderPreview(PARK);
    fireEvent.click(screen.getByText("Itinéraire"));

    expect(window.location.assign).toHaveBeenCalledTimes(1);
    const [url] = (window.location.assign as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/^https:\/\/(maps\.apple\.com|www\.google\.com\/maps\/dir)\//);
    expect(screen.queryByText("ANCIEN ÉCRAN FACTICE")).toBeNull();
    expect(visits.calls).toEqual([["p1", "Square Voltaire"]]);
  });

  it("missing coordinates: shows a toast, navigates nowhere, does not crash", () => {
    renderPreview({ ...PARK, latitude: null as unknown as number, longitude: null as unknown as number });
    expect(() => fireEvent.click(screen.getByText("Itinéraire"))).not.toThrow();

    expect(window.location.assign).not.toHaveBeenCalled();
    expect(toasts.list).toEqual(["Itinéraire indisponible : coordonnées du parc manquantes."]);
    expect(screen.queryByText("ANCIEN ÉCRAN FACTICE")).toBeNull();
  });

  it("(0, 0) coordinates: treated as invalid", () => {
    renderPreview({ ...PARK, latitude: 0, longitude: 0 });
    fireEvent.click(screen.getByText("Itinéraire"));

    expect(window.location.assign).not.toHaveBeenCalled();
    expect(toasts.list).toEqual(["Itinéraire indisponible : coordonnées du parc manquantes."]);
  });
});
