import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Dashboard from "./Dashboard";
import type { Maintenance, Park, ParkEdit, Report, Review } from "@toboggo/shared";

vi.mock("maplibre-gl", () => ({
  __esModule: true,
  default: {
    Map: class {},
    Marker: class {},
    LngLatBounds: class {
      extend() {
        return this;
      }
    },
  },
}));

const park = (over: Partial<Park> = {}): Park =>
  ({
    id: "park-1",
    name: "Square St Exupéry",
    status: "published",
    latitude: 45.75,
    longitude: 4.85,
    views: 0,
    ...over,
  }) as Park;

const report = (over: Partial<Report>): Report =>
  ({
    id: `r-${Math.random()}`,
    park_id: "park-1",
    category: "broken_equipment",
    status: "open",
    created_at: new Date().toISOString(),
    photo: null,
    ...over,
  }) as Report;

const review = (over: Partial<Review>): Review =>
  ({
    id: `rv-${Math.random()}`,
    park_id: "park-1",
    author_name: "Camille",
    rating: 4,
    comment: "Très agréable",
    created_at: new Date().toISOString(),
    ...over,
  }) as Review;

const shared = vi.hoisted(() => ({
  parks: [] as Park[],
  reports: [] as Report[],
  reviews: [] as Review[],
  maintenance: [] as Maintenance[],
  pendingEdits: [] as ParkEdit[],
}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    mapStyleUrl: () => null,
    listParks: vi.fn(() => Promise.resolve(shared.parks)),
    listReports: vi.fn(() => Promise.resolve(shared.reports)),
    listReviews: vi.fn(() => Promise.resolve(shared.reviews)),
    listActivity: vi.fn(() => Promise.resolve([])),
    listPendingMedia: vi.fn(() => Promise.resolve([])),
    listMaintenance: vi.fn(() => Promise.resolve(shared.maintenance)),
    listPendingParkEditsForOrg: vi.fn(() => Promise.resolve(shared.pendingEdits)),
  };
});

vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: false, communeId: "org-1" }) }));
vi.mock("../lib/orgSession", () => ({ useOrgSession: () => ({ userName: "Testeur" }) }));

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Dashboard collectivité — COLL-02C", () => {
  it("computes the enriched KPI row from real reports/reviews (actifs ≠ résolus, moyenne réelle)", async () => {
    shared.parks = [park()];
    shared.reports = [report({ status: "open" }), report({ status: "in_progress" }), report({ status: "resolved" })];
    shared.reviews = [review({ rating: 4 }), review({ rating: 2 })];
    shared.maintenance = [];
    shared.pendingEdits = [];

    renderDashboard();

    await waitFor(() => expect(screen.getByText("Signalements actifs")).toBeTruthy());
    // 1 open + 1 in_progress = 2 actifs ; 1 resolved
    expect(screen.getByText("Signalements actifs").closest("button")?.textContent).toContain("2");
    expect(screen.getByText("Signalements résolus").closest("button")?.textContent).toContain("1");
    expect(screen.getByText("Avis reçus").closest("button")?.textContent).toContain("2");
    // average of 4 and 2 = 3.0
    expect(screen.getByText("★ 3.0 moyenne")).toBeTruthy();
  });

  it("shows compact empty states (no fake chart, no dead link) when there is genuinely no data", async () => {
    shared.parks = [park()];
    shared.reports = [];
    shared.reviews = [];
    shared.maintenance = [];
    shared.pendingEdits = [];

    renderDashboard();

    await waitFor(() => expect(screen.getByText("Signalements récents")).toBeTruthy());
    expect(screen.getByText("Aucun signalement pour le moment.")).toBeTruthy();
    expect(screen.getByText("Aucun signalement récent.")).toBeTruthy();
    expect(screen.getByText("Aucune information à vérifier.")).toBeTruthy();
    expect(screen.getByText("Aucun entretien prévu prochainement.")).toBeTruthy();
    expect(screen.getByText("Aucun avis pour le moment.")).toBeTruthy();

    // "Infos à vérifier" never gets a "Voir tout" link: no route exists.
    const editsHeading = screen.getByText("Infos à vérifier");
    expect(editsHeading.closest("div")?.parentElement?.querySelector("button")).toBeNull();

    // The maintenance block keeps its literal name — never "Interventions".
    expect(screen.getByText("Entretien à venir")).toBeTruthy();
    expect(screen.queryByText("Interventions")).toBeNull();
  });

  it("renders real Signalements récents / Infos à vérifier rows from already-loaded data", async () => {
    shared.parks = [park({ id: "park-1", name: "Square St Exupéry" })];
    shared.reports = [report({ status: "open", category: "broken_equipment" })];
    shared.reviews = [];
    shared.maintenance = [];
    shared.pendingEdits = [
      {
        id: "edit-1",
        park_id: "park-1",
        user_id: "u1",
        organization_id: null,
        changes: { items: [{ field: "ages", label: "Tranche d'âge", current: { min: 1, max: 12 }, proposed: { min: 2, max: 5 } }] },
        status: "pending",
        reviewed_by: null,
        review_note: null,
        created_at: new Date().toISOString(),
        reviewed_at: null,
      },
    ];

    renderDashboard();

    await waitFor(() => expect(screen.getAllByText("Square St Exupéry").length).toBeGreaterThan(0));
    expect(screen.getByText(/Tranche d'âge/)).toBeTruthy();
  });
});
