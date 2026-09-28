import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@toboggo/design-system";
import { listAllParksForExport, listCommunes, listParksPage } from "@toboggo/shared";
import Parks from "./Parks";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listParksPage: vi.fn().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25, pageCount: 1 }),
    listParks: vi.fn().mockResolvedValue([]),
    listAllParksForExport: vi.fn().mockResolvedValue([]),
    listCommunes: vi.fn().mockResolvedValue([]),
    logActivity: vi.fn().mockResolvedValue(undefined),
    // Admin-UI-8B : le vrai `downloadCsv` appelle `URL.createObjectURL`, non
    // implémenté par jsdom — mocké comme le reste de la suite (Dashboard.test.tsx).
    downloadCsv: vi.fn(),
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
const scope = vi.hoisted(() => ({ isAdmin: false, communeId: "org-1" as string | undefined }));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => scope }));
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
    scope.isAdmin = false;
    scope.communeId = "org-1";
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

describe("Parks — Admin-UI-5B (colonne/filtre Source, filtre Collectivité)", () => {
  beforeEach(() => {
    perms.canCreatePark = true;
    scope.isAdmin = false;
    scope.communeId = "org-1";
    vi.mocked(listParksPage).mockClear().mockResolvedValue({
      rows: [
        { id: "p-osm", name: "Parc OSM", status: "published", updated_at: "2026-01-01", source_type: "osm" },
        { id: "p-none", name: "Parc sans source", status: "published", updated_at: "2026-01-01", source_type: null },
      ] as never,
      total: 2,
      page: 1,
      pageSize: 25,
      pageCount: 1,
    });
    vi.mocked(listCommunes).mockClear().mockResolvedValue([]);
  });

  it("affiche la colonne Source avec un libellé lisible, et un tiret quand la donnée est absente", async () => {
    renderParks();
    // "OpenStreetMap" apparaît aussi comme option du filtre Source — on
    // n'affirme quelque chose que sur la ligne réelle du tableau (`within`),
    // pas sur un premier match qui pourrait venir du filtre.
    const osmRow = (await screen.findByText("Parc OSM")).closest("tr")!;
    expect(within(osmRow).getByText("OpenStreetMap")).toBeTruthy();
    // Signalement (absent) est le seul tiret de cette ligne — la source, elle, est connue.
    expect(within(osmRow).getAllByText("—")).toHaveLength(1);

    const noneRow = screen.getByText("Parc sans source").closest("tr")!;
    expect(within(noneRow).queryByText("OpenStreetMap")).toBeNull();
    // Signalement ET source sont tous deux inconnus sur cette ligne.
    expect(within(noneRow).getAllByText("—")).toHaveLength(2);
  });

  it("le filtre Source transmet le sourceTypes choisi à listParksPage", async () => {
    renderParks();
    await waitFor(() => expect(listParksPage).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "osm" } });
    await waitFor(() =>
      expect(listParksPage).toHaveBeenCalledWith(expect.objectContaining({ sourceTypes: ["osm"] })),
    );
  });

  it("le filtre Collectivité n'apparaît pas côté Collectivité (déjà scopée à sa propre organisation)", async () => {
    renderParks();
    await waitFor(() => expect(listParksPage).toHaveBeenCalled());
    expect(screen.queryByLabelText("Collectivité")).toBeNull();
    expect(listCommunes).not.toHaveBeenCalled();
  });

  it("le filtre Collectivité apparaît côté admin et transmet l'organizationId choisi à listParksPage", async () => {
    scope.isAdmin = true;
    scope.communeId = undefined;
    vi.mocked(listCommunes).mockResolvedValue([
      { id: "org-lyon", name: "Ville de Lyon" },
      { id: "org-nice", name: "Ville de Nice" },
    ] as never);
    renderParks();

    await waitFor(() => expect(screen.getByText("Ville de Lyon")).toBeTruthy());
    const select = screen.getByLabelText("Collectivité");
    fireEvent.change(select, { target: { value: "org-lyon" } });
    await waitFor(() =>
      expect(listParksPage).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-lyon" })),
    );
  });
});

describe("Parks — Admin-UI-8B (l'export CSV utilise les filtres réellement actifs)", () => {
  beforeEach(() => {
    perms.canCreatePark = true;
    scope.isAdmin = true;
    scope.communeId = undefined;
    vi.mocked(listParksPage).mockClear().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25, pageCount: 1 });
    vi.mocked(listAllParksForExport).mockClear().mockResolvedValue([]);
    vi.mocked(listCommunes).mockClear().mockResolvedValue([
      { id: "org-lyon", name: "Ville de Lyon" },
    ] as never);
  });

  it("n'appelle jamais listParks() (non paginée) pour l'export — seulement listAllParksForExport", async () => {
    renderParks();
    await waitFor(() => expect(listParksPage).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Exporter CSV" }));
    await waitFor(() => expect(listAllParksForExport).toHaveBeenCalledTimes(1));
  });

  it("transmet exactement les mêmes filtres actifs (statut, source, collectivité, recherche, tri) que ceux utilisés par la liste elle-même", async () => {
    renderParks();
    await waitFor(() => expect(screen.getByText("Ville de Lyon")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Statut"), { target: { value: "published" } });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "osm" } });
    fireEvent.change(screen.getByLabelText("Collectivité"), { target: { value: "org-lyon" } });
    fireEvent.change(screen.getByLabelText("Rechercher"), { target: { value: "Jean" } });
    await waitFor(() =>
      expect(listParksPage).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ["published"],
          sourceTypes: ["osm"],
          organizationId: "org-lyon",
          q: "Jean",
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Exporter CSV" }));
    await waitFor(() =>
      expect(listAllParksForExport).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ["published"],
          sourceTypes: ["osm"],
          organizationId: "org-lyon",
          q: "Jean",
          countryCode: undefined,
          sort: "updated_at",
          order: "desc",
        }),
      ),
    );
  });

  it("l'export d'un pays deep-linké (?country=ES) transmet countryCode — non exposé en <Select> mais toujours actif", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/parks?country=ES&status=all"]}>
            <Routes>
              <Route path="/parks" element={<Parks />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listParksPage).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "ES" })));

    fireEvent.click(screen.getByRole("button", { name: "Exporter CSV" }));
    await waitFor(() =>
      expect(listAllParksForExport).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "ES" })),
    );
  });
});
