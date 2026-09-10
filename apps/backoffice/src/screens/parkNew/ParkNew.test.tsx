import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialogProvider, ToastProvider } from "@toboggo/design-system";
import {
  buildDraftKey,
  createPark,
  isGeocodingConfigured,
  logActivity,
  mapStyleUrl,
  readDraft,
  searchPlaces,
  writeDraft,
} from "@toboggo/shared";
import ParkNew from "./ParkNew";

// ── MapLibre : mock léger, sans WebGL ni réseau ─────────────────────────────
vi.mock("maplibre-gl", () => {
  class Evented {
    handlers: Record<string, ((e?: unknown) => void)[]> = {};
    on(ev: string, cb: (e?: unknown) => void) {
      (this.handlers[ev] ||= []).push(cb);
      return this;
    }
    fire(ev: string, e?: unknown) {
      (this.handlers[ev] || []).forEach((cb) => cb(e));
    }
  }
  class FakeMap extends Evented {
    center: [number, number] = [0, 0];
    flyToCalls: { center: [number, number]; zoom?: number }[] = [];
    constructor(opts: { center?: [number, number] }) {
      super();
      if (opts?.center) this.center = opts.center;
      instances.maps.push(this);
    }
    addControl() {
      return this;
    }
    setCenter(c: [number, number]) {
      this.center = c;
      return this;
    }
    flyTo(o: { center: [number, number]; zoom?: number }) {
      this.center = o.center;
      this.flyToCalls.push(o);
      return this;
    }
    remove() {}
  }
  class FakeMarker extends Evented {
    lngLat = { lng: 0, lat: 0 };
    draggable = false;
    constructor(opts?: { draggable?: boolean }) {
      super();
      this.draggable = !!opts?.draggable;
      instances.markers.push(this);
    }
    setLngLat(v: [number, number] | { lng: number; lat: number }) {
      this.lngLat = Array.isArray(v) ? { lng: v[0], lat: v[1] } : v;
      return this;
    }
    getLngLat() {
      return this.lngLat;
    }
    setDraggable(d: boolean) {
      this.draggable = d;
      return this;
    }
    isDraggable() {
      return this.draggable;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  const instances: { maps: FakeMap[]; markers: FakeMarker[] } = { maps: [], markers: [] };
  return {
    __esModule: true,
    default: { Map: FakeMap, Marker: FakeMarker, NavigationControl: class {} },
    __instances: instances,
  };
});

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    mapStyleUrl: vi.fn(() => "https://style.test/x.json"),
    createPark: vi.fn(),
    logActivity: vi.fn().mockResolvedValue(undefined),
    // Recherche géo (3C.4b) — désactivée par défaut ; activée par test.
    isGeocodingConfigured: vi.fn(() => false),
    searchPlaces: vi.fn().mockResolvedValue([]),
  };
});

const perms = vi.hoisted(() => ({ canCreatePark: true }));
const org = vi.hoisted(() => ({ userId: "user-1" as string | null, communeId: "org-1" as string | undefined }));
vi.mock("../../lib/permissions", () => ({ usePermissions: () => ({ canCreatePark: perms.canCreatePark }) }));
vi.mock("../../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: false, communeId: org.communeId }) }));
vi.mock("../../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = { userName: "Testeur", userId: org.userId, isGestionnaireOrAbove: () => true };
    return sel ? sel(state) : state;
  },
}));

const PARK_NEW_KEY = buildDraftKey({
  surface: "bo",
  flow: "park.new",
  scope: { organizationId: "org-1" },
  principal: { userId: "user-1" },
});
const DRAFT_READ = { schemaVersion: 1, ttlMs: 72 * 60 * 60 * 1000 };

interface FakeMapInst {
  center: [number, number];
  fire(ev: string, e?: unknown): void;
}
interface FakeMarkerInst {
  getLngLat(): unknown;
  isDraggable(): boolean;
  fire(ev: string, e?: unknown): void;
}
async function mapInstances() {
  return (await import("maplibre-gl") as unknown as {
    __instances: { maps: FakeMapInst[]; markers: FakeMarkerInst[] };
  }).__instances;
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderNew() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <MemoryRouter initialEntries={["/parks/new"]}>
            <LocationProbe />
            <Routes>
              <Route path="/parks" element={<div>ÉCRAN LISTE</div>} />
              <Route path="/parks/new" element={<ParkNew />} />
              <Route path="/parks/:id" element={<div>FICHE PARC</div>} />
            </Routes>
          </MemoryRouter>
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const loc = () => screen.getByTestId("loc").textContent;
const lastPayload = () => vi.mocked(createPark).mock.calls.at(-1)?.[0] as Record<string, unknown>;

function fillCoords(lat = "44.100000", lng = "3.070000") {
  fireEvent.change(screen.getByLabelText(/^Latitude/), { target: { value: lat } });
  fireEvent.change(screen.getByLabelText(/^Longitude/), { target: { value: lng } });
}
function toStep2() {
  fillCoords();
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
}

describe("ParkNew — /parks/new (Lot 3C.4)", () => {
  beforeEach(async () => {
    perms.canCreatePark = true;
    org.userId = "user-1";
    org.communeId = "org-1";
    localStorage.clear();
    vi.mocked(mapStyleUrl).mockReset().mockReturnValue("https://style.test/x.json");
    vi.mocked(createPark).mockReset().mockResolvedValue({ id: "new-1", name: "Aire de jeux" } as never);
    vi.mocked(logActivity).mockReset().mockResolvedValue(undefined as never);
    vi.mocked(isGeocodingConfigured).mockReset().mockReturnValue(false);
    vi.mocked(searchPlaces).mockReset().mockResolvedValue([]);
    const inst = await mapInstances();
    inst.maps.length = 0;
    inst.markers.length = 0;
  });

  // ── Accès / garde ────────────────────────────────────────────────────────
  it("shows a not-authorized state when the user cannot create a park", () => {
    perms.canCreatePark = false;
    renderNew();
    expect(screen.getByText(/n'avez pas l'autorisation de créer un parc/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continuer" })).toBeNull();
  });

  it("renders the breadcrumb, title and the 2-step stepper", () => {
    renderNew();
    expect(screen.getByRole("heading", { name: "Ajouter un parc" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "1. Localisation" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "2. Informations" })).toBeTruthy();
  });

  // ── Étape 1 — Localisation ──────────────────────────────────────────────
  it("step 1 starts with NO coordinates and NO marker — never a fabricated position", async () => {
    renderNew();
    expect((screen.getByLabelText(/^Latitude/) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/^Longitude/) as HTMLInputElement).value).toBe("");
    const inst = await mapInstances();
    expect(inst.markers.length).toBe(0);
    // generic France view, never the historical Lyon fallback (45.75 / 4.85)
    expect(inst.maps.at(-1)!.center).not.toEqual([4.85, 45.75]);
    expect(inst.maps.at(-1)!.center).toEqual([2.4, 46.6]);
  });

  it("cannot continue to step 2 without valid coordinates", () => {
    renderNew();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText(/Placez le parc sur la carte ou saisissez des coordonnées GPS valides/)).toBeTruthy();
    expect(screen.getByLabelText("Adresse / voie")).toBeTruthy(); // still on step 1
  });

  it("out-of-range coordinates also block continuing", () => {
    renderNew();
    fillCoords("999", "3.07");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText(/coordonnées GPS valides/i)).toBeTruthy();
  });

  it("manual coordinate entry lets the user continue; address stays optional", () => {
    renderNew();
    toStep2();
    expect(screen.getByLabelText("Nom du parc")).toBeTruthy(); // reached step 2
    expect(screen.getByText("Adresse non renseignée")).toBeTruthy();
  });

  it("a map click updates the coordinate draft (directMove, no toggle)", async () => {
    renderNew();
    const inst = await mapInstances();
    inst.maps.at(-1)!.fire("click", { lngLat: { lat: 44.201234, lng: 3.205678 } });
    await waitFor(() =>
      expect((screen.getByLabelText(/^Latitude/) as HTMLInputElement).value).toBe("44.201234"),
    );
    expect((screen.getByLabelText(/^Longitude/) as HTMLInputElement).value).toBe("3.205678");
  });

  it("falls back to numeric fields when no map style is configured", () => {
    vi.mocked(mapStyleUrl).mockReturnValue(null);
    renderNew();
    expect(screen.queryByLabelText("Carte de localisation du parc")).toBeNull();
    expect(screen.getByText(/Carte indisponible/)).toBeTruthy();
    toStep2();
    expect(screen.getByLabelText("Nom du parc")).toBeTruthy();
  });

  // ── Recherche géographique (3C.4b) ─────────────────────────────────────
  const MILLAU = [
    { id: "place.1", name: "Millau", label: "Millau, Aveyron, France", lat: 44.1006, lng: 3.0782 },
  ];

  it("no search field when geocoding is not configured (no key)", () => {
    vi.mocked(isGeocodingConfigured).mockReturnValue(false);
    renderNew();
    expect(screen.queryByLabelText("Rechercher une ville ou une adresse")).toBeNull();
    // map + manual entry are still there
    expect(screen.getByLabelText(/^Latitude/)).toBeTruthy();
  });

  it("typing 'Millau' → one debounced geocode call → suggestions", async () => {
    vi.mocked(isGeocodingConfigured).mockReturnValue(true);
    vi.mocked(searchPlaces).mockResolvedValue(MILLAU as never);
    renderNew();
    fireEvent.change(screen.getByLabelText("Rechercher une ville ou une adresse"), {
      target: { value: "Millau" },
    });
    fireEvent.change(screen.getByLabelText("Rechercher une ville ou une adresse"), {
      target: { value: "Millau centre" },
    });
    await waitFor(() => expect(screen.getByRole("option", { name: /Millau/ })).toBeTruthy());
    // debounced: not one call per keystroke
    expect(vi.mocked(searchPlaces).mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("selecting a suggestion sets the coordinate draft, flies the map — no address touched", async () => {
    vi.mocked(isGeocodingConfigured).mockReturnValue(true);
    vi.mocked(searchPlaces).mockResolvedValue(MILLAU as never);
    renderNew();
    fireEvent.change(screen.getByLabelText("Adresse / voie"), { target: { value: "gardée" } });
    fireEvent.change(screen.getByLabelText("Rechercher une ville ou une adresse"), {
      target: { value: "Millau" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /Millau/ }));

    expect((screen.getByLabelText(/^Latitude/) as HTMLInputElement).value).toBe("44.100600");
    expect((screen.getByLabelText(/^Longitude/) as HTMLInputElement).value).toBe("3.078200");
    // address fields are NOT filled from the search result
    expect((screen.getByLabelText("Adresse / voie") as HTMLInputElement).value).toBe("gardée");
    expect((screen.getByLabelText("Code postal") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Ville") as HTMLInputElement).value).toBe("");
    // map recentred + zoomed
    const inst = await mapInstances();
    const map = inst.maps.at(-1)! as unknown as { flyToCalls: { center: [number, number]; zoom?: number }[] };
    expect(map.flyToCalls.at(-1)).toEqual({ center: [3.0782, 44.1006], zoom: 15 });
  });

  it("a geocoding error leaves the form fully usable", async () => {
    vi.mocked(isGeocodingConfigured).mockReturnValue(true);
    vi.mocked(searchPlaces).mockRejectedValue(new Error("MapTiler 500"));
    renderNew();
    fireEvent.change(screen.getByLabelText("Rechercher une ville ou une adresse"), {
      target: { value: "Millau" },
    });
    await waitFor(() => expect(screen.getByText(/momentanément indisponible/i)).toBeTruthy());
    // manual entry still works → can reach step 2
    toStep2();
    expect(screen.getByLabelText("Nom du parc")).toBeTruthy();
  });

  it("after a search select the user can still edit coordinates by hand", async () => {
    vi.mocked(isGeocodingConfigured).mockReturnValue(true);
    vi.mocked(searchPlaces).mockResolvedValue(MILLAU as never);
    renderNew();
    fireEvent.change(screen.getByLabelText("Rechercher une ville ou une adresse"), {
      target: { value: "Millau" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /Millau/ }));
    fireEvent.change(screen.getByLabelText(/^Latitude/), { target: { value: "44.099999" } });
    expect((screen.getByLabelText(/^Latitude/) as HTMLInputElement).value).toBe("44.099999");
  });

  // ── Étape 2 — Informations ──────────────────────────────────────────────
  it("step 2 shows a compact location summary with a 'Modifier' shortcut", () => {
    renderNew();
    fireEvent.change(screen.getByLabelText("Adresse / voie"), { target: { value: "12 rue du Parc" } });
    fireEvent.change(screen.getByLabelText("Code postal"), { target: { value: "12100" } });
    fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "Millau" } });
    toStep2();
    expect(screen.getByText("12 rue du Parc")).toBeTruthy();
    expect(screen.getByText("12100 Millau")).toBeTruthy();
    expect(screen.getByText("44.100000, 3.070000")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.getByLabelText("Adresse / voie")).toBeTruthy(); // back on step 1
  });

  it("going back to step 1 keeps the whole draft", () => {
    renderNew();
    fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "Creissels" } });
    toStep2();
    fireEvent.change(screen.getByLabelText("Nom du parc"), { target: { value: "Aire du Centre" } });
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect((screen.getByLabelText("Ville") as HTMLInputElement).value).toBe("Creissels");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect((screen.getByLabelText("Nom du parc") as HTMLInputElement).value).toBe("Aire du Centre");
  });

  it("name is required — an empty name blocks creation", async () => {
    renderNew();
    toStep2();
    fireEvent.click(screen.getByRole("button", { name: "Créer le parc" }));
    await waitFor(() =>
      expect(screen.getAllByText("Le nom du parc est obligatoire.").length).toBeGreaterThan(0),
    );
    expect(createPark).not.toHaveBeenCalled();
  });

  it("rejects an inconsistent age range (min > max) and disables creation", async () => {
    renderNew();
    toStep2();
    fireEvent.change(screen.getByLabelText("Nom du parc"), { target: { value: "Aire X" } });
    fireEvent.change(screen.getByLabelText("Âge minimum"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Âge maximum"), { target: { value: "3" } });
    expect(screen.getByText(/l'âge minimum ne peut pas dépasser l'âge maximum/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Créer le parc" }) as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Création ────────────────────────────────────────────────────────────
  it("creates the park with the exact V1 payload and redirects to its page", async () => {
    renderNew();
    fireEvent.change(screen.getByLabelText("Adresse / voie"), { target: { value: "12 rue du Parc" } });
    fireEvent.change(screen.getByLabelText("Code postal"), { target: { value: "12100" } });
    fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "Millau" } });
    fillCoords("44.099776", "3.111459");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    fireEvent.change(screen.getByLabelText("Nom du parc"), { target: { value: "Aire de jeux du Parc" } });
    fireEvent.change(screen.getByLabelText("Âge minimum"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le parc" }));

    await waitFor(() => expect(createPark).toHaveBeenCalledTimes(1));
    const p = lastPayload();
    expect(p).toMatchObject({
      name: "Aire de jeux du Parc",
      organization_id: "org-1",
      latitude: 44.099776,
      longitude: 3.111459,
      status: "published",
      address_line: "12 rue du Parc",
      postal_code: "12100",
      city: "Millau",
      age_min: 2,
      age_max: null,
    });
    expect("formatted_address" in p).toBe(false);
    expect("commune_id" in p).toBe(false);
    expect(p.latitude).not.toBe(45.75);
    expect(p.longitude).not.toBe(4.85);

    await waitFor(() => expect(loc()).toBe("/parks/new-1"));
  });

  it("omits both age keys entirely when no age is entered", async () => {
    renderNew();
    toStep2();
    fireEvent.change(screen.getByLabelText("Nom du parc"), { target: { value: "Aire sans âge" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le parc" }));
    await waitFor(() => expect(createPark).toHaveBeenCalledTimes(1));
    const p = lastPayload();
    expect("age_min" in p).toBe(false);
    expect("age_max" in p).toBe(false);
  });

  it("blocks a double submit — createPark is called only once", async () => {
    let resolveCreate: (v: unknown) => void = () => {};
    vi.mocked(createPark).mockImplementation(
      () => new Promise((r) => { resolveCreate = r as (v: unknown) => void; }),
    );
    renderNew();
    toStep2();
    fireEvent.change(screen.getByLabelText("Nom du parc"), { target: { value: "Aire double" } });
    const btn = screen.getByRole("button", { name: "Créer le parc" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(createPark).toHaveBeenCalledTimes(1);
    resolveCreate({ id: "new-9", name: "Aire double" });
    await waitFor(() => expect(loc()).toBe("/parks/new-9"));
  });

  it("on createPark failure: stays on the form, keeps the data, no redirect", async () => {
    vi.mocked(createPark).mockRejectedValue(new Error("RLS denied"));
    renderNew();
    toStep2();
    fireEvent.change(screen.getByLabelText("Nom du parc"), { target: { value: "Aire échec" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le parc" }));
    await waitFor(() => expect(createPark).toHaveBeenCalled());
    expect(loc()).toBe("/parks/new");
    expect((screen.getByLabelText("Nom du parc") as HTMLInputElement).value).toBe("Aire échec");
  });

  // ── Annulation / dirty-state ────────────────────────────────────────────
  it("cancels straight away when the form is pristine — no confirmation", async () => {
    renderNew();
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(loc()).toBe("/parks"));
    expect(screen.queryByText("Modifications non enregistrées")).toBeNull();
  });

  it("asks for confirmation before leaving when the draft has content", async () => {
    renderNew();
    fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "Millau" } });
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(await screen.findByText("Modifications non enregistrées")).toBeTruthy();
    expect(loc()).toBe("/parks/new"); // still here until confirmed
    fireEvent.click(screen.getByRole("button", { name: "Abandonner" }));
    await waitFor(() => expect(loc()).toBe("/parks"));
  });

  it("the 'Mes parcs' breadcrumb is also guarded", async () => {
    renderNew();
    fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "Millau" } });
    fireEvent.click(screen.getByRole("link", { name: "Mes parcs" }));
    expect(await screen.findByText("Modifications non enregistrées")).toBeTruthy();
  });

  // ── LOT 3D.C — brouillon persistant ────────────────────────────────────────
  const storedDraft = () => readDraft(PARK_NEW_KEY, DRAFT_READ) as Record<string, unknown> | null;
  function seedDraft(over: Record<string, unknown>) {
    writeDraft(
      PARK_NEW_KEY,
      {
        addressLine: "",
        postalCode: "",
        city: "",
        latitude: "",
        longitude: "",
        name: "",
        ageMin: "",
        ageMax: "",
        description: "",
        step: "location",
        ...over,
      },
      { schemaVersion: 1 },
    );
  }

  it("no stored draft → a normal empty form, no 'Brouillon restauré' toast", () => {
    renderNew();
    expect((screen.getByLabelText(/^Latitude/) as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
  });

  it("a valid stored draft is restored automatically into the fields", async () => {
    seedDraft({ latitude: "44.100000", longitude: "3.070000", city: "Creissels", name: "Aire restaurée", step: "info" });
    renderNew();
    await waitFor(() => expect(screen.getByText("Brouillon restauré")).toBeTruthy());
    // step 2 was restored (valid coords)
    expect((screen.getByLabelText("Nom du parc") as HTMLInputElement).value).toBe("Aire restaurée");
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect((screen.getByLabelText("Ville") as HTMLInputElement).value).toBe("Creissels");
    expect((screen.getByLabelText(/^Latitude/) as HTMLInputElement).value).toBe("44.100000");
  });

  it("shows the 'Brouillon restauré' toast only once, not on every render", async () => {
    seedDraft({ city: "Millau", name: "X" });
    renderNew();
    await waitFor(() => expect(screen.getByText("Brouillon restauré")).toBeTruthy());
    // force several re-renders
    fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "Millau-2" } });
    fireEvent.change(screen.getByLabelText("Adresse / voie"), { target: { value: "rue X" } });
    expect(screen.getAllByText("Brouillon restauré").length).toBe(1);
  });

  it("step 2 in the draft but no valid coordinates → falls back to step 1, no crash", () => {
    seedDraft({ step: "info", name: "Sans position" });
    renderNew();
    // step 1 controls are shown, step 2 is not
    expect(screen.getByLabelText("Adresse / voie")).toBeTruthy();
    expect(screen.queryByLabelText("Nom du parc")).toBeNull();
  });

  it("restoring a position does NOT trigger any geocoding / MapTiler search, address untouched", async () => {
    vi.mocked(isGeocodingConfigured).mockReturnValue(true);
    seedDraft({ latitude: "44.100000", longitude: "3.070000", step: "location" });
    renderNew();
    await waitFor(() =>
      expect((screen.getByLabelText(/^Latitude/) as HTMLInputElement).value).toBe("44.100000"),
    );
    expect(vi.mocked(searchPlaces)).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Adresse / voie") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Code postal") as HTMLInputElement).value).toBe("");
  });

  it("typing autosaves the draft after the debounce (no bespoke localStorage code)", async () => {
    renderNew();
    fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "Millau" } });
    await waitFor(() => expect(storedDraft()?.city).toBe("Millau"), { timeout: 2000 });
  });

  it("createPark success → the draft is cleared before navigating and never reappears", async () => {
    seedDraft({ latitude: "44.099776", longitude: "3.111459", step: "info", name: "Aire OK" });
    renderNew();
    await screen.findByText("Brouillon restauré");
    fireEvent.click(screen.getByRole("button", { name: "Créer le parc" }));

    await waitFor(() => expect(createPark).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(loc()).toBe("/parks/new-1"));
    expect(storedDraft()).toBeNull();
    // a late pagehide must not resurrect it
    window.dispatchEvent(new Event("pagehide"));
    expect(storedDraft()).toBeNull();
  });

  it("createPark failure → stays on the form AND keeps the persisted draft", async () => {
    vi.mocked(createPark).mockRejectedValue(new Error("RLS denied"));
    renderNew();
    fillCoords("44.099776", "3.111459");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    fireEvent.change(screen.getByLabelText("Nom du parc"), { target: { value: "Aire échec" } });
    await waitFor(() => expect(storedDraft()?.name).toBe("Aire échec"), { timeout: 2000 });

    fireEvent.click(screen.getByRole("button", { name: "Créer le parc" }));
    await waitFor(() => expect(createPark).toHaveBeenCalled());
    expect(loc()).toBe("/parks/new");
    expect(storedDraft()?.name).toBe("Aire échec"); // draft survived the failure
  });

  it("Annuler confirmed → the draft is dropped and we return to Mes parcs", async () => {
    renderNew();
    fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "Millau" } });
    await waitFor(() => expect(storedDraft()?.city).toBe("Millau"), { timeout: 2000 });

    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    fireEvent.click(await screen.findByRole("button", { name: "Abandonner" }));
    await waitFor(() => expect(loc()).toBe("/parks"));
    expect(storedDraft()).toBeNull();
  });

  it("Annuler refused → the draft is kept and we stay on the form", async () => {
    renderNew();
    fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "Millau" } });
    await waitFor(() => expect(storedDraft()?.city).toBe("Millau"), { timeout: 2000 });

    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(loc()).toBe("/parks/new");
    expect(storedDraft()?.city).toBe("Millau");
  });

  it("a draft is never restored across organisations or users", async () => {
    seedDraft({ city: "Confidentiel", name: "Parc de A" });
    expect(storedDraft()?.city).toBe("Confidentiel");

    // same user, different org
    org.communeId = "org-2";
    const a = renderNew();
    expect((screen.getByLabelText("Ville") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
    a.unmount();

    // same org as the draft, different user
    org.communeId = "org-1";
    org.userId = "user-2";
    renderNew();
    expect((screen.getByLabelText("Ville") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
  });
});
