import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@toboggo/design-system";
import { getParkCountryDistribution, listAllParksForExport, listCommunes, listParksPage } from "@toboggo/shared";
import { AdminParks } from "./AdminParks";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listParksPage: vi.fn().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25, pageCount: 1 }),
    listParks: vi.fn().mockResolvedValue([]),
    listAllParksForExport: vi.fn().mockResolvedValue([]),
    listCommunes: vi.fn().mockResolvedValue([]),
    // Admin-UI-8D — sinon la vraie implémentation (Supabase réel) tourne dans
    // les tests Admin dès que le filtre Pays est monté (`enabled: isAdmin`).
    getParkCountryDistribution: vi.fn().mockResolvedValue([]),
    logActivity: vi.fn().mockResolvedValue(undefined),
    // Admin-UI-8B : le vrai `downloadCsv` appelle `URL.createObjectURL`, non
    // implémenté par jsdom — mocké comme le reste de la suite (Dashboard.test.tsx).
    downloadCsv: vi.fn(),
  };
});

const perms = vi.hoisted(() => ({ canCreatePark: true, canImportParksCsv: false }));
vi.mock("../../lib/permissions", () => ({
  usePermissions: () => ({
    canCreatePark: perms.canCreatePark,
    canImportParksCsv: perms.canImportParksCsv,
    canEditPark: true,
  }),
}));
const scope = vi.hoisted(() => ({ isAdmin: false, communeId: "org-1" as string | undefined }));
vi.mock("../../lib/orgScope", () => ({ useOrgScope: () => scope }));
vi.mock("../../lib/orgSession", () => ({
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
            <Route path="/parks" element={<AdminParks />} />
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
    perms.canImportParksCsv = false;
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

describe("Parks — Admin-UI-8C (le contrôle Import CSV utilise le composant Button)", () => {
  beforeEach(() => {
    perms.canCreatePark = true;
    perms.canImportParksCsv = true;
    scope.isAdmin = false;
    scope.communeId = "org-1";
    vi.mocked(listParksPage).mockClear();
  });

  it("'Importer CSV' est un vrai bouton (pas un <label>) qui déclenche le sélecteur de fichier caché", async () => {
    renderParks();
    await waitFor(() => expect(listParksPage).toHaveBeenCalled());

    const button = screen.getByRole("button", { name: "Importer CSV" });
    expect(button.tagName).toBe("BUTTON");

    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
    fireEvent.click(button);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });
});

describe("Parks — Admin-UI-5B (colonne/filtre Source, filtre Collectivité)", () => {
  beforeEach(() => {
    perms.canCreatePark = true;
    perms.canImportParksCsv = false;
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
    perms.canImportParksCsv = false;
    scope.isAdmin = true;
    scope.communeId = undefined;
    vi.mocked(listParksPage).mockClear().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25, pageCount: 1 });
    vi.mocked(listAllParksForExport).mockClear().mockResolvedValue([]);
    vi.mocked(listCommunes).mockClear().mockResolvedValue([
      { id: "org-lyon", name: "Ville de Lyon" },
    ] as never);
    vi.mocked(getParkCountryDistribution).mockClear().mockResolvedValue([{ country_code: "FR", count: 2189 }] as never);
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

  it("l'export d'un pays deep-linké (?country=ES) transmet countryCode, cohérent avec le <Select> Pays", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/parks?country=ES&status=all"]}>
            <Routes>
              <Route path="/parks" element={<AdminParks />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listParksPage).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "ES" })));
    // Admin-UI-8D — le Select reflète bien le pays actif, même si "ES" n'a 0
    // parc dans la distribution mockée (`[{country_code:"FR",…}]` ci-dessus) :
    // le filtre actif ne doit jamais désynchroniser l'affichage du <select>.
    expect((screen.getByLabelText("Pays") as HTMLSelectElement).value).toBe("ES");

    fireEvent.click(screen.getByRole("button", { name: "Exporter CSV" }));
    await waitFor(() =>
      expect(listAllParksForExport).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "ES" })),
    );
  });
});

describe("Parks — Admin-UI-8D (colonnes Pays/Collectivité, filtre Pays, secondaire sans « Non renseigné »)", () => {
  const adminRows = [
    {
      id: "p-fr-org",
      name: "Parc Lyon",
      status: "published",
      updated_at: "2026-01-01",
      source_type: "osm",
      country_code: "FR",
      organization_id: "org-lyon",
      formatted_address: "12 rue des Tilleuls, Lyon",
      min_age: null,
      max_age: null,
    },
    {
      id: "p-es-noorg",
      name: "Parc Madrid",
      status: "published",
      updated_at: "2026-01-02",
      source_type: "osm",
      country_code: "ES",
      organization_id: null,
      formatted_address: null,
      min_age: null,
      max_age: null,
    },
    {
      id: "p-zz-unknown",
      name: "Parc Inconnu",
      status: "published",
      updated_at: "2026-01-03",
      source_type: "osm",
      country_code: "ZZ",
      organization_id: null,
      formatted_address: null,
      min_age: 3,
      max_age: null,
    },
  ];

  beforeEach(() => {
    perms.canCreatePark = true;
    perms.canImportParksCsv = false;
    scope.isAdmin = true;
    scope.communeId = undefined;
    vi.mocked(listParksPage).mockClear().mockResolvedValue({
      rows: adminRows as never,
      total: 3,
      page: 1,
      pageSize: 25,
      pageCount: 1,
    });
    vi.mocked(listCommunes).mockClear().mockResolvedValue([{ id: "org-lyon", name: "Ville de Lyon" }] as never);
    // Ordre volontairement "France avant Espagne" par volume — le tri du
    // <select> doit reclasser par libellé (Espagne < France), pas reprendre
    // cet ordre tel quel.
    vi.mocked(getParkCountryDistribution)
      .mockClear()
      .mockResolvedValue([
        { country_code: "FR", count: 2189 },
        { country_code: "ES", count: 5 },
      ] as never);
  });

  it("affiche la colonne Pays (libellé lisible depuis country_code)", async () => {
    renderParks();
    expect(await screen.findByRole("columnheader", { name: "Pays" })).toBeTruthy();
    const row = (await screen.findByText("Parc Lyon")).closest("tr")!;
    expect(within(row).getByText("France")).toBeTruthy();
  });

  it("un country_code absent de la table de libellés retombe sur le code brut", async () => {
    renderParks();
    const row = (await screen.findByText("Parc Inconnu")).closest("tr")!;
    expect(within(row).getByText("ZZ")).toBeTruthy();
  });

  it("résout la Collectivité depuis les organisations déjà chargées pour le filtre — un seul appel listCommunes, aucune requête par ligne", async () => {
    renderParks();
    const row = (await screen.findByText("Parc Lyon")).closest("tr")!;
    expect(within(row).getByText("Ville de Lyon")).toBeTruthy();
    await waitFor(() => expect(listCommunes).toHaveBeenCalledTimes(1));
  });

  it("affiche un tiret discret quand le parc n'est rattaché à aucune collectivité", async () => {
    renderParks();
    const row = (await screen.findByText("Parc Madrid")).closest("tr")!;
    expect(within(row).getByText("—")).toBeTruthy();
  });

  it("n'affiche plus « Non renseigné » ni de ligne secondaire vide quand adresse et âge sont absents", async () => {
    renderParks();
    const row = (await screen.findByText("Parc Madrid")).closest("tr")!;
    expect(within(row).queryByText("Non renseigné")).toBeNull();
    // Le nom est seul dans sa cellule — aucun <span> secondaire vide généré.
    const nameCell = within(row).getByText("Parc Madrid").closest("td")!;
    expect(nameCell.querySelectorAll("span")).toHaveLength(1);
  });

  it("conserve la ligne secondaire (adresse) quand elle est disponible", async () => {
    renderParks();
    const row = (await screen.findByText("Parc Lyon")).closest("tr")!;
    expect(within(row).getByText("12 rue des Tilleuls, Lyon")).toBeTruthy();
  });

  it("le filtre Pays est visible côté Admin, options triées par libellé, « Tous les pays » en tête", async () => {
    renderParks();
    const select = (await screen.findByLabelText("Pays")) as HTMLSelectElement;
    await waitFor(() => {
      const optionLabels = Array.from(select.options).map((o) => o.textContent);
      expect(optionLabels).toEqual(["Tous les pays", "Espagne", "France"]);
    });
  });

  it("lecture initiale ?country=ES : transmis à listParksPage et reflété par le <select>", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/parks?country=ES&status=all"]}>
            <Routes>
              <Route path="/parks" element={<AdminParks />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listParksPage).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "ES" })));
    await screen.findByLabelText("Pays");
    expect((screen.getByLabelText("Pays") as HTMLSelectElement).value).toBe("ES");
  });

  it("changer le pays transmet countryCode et remet la page à 1", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/parks?status=all&page=2"]}>
            <Routes>
              <Route path="/parks" element={<AdminParks />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listParksPage).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));
    fireEvent.change(await screen.findByLabelText("Pays"), { target: { value: "ES" } });
    await waitFor(() =>
      expect(listParksPage).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "ES", page: 1 })),
    );
  });

  it("Réinitialiser efface le pays actif", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/parks?country=ES&status=all"]}>
            <Routes>
              <Route path="/parks" element={<AdminParks />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listParksPage).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "ES" })));
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    await waitFor(() =>
      expect(listParksPage).toHaveBeenLastCalledWith(expect.objectContaining({ countryCode: undefined })),
    );
    expect((screen.getByLabelText("Pays") as HTMLSelectElement).value).toBe("all");
  });
});

describe("Parks — Admin-UI-8D (vue Collectivité non cassée)", () => {
  beforeEach(() => {
    perms.canCreatePark = true;
    perms.canImportParksCsv = false;
    scope.isAdmin = false;
    scope.communeId = "org-1";
    vi.mocked(listParksPage).mockClear().mockResolvedValue({
      rows: [
        {
          id: "p-1",
          name: "Parc du Parc",
          status: "published",
          updated_at: "2026-01-01",
          source_type: "osm",
          verification_status: "unverified",
          has_open_report: false,
          photos: [],
        },
      ] as never,
      total: 1,
      page: 1,
      pageSize: 25,
      pageCount: 1,
    });
    vi.mocked(getParkCountryDistribution).mockClear();
  });

  it("garde Vérification/Signalement/Photos et n'affiche ni Pays ni Collectivité", async () => {
    renderParks();
    await screen.findByText("Parc du Parc");
    expect(screen.getByRole("columnheader", { name: "Vérification" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Signalement" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Photos" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Pays" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Collectivité" })).toBeNull();
    expect(screen.queryByLabelText("Pays")).toBeNull();
    expect(getParkCountryDistribution).not.toHaveBeenCalled();
  });
});
