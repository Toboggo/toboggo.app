import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@toboggo/design-system";
import { buildDraftKey, updatePark, listExternalIds, mapStyleUrl, readDraft, writeDraft } from "@toboggo/shared";
import { InfoPanel } from "./InfoPanel";

// MapLibre never instantiated in these tests (mapStyleUrl → null) but the
// module must still resolve.
vi.mock("maplibre-gl", () => ({
  __esModule: true,
  default: { Map: class {}, Marker: class {}, NavigationControl: class {} },
}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    mapStyleUrl: vi.fn(() => null), // fallback: numeric lat/lng fields
    updatePark: vi.fn().mockResolvedValue(undefined),
    logActivity: vi.fn().mockResolvedValue(undefined),
    listExternalIds: vi.fn().mockResolvedValue([]),
  };
});

const orgScopeState = vi.hoisted(() => ({ communeId: "org-1" as string | null }));
vi.mock("../../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: false, communeId: orgScopeState.communeId }) }));
const orgSessionState = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("../../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = { userName: "Testeur", userId: orgSessionState.userId };
    return sel ? sel(state) : state;
  },
}));

function makePark(over: Record<string, unknown> = {}): never {
  return {
    id: "p1",
    name: "Aire de jeux",
    status: "published",
    verification_status: "unverified",
    operational_status: "active",
    address_line: "12 rue du Parc",
    postal_code: "12100",
    city: "Millau",
    formatted_address: "12 rue du Parc, 12100 Millau",
    latitude: 44.099776,
    longitude: 3.111459,
    min_age: null,
    max_age: null,
    description: null,
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-02-03T12:00:00Z",
    ...over,
  } as never;
}

function renderPanel(park = makePark(), canEdit = true) {
  const onDirtyChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <InfoPanel park={park} canEdit={canEdit} onDirtyChange={onDirtyChange} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, onDirtyChange };
}

const lastPatch = () => vi.mocked(updatePark).mock.calls.at(-1)?.[1] as Record<string, unknown>;

async function enterEdit() {
  fireEvent.click(await screen.findByRole("button", { name: "Modifier" }));
}

describe("InfoPanel — structured address + location (Lot 3C.3)", () => {
  beforeEach(() => {
    localStorage.clear();
    orgScopeState.communeId = "org-1";
    orgSessionState.userId = "u1";
    vi.mocked(updatePark).mockReset().mockResolvedValue({} as never);
    vi.mocked(listExternalIds).mockReset().mockResolvedValue([] as never);
    vi.mocked(mapStyleUrl).mockReset().mockReturnValue(null);
  });

  // ── Read mode ────────────────────────────────────────────────────────────
  it("read mode: shows the structured address on separate lines", () => {
    renderPanel();
    expect(screen.getByText("12 rue du Parc")).toBeTruthy();
    expect(screen.getByText("12100 Millau")).toBeTruthy();
    // never the raw / sentinel column
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText(/null/)).toBeNull();
  });

  it("read mode: all address fields empty → 'Adresse non renseignée'", () => {
    renderPanel(makePark({ address_line: null, postal_code: null, city: null, formatted_address: "—" }));
    expect(screen.getByText("Adresse non renseignée")).toBeTruthy();
  });

  // ── Save path ────────────────────────────────────────────────────────────
  it("edits the address without touching coordinates", async () => {
    renderPanel();
    await enterEdit();
    fireEvent.change(screen.getByLabelText("Adresse / voie"), { target: { value: "5 place du Centre" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(updatePark).toHaveBeenCalledTimes(1));
    const patch = lastPatch();
    expect(patch.address_line).toBe("5 place du Centre");
    expect("postal_code" in patch).toBe(false);
    expect("city" in patch).toBe(false);
    expect("latitude" in patch).toBe(false);
    expect("longitude" in patch).toBe(false);
    expect("formatted_address" in patch).toBe(false);
  });

  it("edits the coordinates without touching the address (pair sent together)", async () => {
    renderPanel();
    await enterEdit();
    fireEvent.change(screen.getByLabelText(/^Latitude/), { target: { value: "44.200000" } });
    fireEvent.change(screen.getByLabelText(/^Longitude/), { target: { value: "3.200000" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(updatePark).toHaveBeenCalledTimes(1));
    const patch = lastPatch();
    expect(patch.latitude).toBe(44.2);
    expect(patch.longitude).toBe(3.2);
    expect("address_line" in patch).toBe(false);
    expect("postal_code" in patch).toBe(false);
    expect("city" in patch).toBe(false);
  });

  it("an emptied address field is saved as null", async () => {
    renderPanel();
    await enterEdit();
    fireEvent.change(screen.getByLabelText("Code postal"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(updatePark).toHaveBeenCalledTimes(1));
    const patch = lastPatch();
    expect(patch.postal_code).toBeNull();
    expect(patch.city).toBeNull();
  });

  it("touching one age bound sends the complete age_min / age_max pair", async () => {
    renderPanel(makePark({ min_age: 3, max_age: 10 }));
    await enterEdit();
    fireEvent.change(screen.getByLabelText("Âge minimum"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(updatePark).toHaveBeenCalledTimes(1));
    const patch = lastPatch();
    expect(patch.age_min).toBe(5);
    expect(patch.age_max).toBe(10);
  });

  it("invalid coordinates block the save entirely", async () => {
    renderPanel();
    await enterEdit();
    fireEvent.change(screen.getByLabelText(/^Latitude/), { target: { value: "999" } });
    fireEvent.change(screen.getByLabelText(/^Longitude/), { target: { value: "3.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(screen.getByText(/Coordonnées GPS invalides/)).toBeTruthy(),
    );
    expect(updatePark).not.toHaveBeenCalled();
  });

  it("a single save covers name + address + description in one updatePark call", async () => {
    renderPanel();
    await enterEdit();
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Aire de jeux du Centre" } });
    fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "Creissels" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(updatePark).toHaveBeenCalledTimes(1));
    const patch = lastPatch();
    expect(patch.name).toBe("Aire de jeux du Centre");
    expect(patch.city).toBe("Creissels");
  });

  // ── Dirty state ──────────────────────────────────────────────────────────
  it("dirty-state reflects address edits and clears on cancel", async () => {
    const { onDirtyChange } = renderPanel();
    await enterEdit();
    onDirtyChange.mockClear();
    fireEvent.change(screen.getByLabelText("Ville"), { target: { value: "Creissels" } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  it("dirty-state reflects a coordinate edit", async () => {
    const { onDirtyChange } = renderPanel();
    await enterEdit();
    onDirtyChange.mockClear();
    fireEvent.change(screen.getByLabelText(/^Latitude/), { target: { value: "44.200000" } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
  });

  it("shows the 'saved separately' help text in edit mode", async () => {
    renderPanel();
    await enterEdit();
    expect(
      screen.getByText(/enregistrées séparément\. Modifier l'une ne déplace pas/i),
    ).toBeTruthy();
  });
});

// ── Persistent draft (LOT 3D.F) ───────────────────────────────────────────
const draftKey = (parkId: string, organizationId: string | null, userId: string) =>
  buildDraftKey({
    surface: "bo",
    flow: "park.edit.info",
    scope: { parkId, organizationId: organizationId ?? "admin" },
    principal: { userId },
  });
const READ = { schemaVersion: 1, ttlMs: 72 * 60 * 60 * 1000 };
// Matches makePark()'s default `updated_at` — kept separate since makePark()
// deliberately returns `never` (fixture shortcut), so its properties can't be
// read back through the type checker.
const BASE_UPDATED_AT = "2026-02-03T12:00:00Z";

describe("InfoPanel — persistent draft (LOT 3D.F)", () => {
  beforeEach(() => {
    localStorage.clear();
    orgScopeState.communeId = "org-1";
    orgSessionState.userId = "u1";
    vi.mocked(updatePark).mockReset().mockResolvedValue({} as never);
    vi.mocked(listExternalIds).mockReset().mockResolvedValue([] as never);
    vi.mocked(mapStyleUrl).mockReset().mockReturnValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it("no stored draft → edit mode shows plain server data, no restore toast", async () => {
    renderPanel();
    await enterEdit();
    expect(screen.getByLabelText("Nom")).toHaveProperty("value", "Aire de jeux");
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
  });

  it("a modification autosaves (debounced) under the draft key, tagged with the current baseUpdatedAt", async () => {
    const park = makePark();
    renderPanel(park);
    await enterEdit();
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Aire modifiée" } });
    await waitFor(
      () => {
        const stored = readDraft(draftKey("p1", "org-1", "u1"), READ) as { name?: string; baseUpdatedAt?: string | null };
        expect(stored?.name).toBe("Aire modifiée");
        expect(stored?.baseUpdatedAt).toBe(BASE_UPDATED_AT);
      },
      { timeout: 2000 },
    );
  });

  it("a fresh draft (baseUpdatedAt matches the server) is restored automatically on mount, with a toast", async () => {
    const park = makePark();
    writeDraft(
      draftKey("p1", "org-1", "u1"),
      { name: "Aire reprise", addressLine: "", postalCode: "", city: "", latitude: "", longitude: "", ageMin: "", ageMax: "", description: "", operational: "active", baseUpdatedAt: BASE_UPDATED_AT },
      { schemaVersion: 1 },
    );
    renderPanel(park);
    expect(await screen.findByText("Brouillon restauré")).toBeTruthy();
    expect(screen.getByLabelText("Nom")).toHaveProperty("value", "Aire reprise");
  });

  it("save success clears the draft before leaving edit mode", async () => {
    const park = makePark();
    renderPanel(park);
    await enterEdit();
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Aire modifiée" } });
    await waitFor(() =>
      expect((readDraft(draftKey("p1", "org-1", "u1"), READ) as { name?: string })?.name).toBe("Aire modifiée"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(updatePark).toHaveBeenCalledTimes(1));
    expect(readDraft(draftKey("p1", "org-1", "u1"), READ)).toBeNull();
  });

  it("save error keeps the draft and the form in edit mode", async () => {
    vi.mocked(updatePark).mockRejectedValueOnce(new Error("network"));
    const park = makePark();
    renderPanel(park);
    await enterEdit();
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Aire modifiée" } });
    await waitFor(() =>
      expect((readDraft(draftKey("p1", "org-1", "u1"), READ) as { name?: string })?.name).toBe("Aire modifiée"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(updatePark).toHaveBeenCalledTimes(1));
    expect((readDraft(draftKey("p1", "org-1", "u1"), READ) as { name?: string })?.name).toBe("Aire modifiée");
    expect(screen.getByLabelText("Nom")).toHaveProperty("value", "Aire modifiée");
  });

  it("explicit Annuler clears the draft", async () => {
    const park = makePark();
    renderPanel(park);
    await enterEdit();
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Aire modifiée" } });
    await waitFor(() =>
      expect((readDraft(draftKey("p1", "org-1", "u1"), READ) as { name?: string })?.name).toBe("Aire modifiée"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(readDraft(draftKey("p1", "org-1", "u1"), READ)).toBeNull();
  });

  it("a draft for park p1 is never restored, and stays untouched, when viewing park p2", async () => {
    const park1 = makePark();
    writeDraft(
      draftKey("p1", "org-1", "u1"),
      { name: "p1 only", addressLine: "", postalCode: "", city: "", latitude: "", longitude: "", ageMin: "", ageMax: "", description: "", operational: "active", baseUpdatedAt: BASE_UPDATED_AT },
      { schemaVersion: 1 },
    );
    const park2 = makePark({ id: "p2", name: "Autre parc" });
    renderPanel(park2);
    await enterEdit();
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
    expect(screen.getByLabelText("Nom")).toHaveProperty("value", "Autre parc");
    expect((readDraft(draftKey("p1", "org-1", "u1"), READ) as { name?: string })?.name).toBe("p1 only");
  });

  it("a draft written by user A is never restored, and stays untouched, for user B", async () => {
    const park = makePark();
    writeDraft(
      draftKey("p1", "org-1", "u1"),
      { name: "A private", addressLine: "", postalCode: "", city: "", latitude: "", longitude: "", ageMin: "", ageMax: "", description: "", operational: "active", baseUpdatedAt: BASE_UPDATED_AT },
      { schemaVersion: 1 },
    );
    orgSessionState.userId = "u2";
    renderPanel(park);
    await enterEdit();
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
    expect(screen.getByLabelText("Nom")).toHaveProperty("value", "Aire de jeux");
    expect((readDraft(draftKey("p1", "org-1", "u1"), READ) as { name?: string })?.name).toBe("A private");
  });

  it("a draft under one organisation is never restored under another (same park, same user)", async () => {
    const park = makePark();
    writeDraft(
      draftKey("p1", "org-1", "u1"),
      { name: "org-1 private", addressLine: "", postalCode: "", city: "", latitude: "", longitude: "", ageMin: "", ageMax: "", description: "", operational: "active", baseUpdatedAt: BASE_UPDATED_AT },
      { schemaVersion: 1 },
    );
    orgScopeState.communeId = "org-2";
    renderPanel(park);
    await enterEdit();
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
    expect(screen.getByLabelText("Nom")).toHaveProperty("value", "Aire de jeux");
  });

  it("a stale draft (server changed since) is discarded, never silently applied", async () => {
    const park = makePark();
    writeDraft(
      draftKey("p1", "org-1", "u1"),
      { name: "Aire périmée", addressLine: "", postalCode: "", city: "", latitude: "", longitude: "", ageMin: "", ageMax: "", description: "", operational: "active", baseUpdatedAt: "2020-01-01T00:00:00Z" },
      { schemaVersion: 1 },
    );
    renderPanel(park);
    // Give the restore-decision effect a tick, then confirm nothing restored.
    await waitFor(() => expect(readDraft(draftKey("p1", "org-1", "u1"), READ)).toBeNull());
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
    await enterEdit();
    expect(screen.getByLabelText("Nom")).toHaveProperty("value", "Aire de jeux");
  });

  it("no resurrection after clear: saving then remounting starts clean", async () => {
    const park = makePark();
    const { unmount } = renderPanel(park);
    await enterEdit();
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Aire modifiée" } });
    await waitFor(() =>
      expect((readDraft(draftKey("p1", "org-1", "u1"), READ) as { name?: string })?.name).toBe("Aire modifiée"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(updatePark).toHaveBeenCalledTimes(1));
    unmount();

    renderPanel(park);
    await enterEdit();
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
    expect(screen.getByLabelText("Nom")).toHaveProperty("value", "Aire de jeux");
  });
});
