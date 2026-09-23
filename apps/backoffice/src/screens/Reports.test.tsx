import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@toboggo/design-system";
import { listReports } from "@toboggo/shared";
import Reports from "./Reports";

// `vi.mock` est hoisté au-dessus des imports/consts du fichier — la fixture
// doit donc passer par `vi.hoisted` pour être visible depuis la factory.
const FIXTURE = vi.hoisted(() =>
  [
    {
      id: "r-open-critical",
      status: "open",
      severity: "critical",
      category: "broken_equipment",
      reported_by_name: "Jean Dupont",
      created_at: "2026-09-01T10:00:00Z",
      parks: { name: "Parc Nord", formatted_address: "1 rue A" },
    },
    {
      id: "r-resolved-safety",
      status: "resolved",
      severity: "low",
      category: "safety",
      reported_by_name: "Jean Dupont",
      created_at: "2026-09-02T10:00:00Z",
      parks: { name: "Parc Sud", formatted_address: null },
    },
    {
      id: "r-dismissed-clean",
      status: "dismissed",
      severity: "medium",
      category: "cleanliness",
      reported_by_name: "Jean Dupont",
      created_at: "2026-09-03T10:00:00Z",
      parks: { name: "Parc Est", formatted_address: "3 rue C" },
    },
  ].map((row) => ({
    park_id: "p1",
    zone_id: null,
    equipment_id: null,
    user_id: "u1",
    equipment_label: null,
    description: null,
    photo: null,
    resolution_note: null,
    resolution_photo: null,
    resolution_days: null,
    resolved_by: null,
    resolved_at: null,
    reason: row.category,
    equipment: null,
    comment: null,
    ...row,
  })),
);

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listReports: vi.fn().mockResolvedValue(FIXTURE),
  };
});

vi.mock("../lib/permissions", () => ({ usePermissions: () => ({ canResolveReport: true }) }));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: true, communeId: undefined }) }));
vi.mock("../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = { userName: "Testeur", userId: "u1" };
    return sel ? sel(state) : state;
  },
}));

function renderReports() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/reports"]}>
          <Reports />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("Reports — file de triage (Lot Admin-2)", () => {
  it("affiche le libellé réel de priorité (severity) sur la ligne visible par défaut", async () => {
    renderReports();
    // Filtre par défaut = "Ouvert" → seul r-open-critical (severity "critical") est visible.
    await waitFor(() => expect(listReports).toHaveBeenCalled());
    expect(await screen.findByText("Critique")).toBeTruthy();
  });

  it("affiche l'adresse du parc quand elle existe, et un message neutre sinon", async () => {
    renderReports();
    await waitFor(() => expect(listReports).toHaveBeenCalled());
    expect(await screen.findByText("1 rue A")).toBeTruthy();
    // Bascule sur "Résolu" pour révéler la ligne dont l'adresse est absente.
    fireEvent.change(screen.getByLabelText("Statut"), { target: { value: "resolved" } });
    expect(await screen.findByText("Adresse non renseignée")).toBeTruthy();
  });

  it("le filtre Statut restreint la liste aux signalements du statut choisi", async () => {
    renderReports();
    expect(await screen.findByText("Parc Nord")).toBeTruthy();
    expect(screen.queryByText("Parc Sud")).toBeNull();

    fireEvent.change(screen.getByLabelText("Statut"), { target: { value: "resolved" } });
    expect(await screen.findByText("Parc Sud")).toBeTruthy();
    expect(screen.queryByText("Parc Nord")).toBeNull();
  });

  it("le filtre Catégorie restreint la liste à la catégorie choisie", async () => {
    renderReports();
    await waitFor(() => expect(listReports).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Statut"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Catégorie"), { target: { value: "cleanliness" } });
    expect(await screen.findByText("Parc Est")).toBeTruthy();
    expect(screen.queryByText("Parc Nord")).toBeNull();
    expect(screen.queryByText("Parc Sud")).toBeNull();
  });

  it("Admin-UI-6C : le nom du parc est un lien vers sa fiche Parc 360", async () => {
    renderReports();
    const link = await screen.findByRole("link", { name: "Parc Nord" });
    expect(link.getAttribute("href")).toBe("/parks/p1");
  });

  it("Admin-UI-6C : cliquer sur le lien du parc n'ouvre pas le signalement", async () => {
    renderReports();
    const link = await screen.findByRole("link", { name: "Parc Nord" });
    fireEvent.click(link);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Admin-UI-6C : le clic sur le reste de la ligne ouvre toujours le signalement", async () => {
    renderReports();
    await screen.findByText("Parc Nord");
    fireEvent.click(screen.getByText("Jean Dupont"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
