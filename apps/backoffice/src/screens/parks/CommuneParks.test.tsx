import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@toboggo/design-system";
import { listParks, listPendingParkEditsForOrg, type Park, type ParkEdit } from "@toboggo/shared";
import { CommuneParks } from "./CommuneParks";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listParks: vi.fn().mockResolvedValue([]),
    listPendingParkEditsForOrg: vi.fn().mockResolvedValue([]),
    listParksPage: vi.fn(),
    setParkStatus: vi.fn().mockResolvedValue(undefined),
    logActivity: vi.fn().mockResolvedValue(undefined),
  };
});

const perms = vi.hoisted(() => ({ canCreatePark: true, canImportParksCsv: true, canEditPark: true }));
vi.mock("../../lib/permissions", () => ({ usePermissions: () => perms }));
vi.mock("../../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: false, communeId: "org-1" }) }));
const session = { userName: "Testeur", isGestionnaireOrAbove: () => true, communes: [{ id: "org-1", name: "Ville de Lyon" }] };
vi.mock("../../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: typeof session) => unknown) => (sel ? sel(session) : session),
}));

const park = (over: Partial<Park> = {}): Park =>
  ({
    id: "p-1",
    name: "Square Lafont",
    status: "published",
    verification_status: "unverified",
    operational_status: "active",
    address_line: null,
    formatted_address: null,
    postal_code: null,
    city: null,
    min_age: 2,
    max_age: 8,
    description: null,
    cover_photo: null,
    photos: [],
    features: {},
    has_open_report: false,
    updated_at: "2026-09-30T10:00:00Z",
    ...over,
  }) as Park;

const lyon = (n: number): Park[] =>
  Array.from({ length: n }, (_, i) => park({ id: `p-${i + 1}`, name: `Parc ${String(i + 1).padStart(2, "0")}` }));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderParks(initial = "/parks") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initial]}>
          <LocationProbe />
          <Routes>
            <Route path="/parks" element={<CommuneParks />} />
            <Route path="/parks/new" element={<div>ÉCRAN CRÉATION</div>} />
            <Route path="/parks/:id" element={<div>FICHE</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function setData(parks: Park[], edits: ParkEdit[] = []) {
  vi.mocked(listParks).mockResolvedValue(parks);
  vi.mocked(listPendingParkEditsForOrg).mockResolvedValue(edits);
}

describe("CommuneParks — Mes parcs (COLL-03B)", () => {
  beforeEach(() => {
    perms.canCreatePark = true;
    perms.canImportParksCsv = true;
    perms.canEditPark = true;
    vi.mocked(listParks).mockReset().mockResolvedValue([]);
    vi.mocked(listPendingParkEditsForOrg).mockReset().mockResolvedValue([]);
  });

  it("0 parc → empty state, no KPI strip, no filters; CTA creates", async () => {
    renderParks();
    expect(await screen.findByText("Aucun parc rattaché")).toBeTruthy();
    expect(screen.queryByText("Infos à vérifier")).toBeNull();
    expect(screen.queryByLabelText("Rechercher")).toBeNull();
    const buttons = screen.getAllByRole("button", { name: "Ajouter un parc" });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(screen.getByTestId("loc").textContent).toBe("/parks/new");
  });

  it("0 parc without the create permission → no CTA", async () => {
    perms.canCreatePark = false;
    renderParks();
    expect(await screen.findByText("Aucun parc rattaché")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ajouter un parc" })).toBeNull();
  });

  it("1 parc → header context, 4 real KPIs, one row, no pager", async () => {
    setData([park({ has_open_report: true })]);
    renderParks();
    expect(await screen.findByText("Ville de Lyon · 1 parc")).toBeTruthy();
    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect(screen.getByText("Signalement ouvert", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Parc à compléter")).toBeTruthy();
    expect(screen.getAllByText("Infos à vérifier").length).toBeGreaterThan(0);
    expect(screen.getByText("1 / 5 renseignées")).toBeTruthy();
    expect(screen.getByText("4 à compléter")).toBeTruthy();
    expect(screen.queryByText(/Page \d/)).toBeNull();
  });

  it("12 parcs (Lyon) → all on one page, header counts them", async () => {
    setData(lyon(12));
    renderParks();
    expect(await screen.findByText("Ville de Lyon · 12 parcs")).toBeTruthy();
    expect(screen.getByText("12 / 12")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Ouvrir la fiche de Parc/ })).toHaveLength(12);
    expect(screen.queryByText(/Page \d/)).toBeNull();
  });

  it("many parcs → paginated client-side", async () => {
    setData(lyon(60));
    renderParks();
    await screen.findByText("Ville de Lyon · 60 parcs");
    expect(screen.getAllByRole("button", { name: /Ouvrir la fiche de Parc/ })).toHaveLength(25);
    fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
    expect(screen.getByTestId("loc").textContent).toContain("page=2");
    expect(screen.getByText(/Page 2 \/ 3/)).toBeTruthy();
  });

  it("a row opens the fiche and keeps the list's filters in the URL", async () => {
    setData(lyon(3));
    renderParks("/parks?status=published");
    fireEvent.click(await screen.findByRole("button", { name: "Ouvrir la fiche de Parc 02" }));
    expect(screen.getByTestId("loc").textContent).toBe("/parks/p-2?status=published");
  });

  it("shows « À traiter » pills only for real open reports / pending proposals", async () => {
    setData(
      [park({ id: "a", name: "Alpha", has_open_report: true }), park({ id: "b", name: "Beta" })],
      [{ id: "e1", park_id: "b", status: "pending", changes: {} } as ParkEdit],
    );
    renderParks();
    await screen.findByText("Alpha");
    expect(screen.getAllByText("Signalement")).toHaveLength(1);
    expect(screen.getByText("1 info à vérifier")).toBeTruthy();
    expect(screen.getByText("Signalement ouvert", { selector: "span" }).closest("button")?.textContent).toContain("1 parc concerné");
  });

  it("quick filters narrow the list and 'Réinitialiser' brings it back", async () => {
    setData([park({ id: "a", name: "Alpha", has_open_report: true }), park({ id: "b", name: "Beta" })]);
    renderParks();
    await screen.findByText("Alpha");
    fireEvent.click(screen.getByRole("button", { name: "Signalement ouvert" }));
    expect(screen.getByTestId("loc").textContent).toContain("report=1");
    expect(screen.queryByRole("button", { name: "Ouvrir la fiche de Beta" })).toBeNull();
    expect(screen.getByText("1 sur 2 parcs")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expect(screen.getByRole("button", { name: "Ouvrir la fiche de Beta" })).toBeTruthy();
    expect(screen.getByTestId("loc").textContent).toBe("/parks");
  });

  it("a KPI card applies its filter", async () => {
    setData([park({ id: "a", name: "Alpha" }), park({ id: "b", name: "Beta", description: "d", address_line: "1 rue", cover_photo: "u", photos: ["u"], features: { slide: { status: "available", value: null, quantity: null, category: "play", verified_at: null } } })]);
    renderParks();
    await screen.findByText("Alpha");
    fireEvent.click(screen.getByText("Parc à compléter").closest("button")!);
    expect(screen.getByTestId("loc").textContent).toContain("incomplete=1");
    expect(screen.queryByRole("button", { name: "Ouvrir la fiche de Beta" })).toBeNull();
  });

  it("search matches the name, accent-insensitively; no match → filtered empty state with reset", async () => {
    setData([park({ id: "a", name: "Génin/Pont" }), park({ id: "b", name: "Mermoz" })]);
    renderParks();
    await screen.findByText("Génin/Pont");
    fireEvent.change(screen.getByLabelText("Rechercher"), { target: { value: "genin" } });
    await waitFor(() => expect(screen.queryByText("Mermoz")).toBeNull());
    fireEvent.change(screen.getByLabelText("Rechercher"), { target: { value: "zzz" } });
    expect(await screen.findByText("Aucun parc ne correspond à ces critères.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les filtres" }));
    expect(await screen.findByText("Mermoz")).toBeTruthy();
  });

  it("loading → skeleton (no empty state flash)", () => {
    vi.mocked(listParks).mockReturnValue(new Promise(() => {}));
    renderParks();
    expect(screen.queryByText("Aucun parc rattaché")).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("error → message + retry", async () => {
    vi.mocked(listParks).mockRejectedValueOnce(new Error("boom"));
    renderParks();
    expect(await screen.findByText("Impossible de charger les parcs.")).toBeTruthy();
    setData(lyon(2));
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Parc 01")).toBeTruthy();
  });

  it("proposals failing to load → '—' (unknown), never a false 0", async () => {
    setData(lyon(2));
    vi.mocked(listPendingParkEditsForOrg).mockRejectedValue(new Error("boom"));
    renderParks();
    await screen.findByText("Parc 01");
    expect(screen.getByText("Indisponible pour le moment")).toBeTruthy();
  });

  it("without create permission the 'Ajouter un parc' button is hidden", async () => {
    perms.canCreatePark = false;
    setData(lyon(1));
    renderParks();
    await screen.findByText("Parc 01");
    expect(screen.queryByRole("button", { name: "Ajouter un parc" })).toBeNull();
  });

  it("status transitions in the row menu require edit permission", async () => {
    perms.canEditPark = false;
    setData([park({ status: "published" })]);
    renderParks();
    await screen.findByText("Square Lafont");
    fireEvent.click(screen.getByRole("button", { name: "Actions — Square Lafont" }));
    const menu = screen.getByRole("menu", { name: "Actions — Square Lafont" });
    expect(within(menu).getByRole("menuitem", { name: "Ouvrir la fiche" })).toBeTruthy();
    expect(within(menu).queryByRole("menuitem", { name: "Bloquer" })).toBeNull();
  });
});
