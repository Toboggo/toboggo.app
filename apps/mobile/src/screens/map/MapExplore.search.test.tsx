import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fetchNearbyParks, searchParks, searchPlaces, type Park } from "@toboggo/shared";
import "../../i18n/testInit";
import MapExplore from "./MapExplore";
import { useGeo, DEFAULT_GEO_LABEL } from "../../lib/geo";
import { useFilters } from "../../lib/filters";
import fr from "../../i18n/locales/fr/map.json";

// Explorer ↔ recherche : ce que l'écran fait de la sélection d'un lieu / d'un
// parc (centre du store, titre « Autour de … », fiche), avec le FakeMap (pas de
// style de carte en test) et le vrai SearchOverlay.
const { NEARBY_PARK, FAR_PARK } = vi.hoisted(() => {
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
  const far: Park & { distance_m?: number } = {
    ...a,
    id: "far",
    name: "Parc Lointain",
    city: "Roanne",
    formatted_address: "Avenue de Barcelone",
    latitude: 46.03,
    longitude: 4.07,
    lat: 46.03,
    lng: 4.07,
    distance_m: 0,
  };
  return { NEARBY_PARK: a, FAR_PARK: far };
});

vi.mock("maplibre-gl", () => ({
  __esModule: true,
  default: { Map: class {}, Marker: class {}, NavigationControl: class {} },
}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    // The parks "around" a centre: the far park only exists around its own coordinates.
    fetchNearbyParks: vi.fn(),
    fetchWeather: vi.fn().mockResolvedValue(null),
    searchParks: vi.fn(),
    searchPlaces: vi.fn(),
  };
});

vi.mock("../../lib/session", () => ({
  useSession: (sel?: (s: unknown) => unknown) => {
    const s = { userId: null, profile: { favorites: [] as string[] }, toggleFavorite: vi.fn() };
    return sel ? sel(s) : s;
  },
}));

// Parks "around" a centre: the far park only exists around its own coordinates.
const aroundCentre = async (p: { lat: number }) => (Math.abs(p.lat - 46.03) < 0.5 ? [FAR_PARK] : [NEARBY_PARK]);

const BARCELONA = {
  id: "es",
  name: "Barcelone",
  label: "Barcelone, Espagne",
  context: "Catalogne, Espagne",
  lat: 41.38,
  lng: 2.17,
  bbox: [2.05, 41.32, 2.23, 41.47] as [number, number, number, number],
};

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

async function openSearchAndType(value: string) {
  fireEvent.click(await screen.findByText(fr.searchPlaceholder));
  const input = (await screen.findAllByPlaceholderText(fr.searchPlaceholder))[0] as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  return input;
}
const enter = (input: HTMLInputElement) => fireEvent.submit(input.closest("form") as HTMLFormElement);
const PARK_ROW = "Avenue de Barcelone"; // the far park's address line in the PARCS section

describe("Explorer — recherche", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchNearbyParks).mockImplementation(aroundCentre as never);
    useGeo.setState({ lat: 44.0989, lng: 3.0781, label: DEFAULT_GEO_LABEL, permission: "granted", hasFix: true });
    useFilters.getState().reset();
    vi.mocked(searchParks).mockResolvedValue([FAR_PARK]);
    vi.mocked(searchPlaces).mockResolvedValue([BARCELONA] as never);
  });

  it("Enter on a city explores the zone: centre moves, title becomes « Autour de … », no park selected", async () => {
    renderExplore();
    const input = await openSearchAndType("Barcelone");
    await screen.findByText(PARK_ROW); // a PARK result is listed before the places

    enter(input);

    await screen.findByText("Autour de Barcelone");
    expect(useGeo.getState()).toMatchObject({ lat: 41.38, lng: 2.17, label: "Barcelone" });
    expect(screen.queryByText("Itinéraire")).toBeNull(); // no park preview
    // One zone load for the new centre — nothing global.
    const lats = vi.mocked(fetchNearbyParks).mock.calls.map((c) => c[0].lat);
    expect(lats.filter((l) => l === 41.38)).toHaveLength(1);
  });

  it("no place found: the map centre, the title and the loaded zone do not change", async () => {
    vi.mocked(searchPlaces).mockResolvedValue([] as never);
    renderExplore();
    const input = await openSearchAndType("Zzzzz");
    enter(input);

    expect(await screen.findByText("Aucun lieu trouvé pour « Zzzzz »")).toBeTruthy();
    expect(useGeo.getState()).toMatchObject({ lat: 44.0989, lng: 3.0781, label: DEFAULT_GEO_LABEL });
    expect(vi.mocked(fetchNearbyParks).mock.calls.every((c) => c[0].lat === 44.0989)).toBe(true);
  });

  it("geocoding error: the map centre does not change", async () => {
    vi.mocked(searchPlaces).mockRejectedValue(new Error("boom"));
    renderExplore();
    const input = await openSearchAndType("Barcelone");
    enter(input);

    expect(await screen.findByText(fr.search.error)).toBeTruthy();
    expect(useGeo.getState()).toMatchObject({ lat: 44.0989, lng: 3.0781, label: DEFAULT_GEO_LABEL });
  });

  it("clicking a far PARK recentres on it, loads its zone and shows its preview", async () => {
    renderExplore();
    await openSearchAndType("Barcelone");
    fireEvent.click(await screen.findByText(PARK_ROW));

    expect(await screen.findByText("Itinéraire")).toBeTruthy(); // ParkPreview-only CTA
    expect(useGeo.getState()).toMatchObject({ lat: 46.03, lng: 4.07 });
    await waitFor(() => expect(vi.mocked(fetchNearbyParks).mock.calls.some((c) => c[0].lat === 46.03)).toBe(true));
  });

  describe("destination vs. location permission", () => {
    const OFF = fr.state.locationOffTitle; // « Localisation désactivée »
    const nobodyHome = () => vi.mocked(fetchNearbyParks).mockResolvedValue([] as never);

    it("denied + no destination → « Localisation désactivée »", async () => {
      useGeo.setState({ permission: "denied" });
      nobodyHome();
      renderExplore();
      expect(await screen.findByText(OFF)).toBeTruthy();
    });

    it("denied + destination → the destination's own state, never « Localisation désactivée »", async () => {
      useGeo.setState({ permission: "denied" });
      nobodyHome();
      renderExplore();
      await screen.findByText(OFF);
      const input = await openSearchAndType("Barcelone");
      enter(input);

      expect(await screen.findByText(fr.state.placeTitle)).toBeTruthy(); // « Aucun parc ici » for this destination
      expect(screen.queryByText(OFF)).toBeNull();
    });

    it("denied + destination with parks → « Autour de Barcelone »", async () => {
      useGeo.setState({ permission: "denied" });
      renderExplore();
      await screen.findByText("Autour de vous");
      const input = await openSearchAndType("Barcelone");
      enter(input);

      expect(await screen.findByText("Autour de Barcelone")).toBeTruthy();
      expect(screen.queryByText(OFF)).toBeNull();
    });

    it("granted + destination → « Autour de Barcelone »", async () => {
      renderExplore();
      const input = await openSearchAndType("Barcelone");
      enter(input);
      expect(await screen.findByText("Autour de Barcelone")).toBeTruthy();
    });

    it("GPS recentre after a search drops the destination and restores « Autour de vous »", async () => {
      const getCurrentPosition = vi.fn((ok: (p: unknown) => void) => ok({ coords: { latitude: 44.1, longitude: 3.08 } }));
      Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
      useGeo.setState({ permission: "denied" });
      renderExplore();
      const input = await openSearchAndType("Barcelone");
      enter(input);
      await screen.findByText("Autour de Barcelone");

      fireEvent.click(await screen.findByRole("button", { name: fr.a11y.recenter }));

      expect(await screen.findByText("Autour de vous")).toBeTruthy();
      expect(useGeo.getState()).toMatchObject({ label: DEFAULT_GEO_LABEL, permission: "granted" });
    });
  });

  it("the GPS recentre button restores « Autour de vous »", async () => {
    const getCurrentPosition = vi.fn((ok: (p: unknown) => void) => ok({ coords: { latitude: 44.1, longitude: 3.08 } }));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    renderExplore();
    const input = await openSearchAndType("Barcelone");
    enter(input);
    await screen.findByText("Autour de Barcelone");

    fireEvent.click(await screen.findByRole("button", { name: fr.a11y.recenter }));

    expect(await screen.findByText("Autour de vous")).toBeTruthy();
    expect(screen.queryByText("Autour de Barcelone")).toBeNull();
    expect(useGeo.getState().label).toBe(DEFAULT_GEO_LABEL);
  });
});
