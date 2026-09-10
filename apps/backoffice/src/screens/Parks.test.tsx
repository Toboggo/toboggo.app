import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@toboggo/design-system";
import { listParksPage } from "@toboggo/shared";
import Parks from "./Parks";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listParksPage: vi.fn().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25, pageCount: 1 }),
    listParks: vi.fn().mockResolvedValue([]),
    logActivity: vi.fn().mockResolvedValue(undefined),
  };
});

const perms = vi.hoisted(() => ({ canCreatePark: true }));
vi.mock("../lib/permissions", () => ({
  usePermissions: () => ({
    canCreatePark: perms.canCreatePark,
    canImportParksCsv: false,
    canEditPark: true,
  }),
}));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: false, communeId: "org-1" }) }));
vi.mock("../lib/orgSession", () => ({
  useOrgSession: () => ({ userName: "Testeur", isGestionnaireOrAbove: () => true }),
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderParks() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/parks"]}>
          <LocationProbe />
          <Routes>
            <Route path="/parks" element={<Parks />} />
            <Route path="/parks/new" element={<div>ÉCRAN CRÉATION</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("Parks — création (Lot 3C.4)", () => {
  beforeEach(() => {
    perms.canCreatePark = true;
    vi.mocked(listParksPage).mockClear();
  });

  it("the 'Ajouter un parc' header button navigates to /parks/new (no modal)", async () => {
    renderParks();
    await waitFor(() => expect(listParksPage).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("button", { name: "Ajouter un parc" })[0]);
    expect(screen.getByTestId("loc").textContent).toBe("/parks/new");
    // the old creation modal must not appear
    expect(screen.queryByRole("dialog", { name: /Ajouter un parc/i })).toBeNull();
  });

  it("the empty-state 'Ajouter un parc' button also routes to /parks/new", async () => {
    renderParks();
    await waitFor(() => expect(screen.getByText("Aucun parc rattaché")).toBeTruthy());
    const buttons = screen.getAllByRole("button", { name: "Ajouter un parc" });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(screen.getByTestId("loc").textContent).toBe("/parks/new");
  });

  it("hides the create button without permission", async () => {
    perms.canCreatePark = false;
    renderParks();
    await waitFor(() => expect(listParksPage).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Ajouter un parc" })).toBeNull();
  });
});
