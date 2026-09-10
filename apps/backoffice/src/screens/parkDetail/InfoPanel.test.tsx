import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@toboggo/design-system";
import { updatePark, listExternalIds, mapStyleUrl } from "@toboggo/shared";
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

vi.mock("../../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: false, communeId: "org-1" }) }));
vi.mock("../../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = { userName: "Testeur", userId: "u1" };
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
