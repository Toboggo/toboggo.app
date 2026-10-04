import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildDraftKey, createPark, listFeatures, readDraft, reverseGeocode, uploadPhoto, writeDraft, type DraftPrincipal, type ReverseGeocodedAddress } from "@toboggo/shared";
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

// La détection des doublons (requêtes réseau) n'est pas l'objet de ces tests :
// un stub expose seulement le choix d'un parc existant.
vi.mock("../../components/AddParkSearch", () => ({
  AddParkSearch: ({ onPickExisting }: { onPickExisting: (p: { id: string }) => void }) => (
    <button onClick={() => onPickExisting({ id: "existing-1" })}>pick-existing</button>
  ),
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
const READ = { schemaVersion: 2, ttlMs: 24 * 60 * 60 * 1000 };
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
const nameField = () => screen.getByLabelText("Nom du parc (facultatif)") as HTMLInputElement;

/** Draft v2 complet ; `over` écrase des champs. */
function draftV2(over: Record<string, unknown> = {}) {
  return {
    step: 0,
    lat: 44.1,
    lng: 3.1,
    address: "",
    locationConfirmed: true,
    name: "",
    equipment: { __set: [] },
    ageBands: [],
    ageUnknown: false,
    answers: {},
    description: "",
    photos: [],
    ...over,
  };
}
const seed = (over: Record<string, unknown> = {}, principal: DraftPrincipal = { userId: "u1" }) =>
  writeDraft(key(principal), draftV2(over), { schemaVersion: 2 });

const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Confirmer l’emplacement" }));
const next = () => fireEvent.click(screen.getByRole("button", { name: "Continuer" }));

/** Étape 1 (Informations). */
async function toInfo() {
  await screen.findByText("Où se trouve le parc ?");
  confirm();
  await screen.findByText("Qu’y trouve-t-on ?");
}
/** Étape 2 (Photos et vérification) ; nom facultatif. */
async function toFinal(name?: string) {
  await toInfo();
  if (name) {
    fireEvent.change(nameField(), { target: { value: name } });
    // Attendre l'autosave débouncé avant d'avancer : un clic synchrone ne prouverait
    // que la mise à jour en mémoire.
    const principal: DraftPrincipal = sess.userId ? { userId: sess.userId } : "guest";
    await waitFor(() => expect((readDraft(key(principal), READ) as { name?: string })?.name).toBe(name), { timeout: 2000 });
  }
  next();
  await screen.findByText("Photos et vérification");
}
const send = () => fireEvent.click(screen.getByRole("button", { name: "Envoyer le parc" }));
const radio = (group: string, name: string) =>
  within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name });

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
  vi.mocked(listFeatures).mockReset().mockResolvedValue([]);
  // jsdom n'implémente pas window.scrollTo (appelé à chaque changement d'étape).
  window.scrollTo = vi.fn() as never;
});
afterEach(() => vi.restoreAllMocks());

describe("AddPark — persistent draft (LOT 3D.E)", () => {
  it("no stored draft → starts on the location step (3 steps, header « Étape 1 sur 3 »)", async () => {
    renderAdd();
    expect(await screen.findByText("Où se trouve le parc ?")).toBeTruthy();
    expect(screen.getByText("Étape 1 sur 3")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
  });

  it("typing autosaves the draft (debounced) under the user key", async () => {
    renderAdd();
    await toInfo();
    fireEvent.change(nameField(), { target: { value: "Square Autosave" } });
    await waitFor(
      () => expect((readDraft(key({ userId: "u1" }), READ) as { name?: string })?.name).toBe("Square Autosave"),
      { timeout: 2000 },
    );
  });

  it("restores a stored draft automatically, at the step it was saved at", () => {
    seed({ step: 1, name: "Square Repris" });
    renderAdd();
    expect(nameField().value).toBe("Square Repris");
    expect(screen.getByText("Étape 2 sur 3")).toBeTruthy();
  });

  it("final step restored when the location was confirmed — name is optional", () => {
    seed({ step: 2 });
    renderAdd();
    expect(screen.getByText("Photos et vérification")).toBeTruthy();
    expect(screen.getByText(/Nom non renseigné/)).toBeTruthy();
  });

  it("a restored step ≥ 1 WITHOUT a confirmed location falls back to the location step, no crash", () => {
    seed({ step: 2, locationConfirmed: false });
    renderAdd();
    expect(screen.getByText("Où se trouve le parc ?")).toBeTruthy();
    expect(screen.queryByText("Photos et vérification")).toBeNull();
  });

  it("an old (v1) draft is ignored, never misread", () => {
    writeDraft(
      key({ userId: "u1" }),
      { step: 4, lat: 44.1, lng: 3.1, address: "", name: "Ancien", ageLow: 0, ageHigh: 12, ageTouched: true, services: { __set: ["wc"] }, equipment: { __set: [] }, description: "", photos: [] },
      { schemaVersion: 1 },
    );
    renderAdd();
    expect(screen.getByText("Où se trouve le parc ?")).toBeTruthy();
  });

  it("restoring a position does not trigger a geocoding search", async () => {
    const { searchPlaces } = await import("@toboggo/shared");
    seed({ step: 0, lat: 44.123456, lng: 3.123456 });
    renderAdd();
    await screen.findByText("Où se trouve le parc ?");
    expect(vi.mocked(searchPlaces)).not.toHaveBeenCalled();
  });

  it("flushes to storage on pagehide (app switch / backgrounding)", async () => {
    renderAdd();
    await toInfo();
    fireEvent.change(nameField(), { target: { value: "Non débouncé" } });
    window.dispatchEvent(new Event("pagehide"));
    expect((readDraft(key({ userId: "u1" }), READ) as { name?: string })?.name).toBe("Non débouncé");
  });

  it("only photo URL strings ever reach localStorage — never a File/Blob", async () => {
    renderAdd();
    await toFinal();
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

  it("final step offers camera + library as distinct inputs; photos are optional", async () => {
    renderAdd();
    await toFinal();
    expect(screen.getByRole("button", { name: /Prendre une photo/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Choisir dans la photothèque/ })).toBeTruthy();
    const cam = document.querySelector('input[type="file"][capture]') as HTMLInputElement;
    const lib = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    expect(cam.getAttribute("capture")).toBe("environment");
    expect(cam.multiple).toBe(false);
    expect(lib.multiple).toBe(true);
    expect(screen.getByText("0 / 4 photos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Envoyer le parc" }).hasAttribute("disabled")).toBe(false);
  });

  it("library multi-pick: uploads up to the 4-photo cap, toasts the overflow; photos can be removed", async () => {
    renderAdd();
    await toFinal();
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
    await toFinal("Square Envoyé");
    send();

    await waitFor(() => expect(createPark).toHaveBeenCalledTimes(1));
    await screen.findByText("Parc ajouté !");
    expect(readDraft(key({ userId: "u1" }), READ)).toBeNull();
    window.dispatchEvent(new Event("pagehide"));
    expect(readDraft(key({ userId: "u1" }), READ)).toBeNull();
  });

  it("success sheet — \"Voir le parc\" replaces the wizard entry with the park page", async () => {
    renderAdd();
    await toFinal("Square Voir");
    send();
    await screen.findByText("Parc ajouté !");

    fireEvent.click(screen.getByRole("button", { name: "Voir le parc" }));
    await screen.findByText("FICHE PARC");
    expect(loc()).toBe("/park/new-1");
  });

  it("success sheet — \"Retour à la carte\" replaces the wizard entry with the map", async () => {
    renderAdd();
    await toFinal("Square Carte");
    send();
    await screen.findByText("Parc ajouté !");

    fireEvent.click(screen.getByRole("button", { name: "Retour à la carte" }));
    await screen.findByText("CARTE");
    expect(loc()).toBe("/map");
  });

  it("success sheet — dismissing (backdrop) also replaces the wizard entry with the map", async () => {
    renderAdd();
    await toFinal("Square Backdrop");
    send();
    await screen.findByText("Parc ajouté !");

    const backdrop = document.body.querySelector('[class*="sheetBackdrop"]');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);
    await screen.findByText("CARTE");
    expect(loc()).toBe("/map");
  });

  it("createPark failure → clear inline error, stays on the summary, draft conserved, retry possible", async () => {
    vi.mocked(createPark).mockRejectedValueOnce(new Error("RLS denied"));
    seed({ step: 2, name: "Square Échec", answers: { wc: "yes" }, ageBands: ["3-6"] });
    renderAdd();
    send();

    const alert = await screen.findByRole("alert");
    // Les détails serveur ne sont jamais affichés tels quels.
    expect(alert.textContent).toMatch(/Vos informations sont conservées/);
    expect(alert.textContent).not.toMatch(/RLS/);
    expect(loc()).toBe("/add");
    const kept = readDraft(key({ userId: "u1" }), READ) as { name?: string; answers?: Record<string, string>; ageBands?: string[] };
    expect(kept.name).toBe("Square Échec");
    expect(kept.answers).toEqual({ wc: "yes" });
    expect(kept.ageBands).toEqual(["3-6"]);
    expect(screen.getByText("Toilettes : Oui")).toBeTruthy();

    // Le bouton est de nouveau actif : un second essai aboutit.
    await waitFor(() => expect(screen.getByRole("button", { name: "Envoyer le parc" }).hasAttribute("disabled")).toBe(false));
    send();
    await screen.findByText("Parc ajouté !");
    expect(createPark).toHaveBeenCalledTimes(2);
  });

  it("double tap on « Envoyer le parc » creates ONE park", async () => {
    let resolveCreate!: (p: unknown) => void;
    vi.mocked(createPark).mockReturnValue(new Promise((r) => (resolveCreate = r)) as never);
    renderAdd();
    await toFinal("Square Double");
    const btn = screen.getByRole("button", { name: "Envoyer le parc" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(createPark).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toMatch(/Envoi en cours/);
    resolveCreate({ id: "new-1", name: "Square Double", commune_id: null });
    await screen.findByText("Parc ajouté !");
  });

  it("photos failing AFTER the park exists is not fatal (no duplicate-inducing retry)", async () => {
    const { addParkPhotos } = await import("@toboggo/shared");
    vi.mocked(addParkPhotos).mockRejectedValueOnce(new Error("storage"));
    seed({ step: 2, photos: ["https://x/a.jpg"] });
    renderAdd();
    send();
    await screen.findByText("Parc ajouté !");
    expect(toasts.list.join(" ")).toMatch(/certaines photos/);
    expect(createPark).toHaveBeenCalledTimes(1);
  });

  it("a draft written by user A is never restored for user B", () => {
    seed({ step: 1, name: "A only" }, { userId: "A" });
    sess.userId = "B";
    renderAdd();
    expect(screen.getByText("Où se trouve le parc ?")).toBeTruthy();
    expect(readDraft(key({ userId: "B" }), READ)).toBeNull();
  });
});

describe("AddPark — parcours (maquette)", () => {
  it("shows the six first games, a « Voir tous les jeux » reveal with EVERY catalogue play feature, none lost", async () => {
    const { listFeatures } = await import("@toboggo/shared");
    const play = (code: string, n: number) => ({ id: code, code, category: "play", label_key: `feature.${code}`, icon_key: null, value_set: null, sort_order: n });
    vi.mocked(listFeatures).mockResolvedValue([
      play("slide", 10), play("swing", 20), play("climbing", 30), play("sandbox", 40), play("springer", 50),
      play("zipline", 60), play("carousel", 70), play("seesaw", 110), play("hopscotch", 170),
      { ...play("toilets", 5), category: "service" },
    ] as never);
    renderAdd();
    await toInfo();

    for (const label of ["Toboggan", "Balançoire", "Escalade", "Jeux à ressort", "Bac à sable", "Tourniquet"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "Tyrolienne" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voir tous les jeux" }));
    // Tous les équipements `play` du catalogue, en français (jamais le code anglais) ; pas les services.
    for (const label of ["Tyrolienne", "Bascule", "Marelle"]) expect(screen.getByRole("button", { name: label })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /seesaw|hopscotch|zipline/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Toilettes" })).toBeNull();
    expect(screen.getByRole("button", { name: "Voir moins de jeux" })).toBeTruthy();
  });

  it("games are multi-select (aria-pressed), toggle on/off, and persist as a Set", async () => {
    renderAdd();
    await toInfo();
    const slide = screen.getByRole("button", { name: "Toboggan" });
    expect(slide.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(slide);
    fireEvent.click(screen.getByRole("button", { name: "Tourniquet" }));
    expect(slide.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      const raw = JSON.parse(localStorage.getItem(key({ userId: "u1" }))!);
      expect(raw.data.equipment).toEqual({ __set: ["slide", "carousel"] });
    });
    fireEvent.click(slide);
    expect(slide.getAttribute("aria-pressed")).toBe("false");
  });

  it("everything is unknown by default, and a draft with no answers sends NO service key (never false)", async () => {
    renderAdd();
    await toInfo();
    for (const group of ["Toilettes", "Bancs", "Eau potable", "Parking à proximité", "Zones ombragées", "Parc clôturé", "Entrée accessible en fauteuil"]) {
      expect(radio(group, "Je ne sais pas").getAttribute("aria-checked")).toBe("true");
    }
    expect(screen.getByText("? = Je ne sais pas")).toBeTruthy();
    next();
    await screen.findByText("Photos et vérification");
    send();
    await waitFor(() => expect(createPark).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createPark).mock.calls[0][0];
    for (const k of ["wc", "benches", "water", "parking", "shade", "fenced", "pmr", "age_min", "age_max"]) {
      expect(payload).not.toHaveProperty(k);
    }
    // Pas de nom : libellé générique reconnu par l'affichage (jamais un nom inventé).
    expect(payload.name).toBe("Aire de jeux");
  });

  it("Oui → true, Non → false, ? → absent ; reselecting « ? » clears an answer", async () => {
    renderAdd();
    await toInfo();
    fireEvent.click(radio("Toilettes", "Oui"));
    fireEvent.click(radio("Bancs", "Non"));
    fireEvent.click(radio("Eau potable", "Oui"));
    fireEvent.click(radio("Eau potable", "Je ne sais pas")); // annulée
    fireEvent.click(radio("Parc clôturé", "Non"));
    expect(radio("Toilettes", "Oui").getAttribute("aria-checked")).toBe("true");
    expect(radio("Eau potable", "Oui").getAttribute("aria-checked")).toBe("false");
    next();
    await screen.findByText("Photos et vérification");
    // récapitulatif : Oui/Non listés, inconnus omis
    expect(screen.getByText("Toilettes : Oui")).toBeTruthy();
    expect(screen.getByText("Bancs : Non")).toBeTruthy();
    expect(screen.queryByText(/Eau potable :/)).toBeNull();
    send();
    await waitFor(() => expect(createPark).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createPark).mock.calls[0][0];
    expect(payload).toMatchObject({ wc: true, benches: false, fenced: false });
    for (const k of ["water", "parking", "shade", "pmr"]) expect(payload).not.toHaveProperty(k);
  });

  it("age bands: multi-select contiguous → min/max; unknown is exclusive; disjoint refused with a hint", async () => {
    renderAdd();
    await toInfo();
    const band = (n: string) => screen.getByRole("button", { name: n });
    fireEvent.click(band("0–3 ans"));
    fireEvent.click(band("3–6 ans"));
    expect(band("0–3 ans").getAttribute("aria-pressed")).toBe("true");
    expect(band("3–6 ans").getAttribute("aria-pressed")).toBe("true");
    // 12+ n'est pas voisin de 0–6 : refusé, pas converti en plage 0–12.
    fireEvent.click(band("12 ans"));
    expect(band("12 ans").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/ne se suivent pas/)).toBeTruthy();
    // « Je ne sais pas » est exclusif.
    fireEvent.click(band("Je ne sais pas"));
    expect(band("0–3 ans").getAttribute("aria-pressed")).toBe("false");
    expect(band("Je ne sais pas").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(band("6–12 ans"));
    expect(band("Je ne sais pas").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(band("3–6 ans"));
    next();
    await screen.findByText("Photos et vérification");
    send();
    await waitFor(() => expect(createPark).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPark).mock.calls[0][0]).toMatchObject({ age_min: 3, age_max: 12 });
  });

  it("back from the summary → answers, games, ages, location and photos are all preserved", async () => {
    seed({ step: 2, name: "Square Retour", equipment: { __set: ["slide"] }, ageBands: ["3-6"], answers: { wc: "yes", pmr: "no" }, description: "Fermé l’hiver", photos: ["https://x/a.jpg"] });
    renderAdd();
    fireEvent.click(screen.getAllByRole("button", { name: /Modifier — Parc/ })[0]!);
    await screen.findByText("Qu’y trouve-t-on ?");
    expect(nameField().value).toBe("Square Retour");
    expect(screen.getByRole("button", { name: "Toboggan" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "3–6 ans" }).getAttribute("aria-pressed")).toBe("true");
    expect(radio("Toilettes", "Oui").getAttribute("aria-checked")).toBe("true");
    expect(radio("Entrée accessible en fauteuil", "Non").getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("Une précision utile ? (facultatif)") as HTMLTextAreaElement).value).toBe("Fermé l’hiver");
    // retour à l'étape 1 (Localisation) : l'emplacement et les photos sont intacts
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    await screen.findByText("Où se trouve le parc ?");
    expect((readDraft(key({ userId: "u1" }), READ) as { photos?: string[] })?.photos).toEqual(["https://x/a.jpg"]);
    expect((readDraft(key({ userId: "u1" }), READ) as { lat?: number })?.lat).toBe(44.1);
  });

  it("closing with entered data asks for confirmation; « Continuer la saisie » stays, « Quitter » leaves", async () => {
    seed({ step: 1, name: "Square Quitter" });
    renderAdd();
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuer la saisie" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(loc()).toBe("/add");
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
    await screen.findByText("CARTE");
  });

  it("closing a pristine form leaves without any dialog", async () => {
    renderAdd();
    await screen.findByText("Où se trouve le parc ?");
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    await screen.findByText("CARTE");
  });

  it("an existing park picked in the duplicate check opens its page", async () => {
    renderAdd();
    fireEvent.click(await screen.findByText("pick-existing"));
    await screen.findByText("FICHE PARC");
    expect(loc()).toBe("/park/existing-1");
  });
});

describe("AddPark — guest → OAuth → authenticated", () => {
  it("guest fills the form, hits send → resume route stashed, draft under the guest key", async () => {
    sess.userId = null;
    renderAdd();
    await toFinal("Square Invité");
    send();

    await screen.findByText("LOGIN");
    expect(JSON.parse(localStorage.getItem(RESUME_KEY)!).route).toBe("/add?resume=1");
    expect(createPark).not.toHaveBeenCalled();
    expect((readDraft(key("guest"), READ) as { name?: string })?.name).toBe("Square Invité");
  });

  it("back authenticated with ?resume=1 → guest draft adopted, guest key removed, park auto-created", async () => {
    seed({ step: 2, name: "Square Après Login" }, "guest");
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
    await screen.findByText("Où se trouve le parc ?");
    await screen.findByText("Où se trouve le parc ?");
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it("restaurer un brouillon ne déclenche aucun reverse geocoding", async () => {
    seed({ step: 0, lat: 44.123456, lng: 3.123456, address: "Ma saisie", locationConfirmed: false });
    renderAdd();
    await screen.findByText("Où se trouve le parc ?");
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(addressField().value).toBe("Ma saisie");
  });

  it("position choisie (fin de déplacement) → UN appel, formulaire prérempli", async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(MILLAU);
    renderAdd();
    await screen.findByText("Où se trouve le parc ?");
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
    await screen.findByText("Où se trouve le parc ?");
    fireEvent.click(await screen.findByLabelText("Utiliser ma position"));

    await waitFor(() => expect(addressField().value).toBe("12 Rue de la Capelle"));
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reverseGeocode).mock.calls[0].slice(0, 2)).toEqual([44.5, 3.5]);
  });

  it("erreur API → l'adresse existante est conservée (jamais vidée)", async () => {
    vi.mocked(reverseGeocode).mockResolvedValueOnce(MILLAU).mockRejectedValueOnce(new Error("boom"));
    renderAdd();
    await screen.findByText("Où se trouve le parc ?");
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
    await screen.findByText("Où se trouve le parc ?");
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
    await screen.findByText("Où se trouve le parc ?");
    await pickPlace("Jardin de la Capelle", 44.0989, 3.0781);
    await waitFor(() => expect(addressField().value).toBe("12 Rue de la Capelle"));
    confirm();
    await screen.findByText("Qu’y trouve-t-on ?");
    fireEvent.change(nameField(), { target: { value: "Jardin de la Capelle" } });
    next();
    await screen.findByText("Photos et vérification");
    send();

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
    await screen.findByText("Où se trouve le parc ?");
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
    await screen.findByText("Où se trouve le parc ?");
    await pickPlace("Jardin A", 44.1, 3.1);
    await screen.findByText("12100 Millau");

    await pickPlace("Jardin B", 45.7, 4.8);
    await waitFor(() => expect(reverseGeocode).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("12100 Millau")).toBeNull();

    confirm();
    await screen.findByText("Qu’y trouve-t-on ?");
    fireEvent.change(nameField(), { target: { value: "Jardin B" } });
    next();
    await screen.findByText("Photos et vérification");
    send();

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
      await screen.findByText("Où se trouve le parc ?");
      fireEvent.click(await screen.findByText("Nord"));

      await waitFor(() => expect(addressField().value).toBe("12 Rue de la Capelle"));
      expect(reverseGeocode).toHaveBeenCalledTimes(1);
    });

    it("« Ma position » → UN appel", async () => {
      vi.mocked(reverseGeocode).mockResolvedValue(MILLAU);
      stubGeolocation(44.5, 3.5);
      renderAdd();
      await screen.findByText("Où se trouve le parc ?");
      fireEvent.click(await screen.findByText("Ma position"));

      await waitFor(() => expect(addressField().value).toBe("12 Rue de la Capelle"));
      expect(reverseGeocode).toHaveBeenCalledTimes(1);
      expect(vi.mocked(reverseGeocode).mock.calls[0].slice(0, 2)).toEqual([44.5, 3.5]);
    });
  });
});
