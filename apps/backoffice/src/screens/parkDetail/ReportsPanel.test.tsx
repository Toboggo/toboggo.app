import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@toboggo/design-system";
import { listReportsForPark, type Report } from "@toboggo/shared";
import { ReportsPanel } from "./ReportsPanel";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, listReportsForPark: vi.fn() };
});

const orgScopeState = vi.hoisted(() => ({ isAdmin: true }));
vi.mock("../../lib/orgScope", () => ({
  useOrgScope: () => ({ isAdmin: orgScopeState.isAdmin, communeId: orgScopeState.isAdmin ? undefined : "org-1" }),
}));
vi.mock("../../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = { userName: "Testeur", userId: "u1" };
    return sel ? sel(state) : state;
  },
}));
const permsState = vi.hoisted(() => ({ canResolveReport: true }));
vi.mock("../../lib/permissions", () => ({
  usePermissions: () => ({ canResolveReport: permsState.canResolveReport }),
}));

function report(partial: Partial<Report>): Report {
  return {
    id: "r1",
    park_id: "p1",
    zone_id: null,
    equipment_id: null,
    user_id: null,
    reported_by_name: "Alex",
    category: "other",
    severity: "medium",
    equipment_label: null,
    description: null,
    photo: null,
    status: "open",
    resolution_note: null,
    resolution_photo: null,
    resolution_days: null,
    resolved_by: null,
    resolved_at: null,
    created_at: "2026-03-01T10:00:00Z",
    reason: "other",
    equipment: null,
    comment: null,
    ...partial,
  } as Report;
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <ReportsPanel parkId="p1" parkName="Parc Test" />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ReportsPanel (Lot 9H-B)", () => {
  beforeEach(() => {
    orgScopeState.isAdmin = true;
    permsState.canResolveReport = true;
    vi.mocked(listReportsForPark).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows skeleton rows while loading", () => {
    vi.mocked(listReportsForPark).mockReturnValue(new Promise(() => {}));
    const { container } = renderPanel();
    expect(container.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
    expect(screen.queryByText("Aucun signalement pour ce parc.")).toBeFalsy();
  });

  it("shows the empty state when there are no reports", async () => {
    vi.mocked(listReportsForPark).mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByText("Aucun signalement pour ce parc.")).toBeTruthy();
  });

  it("shows an error state with a working retry", async () => {
    vi.mocked(listReportsForPark).mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce([]);
    renderPanel();
    expect(await screen.findByText("Impossible de charger les signalements.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Aucun signalement pour ce parc.")).toBeTruthy();
    expect(listReportsForPark).toHaveBeenCalledTimes(2);
  });

  it("renders one row per report", async () => {
    vi.mocked(listReportsForPark).mockResolvedValue([
      report({ id: "r1", category: "cleanliness" }),
      report({ id: "r2", category: "safety" }),
    ]);
    renderPanel();
    expect(await screen.findByText("Propreté")).toBeTruthy();
    expect(screen.getByText("Problème de sécurité")).toBeTruthy();
  });

  it("sorts open-before-resolved, then by severity, then by most recent", async () => {
    vi.mocked(listReportsForPark).mockResolvedValue([
      report({ id: "low-resolved", category: "cleanliness", status: "resolved", severity: "low", created_at: "2026-01-01T10:00:00Z" }),
      report({ id: "high-open", category: "safety", status: "open", severity: "high", created_at: "2026-01-02T10:00:00Z" }),
      report({ id: "critical-open", category: "accessibility", status: "open", severity: "critical", created_at: "2026-01-03T10:00:00Z" }),
    ]);
    const { container } = renderPanel();
    await screen.findByText("Accessibilité PMR");
    const rowTexts = Array.from(container.querySelectorAll("tbody tr")).map((tr) => tr.textContent ?? "");
    const order = rowTexts.map((t) =>
      t.includes("Accessibilité") ? "critical-open" : t.includes("sécurité") ? "high-open" : "low-resolved",
    );
    expect(order).toEqual(["critical-open", "high-open", "low-resolved"]);
  });

  it("opens the report modal on row click", async () => {
    vi.mocked(listReportsForPark).mockResolvedValue([report({ id: "r1", category: "vegetation" })]);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /Ouvrir le signalement/ }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
