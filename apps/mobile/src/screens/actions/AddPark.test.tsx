import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildDraftKey, createPark, readDraft, reverseGeocode, uploadPhoto, writeDraft, type DraftPrincipal, type ReverseGeocodedAddress } from "@toboggo/shared";
import "../../i18n/testInit";
import AddPark from "./AddPark";

// PinField (step 1) instantiates a real map when VITE_MAP_STYLE_URL is set (it
// is, in this env) — a light functional fake, not just empty classes.
vi.mock("maplibre-gl", () => {
  class FakeMap {
    center: { lat: number; lng: number };
    handlers: Record<string, ((e?: unknown) => void)[]> = {};
    constructor(opts: { center: [number, number] }) {
      const [lng, lat] = opts.center;
      this.center = { lat, lng };
    }
    addControl() {
      return this;
    }
    on(ev: string, cb: (e?: unknown) => void) {
      (this.handlers[ev] ||= []).push(cb);
      return this;
    }
    getCenter() {
      return this.center;
    }
    setCenter(c: [number, number]) {
      this.center = { lat: c[1], lng: c[0] };
      return this;
    }
    flyTo(o: { center: [number, number] }) {
      this.center = { lat: o.center[1], lng: o.center[0] };
      (this.handlers.moveend || []).forEach((cb) => cb());
      return this;
    }
    remove() {}
  }
  return {
    __esModule: true,
    default: { Map: FakeMap, Marker: class {}, NavigationControl: class {} },
  };
});

// Step 0 (recherche d'un parc existant) n'est pas ce que ce lot teste — un
// stub minimal expose juste `onNone`, comme "aucun de ceux-ci" le ferait.
vi.mock("../../components/AddParkSearch", () => ({
  AddParkSearch: ({ onNone }: { onNone: () => void }) => <button onClick={onNone}>skip-search</button>,
}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    createPark: vi.fn(),
    addParkPhotos: vi.fn().mockResolvedValue(undefined),
    logActivity: vi.fn().mockResolvedValue(undefined),
    uploadPhoto: vi.fn().mockResolvedValue("https://x/photo.jpg"),
    listFeatures: vi.fn().mockResolvedValue([]),
    searchPlaces: vi.fn().mockResolvedValue([]),
    reverseGeocode: vi.fn().mockResolvedValue(null),
  };
});

const sess = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("../../lib/session", () => ({
  useSession: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const s = { userId: sess.userId };
      return sel ? sel(s) : s;
    },
    { getState: () => ({ userId: sess.userId }) },
  ),
}));

const toasts = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock("../../lib/toast", () => ({
  useToastStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const s = { show: (m: string) => toasts.list.push(m) };
      return sel ? sel(s) : s;
    },
    { getState: () => ({ show: (m: string) => toasts.list.push(m) }) },
  ),
}));

const key = (principal: DraftPrincipal) => buildDraftKey({ surface: "mobile", flow: "park.add", principal });
const READ = { schemaVersion: 1, ttlMs: 24 * 60 * 60 * 1000 };
const RESUME_KEY = "toboggo:contrib-resume";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderAdd(search = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/add${search}`]}>
        <LocationProbe />
        <Routes>
          <Route path="/add" element={<AddPark />} />
          <Route path="/login" element={<div>LOGIN</div>} />
          <Route path="/park/:id" element={<div>FICHE PARC</div>} />
          <Route path="/map" element={<div>CARTE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const loc = () => screen.getByTestId("loc").textContent;
const nameField = () => screen.getByLabelText("Nom du parc") as HTMLInputElement;

async function toStep1() {
  fireEvent.click(await screen.findByText("skip-search"));
}
async function toStep2() {
  await toStep1();
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
}
async function toStep3(name = "Square Test") {
  await toStep2();
  fireEvent.change(nameField(), { target: { value: name } });
  // Wait for the debounced autosave to actually land before moving on — a
  // synchronous "Continuer" click would only prove the in-memory value updated.
  const principal: DraftPrincipal = sess.userId ? { userId: sess.userId } : "guest";
  await waitFor(() => expect((readDraft(key(principal), READ) as { name?: string })?.name).toBe(name), { timeout: 2000 });
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
}
async function toStep4(name = "Square Test") {
  await toStep3(name);
  fireEvent.click(await screen.findByRole("button", { name: "Passer cette étape" }));
}

beforeEach(() => {
  localStorage.clear();
  sess.userId = "u1";
  toasts.list.length = 0;
  vi.mocked(createPark).mockReset().mockResolvedValue({ id: "new-1", name: "Square Test", commune_id: "org-1" } as never);
  // `afterEach`'s `vi.restoreAllMocks()` clears a factory-defined `vi.fn()` to
  // a no-op (there's no "original" implementation to restore to) — reinstate
  // it every test, same as createPark above.
  vi.mocked(uploadPhoto).mockReset().mockResolvedValue("https://x/photo.jpg" as never);
  vi.mocked(reverseGeocode).mockReset().mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe("AddPark — persistent draft (LOT 3D.E)", () => {
  it("no stored draft → normal initial state", async () => {
    renderAdd();
    await toStep1();
    expect(screen.getByText("Où se trouve le parc ?")).toBeTruthy();
  });

  it("typing autosaves the draft (debounced) under the user key", async () => {
    renderAdd();
    await toStep2();
    fireEvent.change(nameField(), { target: { value: "Square Autosave" } });
    await waitFor(
      () => expect((readDraft(key({ userId: "u1" }), READ) as { name?: string })?.name).toBe("Square Autosave"),
      { timeout: 2000 },
    );
  });

  it("restores a stored draft automatically, at the step it was saved at", () => {
    writeDraft(
      key({ userId: "u1" }),
      { step: 2, lat: 44.1, lng: 3.1, address: "", name: "Square Repris", ageLow: 0, ageHigh: 12, ageTouched: false, services: { __set: [] }, equipment: { __set: [] }, description: "", photos: [] },
      { schemaVersion: 1 },
    );
    renderAdd();
    expect(nameField().value).toBe("Square Repris");
  });

  it("step 4 restored when the name precondition is met", () => {
    writeDraft(
      key({ userId: "u1" }),
      { step: 4, lat: 44.1, lng: 3.1, address: "", name: "Square Vérif", ageLow: 0, ageHigh: 12, ageTouched: false, services: { __set: [] }, equipment: { __set: [] }, description: "", photos: [] },
      { schemaVersion: 1 },
    );
    renderAdd();
    expect(screen.getByText("Vérifiez avant d’envoyer")).toBeTruthy();
    expect(screen.getByText("Square Vérif")).toBeTruthy();
  });

  it("step 4 WITHOUT a name (inconsistent) falls back to step 2, no crash", () => {
    writeDraft(
      key({ userId: "u1" }),
      { step: 4, lat: 44.1, lng: 3.1, address: "", name: "", ageLow: 0, ageHigh: 12, ageTouched: false, services: { __set: [] }, equipment: { __set: [] }, description: "", photos: [] },
      { schemaVersion: 1 },
    );
    renderAdd();
    expect(screen.getByLabelText("Nom du parc")).toBeTruthy();
    expect(screen.queryByText("Vérifiez avant d’envoyer")).toBeNull();
  });

  it("restoring a position does not trigger a geocoding search", async () => {
    const { searchPlaces } = await import("@toboggo/shared");
    writeDraft(
      key({ userId: "u1" }),
      { step: 1, lat: 44.123456, lng: 3.123456, address: "", name: "", ageLow: 0, ageHigh: 12, ageTouched: false, services: { __set: [] }, equipment: { __set: [] }, description: "", photos: [] },
      { schemaVersion: 1 },
    );
    renderAdd();
    await screen.findByText("Où se trouve le parc ?");
    expect(vi.mocked(searchPlaces)).not.toHaveBeenCalled();
  });

  it("flushes to storage on pagehide (app switch / backgrounding)", async () => {
    renderAdd();
    await toStep2();
    fireEvent.change(nameField(), { target: { value: "Non débouncé" } });
    window.dispatchEvent(new Event("pagehide"));
    expect((readDraft(key({ userId: "u1" }), READ) as { name?: string })?.name).toBe("Non débouncé");
  });

  it("service chips (a Set field) round-trip through the tagged-array envelope, and stay active after restore", async () => {
    const first = renderAdd();
    await toStep2();
    fireEvent.click(screen.getByText("Toilettes")); // "wc" chip
    await waitFor(() => {
      const raw = JSON.parse(localStorage.getItem(key({ userId: "u1" }))!);
      expect(raw.data.services).toEqual({ __set: ["wc"] });
    });
    first.unmount();

    renderAdd(); // fresh mount — exercises the restore (reviveSets) path
    expect(screen.getByText("Toilettes").closest("button")?.className).toMatch(/active/);
  });

  it("only photo URL strings ever reach localStorage — never a File/Blob", async () => {
    renderAdd();
    await toStep3();
    const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    const file = new File(["fake-bytes"], "park.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() =>
      expect((readDraft(key({ userId: "u1" }), READ) as { photos?: string[] })?.photos).toEqual(["https://x/photo.jpg"]),
    );
    const raw = localStorage.getItem(key({ userId: "u1" }))!;
    expect(raw).not.toMatch(/\[object File\]|\[object Blob\]/);
    const parsed = JSON.parse(raw);
    expect(parsed.data.photos.every((p: unknown) => typeof p === "string")).toBe(true);
  });

  it("step 3 offers camera + library as distinct inputs; zero photos → « Passer cette étape » still advances", async () => {
    renderAdd();
    await toStep3();
    expect(screen.getByRole("button", { name: /Prendre une photo/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Choisir dans la photothèque/ })).toBeTruthy();
    const cam = document.querySelector('input[type="file"][capture]') as HTMLInputElement;
    const lib = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    expect(cam.getAttribute("capture")).toBe("environment");
    expect(cam.multiple).toBe(false);
    expect(lib.multiple).toBe(true);
    expect(screen.getByText("0 / 4 photos")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Passer/ })).toBeTruthy();
  });

  it("library multi-pick: uploads up to the 4-photo cap, toasts the overflow; photos can be removed", async () => {
    renderAdd();
    await toStep3();
    const lib = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    const files = Array.from({ length: 6 }, (_, i) => new File(["x"], `p${i}.jpg`, { type: "image/jpeg" }));
    fireEvent.change(lib, { target: { files } });
    await waitFor(() => expect(screen.getByText("4 / 4 photos")).toBeTruthy());
    expect(vi.mocked(uploadPhoto)).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole("button", { name: /Prendre une photo/ })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /Retirer/ })[0]!);
    expect(screen.getByText("3 / 4 photos")).toBeTruthy();
  });

  it("createPark success → the draft is cleared before navigating, no resurrection on late pagehide", async () => {
    renderAdd();
    await toStep4("Square Envoyé");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le parc" }));

    await waitFor(() => expect(createPark).toHaveBeenCalledTimes(1));
    await screen.findByText("Parc ajouté !");
    expect(readDraft(key({ userId: "u1" }), READ)).toBeNull();
    window.dispatchEvent(new Event("pagehide"));
    expect(readDraft(key({ userId: "u1" }), READ)).toBeNull();
  });

  it("success sheet — \"Voir le parc\" replaces the wizard entry with the park page", async () => {
    renderAdd();
    await toStep4("Square Voir");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le parc" }));
    await screen.findByText("Parc ajouté !");

    fireEvent.click(screen.getByRole("button", { name: "Voir le parc" }));
    await screen.findByText("FICHE PARC");
    expect(loc()).toBe("/park/new-1");
  });

  it("success sheet — \"Retour à la carte\" replaces the wizard entry with the map", async () => {
    renderAdd();
    await toStep4("Square Carte");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le parc" }));
    await screen.findByText("Parc ajouté !");

    fireEvent.click(screen.getByRole("button", { name: "Retour à la carte" }));
    await screen.findByText("CARTE");
    expect(loc()).toBe("/map");
  });

  it("success sheet — dismissing (backdrop) also replaces the wizard entry with the map, same as before the ContributionSuccessSheet generalization", async () => {
    renderAdd();
    await toStep4("Square Backdrop");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le parc" }));
    await screen.findByText("Parc ajouté !");

    const backdrop = document.body.querySelector('[class*="sheetBackdrop"]');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);
    await screen.findByText("CARTE");
    expect(loc()).toBe("/map");
  });

  it("createPark failure → stays on the form, draft conserved", async () => {
    vi.mocked(createPark).mockRejectedValue(new Error("RLS denied"));
    renderAdd();
    await toStep4("Square Échec");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le parc" }));

    await waitFor(() => expect(createPark).toHaveBeenCalled());
    // Server/network error details are never surfaced verbatim — a generic,
    // translated message is shown instead (see doPublish's catch).
    expect(toasts.list).toContain("Une erreur est survenue");
    expect(loc()).toBe("/add");
    expect((readDraft(key({ userId: "u1" }), READ) as { name?: string })?.name).toBe("Square Échec");
  });

  it("a draft written by user A is never restored for user B", () => {
    writeDraft(
      key({ userId: "A" }),
      { step: 2, lat: 1, lng: 1, address: "", name: "A only", ageLow: 0, ageHigh: 12, ageTouched: false, services: { __set: [] }, equipment: { __set: [] }, description: "", photos: [] },
      { schemaVersion: 1 },
    );
    sess.userId = "B";
    renderAdd();
    // still on the search step — nothing was restored for B
    expect(screen.getByText("skip-search")).toBeTruthy();
    expect(readDraft(key({ userId: "B" }), READ)).toBeNull();
  });
});

describe("AddPark — guest → OAuth → authenticated", () => {
  it("guest fills the form, hits send → resume route stashed, draft under the guest key", async () => {
    sess.userId = null;
    renderAdd();
    await toStep4("Square Invité");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le parc" }));

    await screen.findByText("LOGIN");
    expect(JSON.parse(localStorage.getItem(RESUME_KEY)!).route).toBe("/add?resume=1");
    expect(createPark).not.toHaveBeenCalled();
    expect((readDraft(key("guest"), READ) as { name?: string })?.name).toBe("Square Invité");
  });

  it("back authenticated with ?resume=1 → guest draft adopted, guest key removed, park auto-created", async () => {
    writeDraft(
      key("guest"),
      { step: 4, lat: 44.1, lng: 3.1, address: "", name: "Square Après Login", ageLow: 0, ageHigh: 12, ageTouched: false, services: { __set: [] }, equipment: { __set: [] }, description: "", photos: [] },
      { schemaVersion: 1 },
    );
    sess.userId = "u1";
    renderAdd("?resume=1");

    await waitFor(() => expect(createPark).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPark).mock.calls[0][0]).toMatchObject({ name: "Square Après Login" });
    expect(localStorage.getItem(key("guest"))).toBeNull();
    await screen.findByText("Parc ajouté !");
    expect(readDraft(key({ userId: "u1" }), READ)).toBeNull();
  });
});

// ── Adresse : reverse geocoding Geoapify (via Edge Function) ────────────────
const MILLAU: ReverseGeocodedAddress = {
  address_line: "12 Rue de la Capelle",
  postal_code: "12100",
  city: "Millau",
  admin_area_1: "Occitanie",
  admin_area_2: "Aveyron",
  country_code: "FR",
  formatted: "12 Rue de la Capelle, 12100 Millau, France",
};
const addressField = () => screen.getByLabelText("Adresse (si vous la connaissez)") as HTMLInputElement;

/** Choisit un lieu dans la recherche : le fly-to du FakeMap émet `moveend`,
 * exactement comme un déplacement réel de la carte. */
async function pickPlace(name: string, lat: number, lng: number) {
  const { searchPlaces } = await import("@toboggo/shared");
  vi.mocked(searchPlaces).mockResolvedValue([{ id: `poi.${name}`, name, label: `${name}, France`, lat, lng }]);
  fireEvent.change(screen.getByPlaceholderText("Rechercher une ville, une adresse ou un lieu"), { target: { value: name } });
  fireEvent.click(await screen.findByText(name));
}

function stubGeolocation(lat: number, lng: number) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: lat, longitude: lng } }) },
  });
}

describe("AddPark — adresse par reverse geocoding", () => {
  // Mode carte (FakeMap) : l'env de test n'a pas forcément de style configuré.
  beforeEach(() => vi.stubEnv("VITE_MAP_STYLE_URL", "https://example.test/style.json"));
  afterEach(() => vi.unstubAllEnvs());

  it("monter l'étape Localisation ne déclenche aucun reverse geocoding", async () => {
    renderAdd();
    await toStep1();
    await screen.findByText("Où se trouve le parc ?");
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it("restaurer un brouillon ne déclenche aucun reverse geocoding", async () => {
    writeDraft(
      key({ userId: "u1" }),
      { step: 1, lat: 44.123456, lng: 3.123456, address: "Ma saisie", name: "", ageLow: 0, ageHigh: 12, ageTouched: false, services: { __set: [] }, equipment: { __set: [] }, description: "", photos: [] },
      { schemaVersion: 1 },
    );
    renderAdd();
    await screen.findByText("Où se trouve le parc ?");
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(addressField().value).toBe("Ma saisie");
  });

  it("position choisie (fin de déplacement) → UN appel, formulaire prérempli", async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(MILLAU);
    renderAdd();
    await toStep1();
    await pickPlace("Jardin de la Capelle", 44.0989, 3.0781);

    await waitFor(() => expect(addressField().value).toBe("12 Rue de la Capelle"));
    expect(screen.getByText("12100 Millau")).toBeTruthy();
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reverseGeocode).mock.calls[0].slice(0, 2)).toEqual([44.0989, 3.0781]);
  });

  it("« Utiliser ma position » (GPS) → UN seul appel (pas de doublon GPS + moveend)", async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(MILLAU);
    stubGeolocation(44.5, 3.5);
    renderAdd();
    await toStep1();
    fireEvent.click(await screen.findByLabelText("Utiliser ma position"));

    await waitFor(() => expect(addressField().value).toBe("12 Rue de la Capelle"));
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reverseGeocode).mock.calls[0].slice(0, 2)).toEqual([44.5, 3.5]);
  });

  it("erreur API → l'adresse existante est conservée (jamais vidée)", async () => {
    vi.mocked(reverseGeocode).mockResolvedValueOnce(MILLAU).mockRejectedValueOnce(new Error("boom"));
    renderAdd();
    await toStep1();
    await pickPlace("Jardin A", 44.1, 3.1);
    await waitFor(() => expect(addressField().value).toBe("12 Rue de la Capelle"));

    await pickPlace("Jardin B", 44.2, 3.2);
    await waitFor(() => expect(reverseGeocode).toHaveBeenCalledTimes(2));
    expect(addressField().value).toBe("12 Rue de la Capelle");
  });

  it("adresse corrigée à la main → non écrasée par un nouveau déplacement (la localité suit le repère)", async () => {
    vi.mocked(reverseGeocode)
      .mockResolvedValueOnce(MILLAU)
      .mockResolvedValueOnce({ ...MILLAU, address_line: "1 Place du Marché", postal_code: "69000", city: "Lyon" });
    renderAdd();
    await toStep1();
    await pickPlace("Jardin A", 44.1, 3.1);
    await waitFor(() => expect(addressField().value).toBe("12 Rue de la Capelle"));

    fireEvent.change(addressField(), { target: { value: "14 Rue de la Capelle (entrée nord)" } });
    await pickPlace("Jardin B", 45.7, 4.8);

    await screen.findByText("69000 Lyon");
    expect(addressField().value).toBe("14 Rue de la Capelle (entrée nord)");
  });

  it("création → adresse structurée persistée via createPark", async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(MILLAU);
    renderAdd();
    await toStep1();
    await pickPlace("Jardin de la Capelle", 44.0989, 3.0781);
    await waitFor(() => expect(addressField().value).toBe("12 Rue de la Capelle"));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    fireEvent.change(nameField(), { target: { value: "Jardin de la Capelle" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Passer cette étape" }));
    fireEvent.click(await screen.findByRole("button", { name: "Envoyer le parc" }));

    await waitFor(() => expect(createPark).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPark).mock.calls[0][0]).toMatchObject({
      address_line: "12 Rue de la Capelle",
      postal_code: "12100",
      city: "Millau",
      admin_area_1: "Occitanie",
      admin_area_2: "Aveyron",
      country_code: "FR",
      lat: 44.0989,
      lng: 3.0781,
    });
  });

  it("nouveau pin dont le résultat n'a pas de rue → l'ancienne rue automatique est supprimée", async () => {
    vi.mocked(reverseGeocode)
      .mockResolvedValueOnce(MILLAU)
      .mockResolvedValueOnce({ ...MILLAU, address_line: null, postal_code: "69000", city: "Lyon" });
    renderAdd();
    await toStep1();
    await pickPlace("Jardin A", 44.1, 3.1);
    await waitFor(() => expect(addressField().value).toBe("12 Rue de la Capelle"));

    await pickPlace("Jardin B", 45.7, 4.8);
    await screen.findByText("69000 Lyon");
    expect(addressField().value).toBe("");
  });

  it("pendant la résolution, l'ancienne localité disparaît et ne part jamais avec les nouvelles coordonnées", async () => {
    vi.mocked(reverseGeocode)
      .mockResolvedValueOnce(MILLAU)
      .mockReturnValueOnce(new Promise(() => {})); // la 2e résolution ne revient jamais
    renderAdd();
    await toStep1();
    await pickPlace("Jardin A", 44.1, 3.1);
    await screen.findByText("12100 Millau");

    await pickPlace("Jardin B", 45.7, 4.8);
    await waitFor(() => expect(reverseGeocode).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("12100 Millau")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    fireEvent.change(nameField(), { target: { value: "Jardin B" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Passer cette étape" }));
    fireEvent.click(await screen.findByRole("button", { name: "Envoyer le parc" }));

    await waitFor(() => expect(createPark).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createPark).mock.calls[0][0];
    expect(payload).toMatchObject({ lat: 45.7, lng: 4.8 });
    for (const k of ["postal_code", "city", "admin_area_1", "admin_area_2", "country_code"]) expect(payload).not.toHaveProperty(k);
  });

  describe("sans carte (contrôles de repli)", () => {
    beforeEach(() => vi.stubEnv("VITE_MAP_STYLE_URL", ""));

    it("un nudge du repère → UN appel avec la nouvelle position", async () => {
      vi.mocked(reverseGeocode).mockResolvedValue(MILLAU);
      renderAdd();
      await toStep1();
      fireEvent.click(await screen.findByText("Nord"));

      await waitFor(() => expect(addressField().value).toBe("12 Rue de la Capelle"));
      expect(reverseGeocode).toHaveBeenCalledTimes(1);
    });

    it("« Ma position » → UN appel", async () => {
      vi.mocked(reverseGeocode).mockResolvedValue(MILLAU);
      stubGeolocation(44.5, 3.5);
      renderAdd();
      await toStep1();
      fireEvent.click(await screen.findByText("Ma position"));

      await waitFor(() => expect(addressField().value).toBe("12 Rue de la Capelle"));
      expect(reverseGeocode).toHaveBeenCalledTimes(1);
      expect(vi.mocked(reverseGeocode).mock.calls[0].slice(0, 2)).toEqual([44.5, 3.5]);
    });
  });
});
