import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildDraftKey, createPark, readDraft, uploadPhoto, writeDraft, type DraftPrincipal } from "@toboggo/shared";
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
    const fileInput = screen.getByLabelText(/Ajouter une photo/) as HTMLInputElement;
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

  it("createPark success → the draft is cleared before navigating, no resurrection on late pagehide", async () => {
    renderAdd();
    await toStep4("Square Envoyé");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le parc" }));

    await waitFor(() => expect(createPark).toHaveBeenCalledTimes(1));
    await screen.findByText("Merci !");
    expect(readDraft(key({ userId: "u1" }), READ)).toBeNull();
    window.dispatchEvent(new Event("pagehide"));
    expect(readDraft(key({ userId: "u1" }), READ)).toBeNull();
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
    await screen.findByText("Merci !");
    expect(readDraft(key({ userId: "u1" }), READ)).toBeNull();
  });
});
