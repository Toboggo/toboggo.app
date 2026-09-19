import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  listParks,
  listReports,
  listReviews,
  listActivity,
  listPendingMedia,
  listMaintenance,
  listPendingParkEditsForOrg,
  listParkEdits,
  getParkSourceDistribution,
  listCommunes,
  listAllUsers,
  downloadCsv,
} from "@toboggo/shared";
import Dashboard from "./Dashboard";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listParks: vi.fn(),
    listReports: vi.fn(),
    listReviews: vi.fn(),
    listActivity: vi.fn(),
    listPendingMedia: vi.fn(),
    listMaintenance: vi.fn(),
    listPendingParkEditsForOrg: vi.fn(),
    listParkEdits: vi.fn(),
    getParkSourceDistribution: vi.fn(),
    listCommunes: vi.fn(),
    listAllUsers: vi.fn(),
    downloadCsv: vi.fn(),
  };
});

const scope = vi.hoisted(() => ({ isAdmin: true, communeId: undefined as string | undefined }));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: scope.isAdmin, communeId: scope.communeId }) }));

function LocationProbe() {
  const loc = useLocation();
  return (
    <div data-testid="loc">
      {loc.pathname}
      {loc.search}
    </div>
  );
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <LocationProbe />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          {/* Cible de navigation seulement — Dashboard se démonte une fois qu'on la quitte. */}
          <Route path="*" element={<div>autre écran</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PARK = (status: "published" | "pending" | "blocked") => ({ id: `p-${status}-${Math.random()}`, status });

describe("Dashboard — Admin-UI-2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scope.isAdmin = true;
    scope.communeId = undefined;
    vi.mocked(listParks).mockResolvedValue([PARK("published"), PARK("published"), PARK("pending")] as never);
    vi.mocked(listReports).mockResolvedValue([{ id: "r1", status: "open" }] as never);
    vi.mocked(listReviews).mockResolvedValue([{ id: "rv1", stars: 5 }] as never);
    vi.mocked(listActivity).mockResolvedValue([]);
    vi.mocked(listPendingMedia).mockResolvedValue([]);
    vi.mocked(listMaintenance).mockResolvedValue([]);
    vi.mocked(listPendingParkEditsForOrg).mockResolvedValue([]);
    vi.mocked(listParkEdits).mockResolvedValue([{ id: "e1", status: "pending" }] as never);
    vi.mocked(getParkSourceDistribution).mockResolvedValue([{ source_type: "osm", count: 3 }]);
    vi.mocked(listCommunes).mockResolvedValue([{ id: "org-1" }, { id: "org-2" }, { id: "org-3" }, { id: "org-4" }, { id: "org-5" }] as never);
    vi.mocked(listAllUsers).mockResolvedValue([{ id: "u1" }, { id: "u2" }, { id: "u3" }, { id: "u4" }] as never);
  });

  it("affiche les KPI admin, cliquables vers les écrans réels", async () => {
    renderDashboard();
    // Libellés propres au KPI (formulation différente de « À traiter », donc
    // sans ambiguïté) — "Parcs en attente" (KPI) ≠ "Parcs en attente de
    // validation" (À traiter), correspondance exacte par défaut de RTL.
    expect(await screen.findByText("Parcs actifs")).toBeTruthy();
    expect(screen.getByText("Parcs en attente")).toBeTruthy();
    expect(screen.getByText("Avis publiés")).toBeTruthy();

    fireEvent.click(screen.getByText("Avis publiés").closest("button")!);
    expect(screen.getByTestId("loc").textContent).toBe("/reviews");
  });

  it("« À traiter » inclut désormais les photos en attente et navigue directement vers /validation (plus de 'écran à venir')", async () => {
    vi.mocked(listPendingMedia).mockResolvedValue([{ id: "m1" }] as never);
    renderDashboard();

    const editsRow = await screen.findByText("Modifications à valider");
    expect(screen.queryByText("Écran dédié à venir")).toBeNull();
    // "Photos en attente" existe à la fois dans le KPI et dans « À traiter » —
    // les deux doivent être présents (pas une ambiguïté à lever, une réalité
    // à vérifier).
    expect(screen.getAllByText("Photos en attente")).toHaveLength(2);

    fireEvent.click(editsRow.closest("button")!);
    expect(screen.getByTestId("loc").textContent).toBe("/validation");
  });

  it("« À traiter » (Admin-UI-2B) : les 4 catégories admin restent toujours visibles, même à 0", async () => {
    vi.mocked(listParkEdits).mockResolvedValue([]);
    renderDashboard();
    expect(await screen.findByText("Parcs en attente de validation")).toBeTruthy();
    // "Modifications à valider" reste affichée (catégorie utile) même à 0 —
    // ce n'est plus filtré, juste rendu en discret.
    const editsRow = screen.getByText("Modifications à valider").closest("button, div")!;
    expect(editsRow.textContent).toContain("0");
  });

  it("« À traiter » : un compteur à 0 n'affiche plus le gros état vide générique", async () => {
    vi.mocked(listParks).mockResolvedValue([PARK("published")] as never);
    vi.mocked(listReports).mockResolvedValue([]);
    vi.mocked(listParkEdits).mockResolvedValue([]);
    renderDashboard();
    await screen.findByText("Parcs en attente de validation");
    expect(screen.queryByText("Rien ne nécessite votre attention pour le moment.")).toBeNull();
    // Les 4 catégories admin sont toutes là (KPI + À traiter partagent le
    // libellé "Signalements ouverts" — 2 occurrences attendues).
    expect(screen.getAllByText("Signalements ouverts")).toHaveLength(2);
    expect(screen.getByText("Modifications à valider")).toBeTruthy();
  });

  it("donut : affiche le total réel, la légende, et gère le cas mono-source", async () => {
    renderDashboard();
    expect(await screen.findByText("OpenStreetMap")).toBeTruthy();
    expect(screen.getByText("3 · 100%")).toBeTruthy();
    // Le total réel (3 parcs) apparaît au centre du donut.
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("donut : état d'erreur avec un Réessayer dédié, distinct du reste de la page", async () => {
    vi.mocked(getParkSourceDistribution).mockRejectedValue(new Error("boom"));
    renderDashboard();
    await screen.findByText("Répartition des parcs par source");
    expect(await screen.findByText("Impossible de charger ces données.")).toBeTruthy();
  });

  it("actions rapides : ouvre les écrans réels uniquement (parcs, signalements, validation, photos)", async () => {
    renderDashboard();
    fireEvent.click(await screen.findByText("Ouvrir la file de validation"));
    expect(screen.getByTestId("loc").textContent).toBe("/validation");
  });

  it("vue Collectivité : conserve le comportement existant (pas de donut ni d'actions rapides admin)", async () => {
    scope.isAdmin = false;
    scope.communeId = "org-1";
    renderDashboard();
    await screen.findByText("Publiés");
    expect(screen.queryByText("Répartition des parcs par source")).toBeNull();
    expect(screen.queryByText("Actions rapides")).toBeNull();
    expect(getParkSourceDistribution).not.toHaveBeenCalled();
  });

  it("Admin-UI-4 : KPI Collectivités/Utilisateurs réels, cliquables, sans le mot « actives »", async () => {
    renderDashboard();
    expect(await screen.findByText("Collectivités")).toBeTruthy();
    expect(await screen.findByText("5")).toBeTruthy();
    expect(screen.getByText("Utilisateurs")).toBeTruthy();
    expect(await screen.findByText("4")).toBeTruthy();
    expect(screen.queryByText(/actives?/i)).toBeNull();
    expect(screen.queryByText(/utilisateurs actifs/i)).toBeNull();

    fireEvent.click(screen.getByText("Collectivités").closest("button")!);
    expect(screen.getByTestId("loc").textContent).toBe("/organizations");
  });

  it("Admin-UI-4 : le KPI Collectivités/Utilisateurs n'existe pas côté Collectivité", async () => {
    scope.isAdmin = false;
    scope.communeId = "org-1";
    renderDashboard();
    await screen.findByText("Publiés");
    expect(screen.queryByText("Collectivités")).toBeNull();
    expect(screen.queryByText("Utilisateurs")).toBeNull();
    expect(listCommunes).not.toHaveBeenCalled();
    expect(listAllUsers).not.toHaveBeenCalled();
  });

  it("Admin-UI-4 : pas de bloc « Top collectivités » (activity_log inter-organisations bloqué par RLS)", async () => {
    renderDashboard();
    await screen.findByText("Collectivités");
    expect(screen.queryByText(/Top collectivités/i)).toBeNull();
    expect(screen.queryByText(/collectivités les plus actives/i)).toBeNull();
  });

  it("Admin-UI-4 : « Signalements ouverts » signale les critiques/hautes sévérités sans dupliquer un bloc « Alertes »", async () => {
    vi.mocked(listReports).mockResolvedValue([
      { id: "r1", status: "open", severity: "critical" },
      { id: "r2", status: "open", severity: "low" },
    ] as never);
    renderDashboard();
    expect(await screen.findByText(/dont 1 critique\/haute sévérité/)).toBeTruthy();
    expect(screen.queryByText("Alertes opérationnelles")).toBeNull();
  });

  it("Admin-UI-4 : export du dashboard réutilise toCsv/downloadCsv avec les compteurs réels", async () => {
    renderDashboard();
    // Le bouton reste désactivé tant qu'un seul KPI charge encore.
    await waitFor(() => expect((screen.getByRole("button", { name: "Exporter" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, csv] = vi.mocked(downloadCsv).mock.calls[0];
    expect(filename).toBe("toboggo-dashboard.csv");
    expect(csv).toContain("Collectivités");
    expect(csv).toContain("Utilisateurs");
  });
});
