import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@toboggo/design-system";
import type { Park, ParkEdit, Report, Maintenance } from "@toboggo/shared";
import { ParkLink } from "./ParkLink";
import { AppHeader } from "./AppHeader";
import { ReportModal } from "./ReportModal";
import { RecentReportsPanel } from "../screens/dashboard/RecentReportsPanel";
import { PendingEditsPanel } from "../screens/dashboard/PendingEditsPanel";
import { UpcomingMaintenancePanel } from "../screens/dashboard/UpcomingMaintenancePanel";

vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: false, communeId: "org-1" }) }));
vi.mock("../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = {
      userName: "Testeur",
      userId: "u1",
      userEmail: "t@x.fr",
      signOut: vi.fn(),
      currentRole: () => "gestionnaire",
    };
    return sel ? sel(state) : state;
  },
}));

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const report = {
  id: "r1",
  park_id: "p1",
  category: "cleanliness",
  reason: "cleanliness",
  severity: "low",
  status: "resolved",
  reported_by_name: "Parent",
  created_at: "2026-02-03T10:00:00Z",
  parks: { name: "Parc des Sources" },
} as unknown as Report & { parks: { name: string } };

describe("park detail links", () => {
  it("ParkLink points to /parks/:id", () => {
    wrap(<ParkLink parkId="p1">Parc des Sources</ParkLink>);
    expect(screen.getByRole("link", { name: "Parc des Sources" }).getAttribute("href")).toBe("/parks/p1");
  });

  it("Dashboard — recent reports link the park", () => {
    wrap(<RecentReportsPanel reports={[report]} />);
    expect(screen.getByRole("link", { name: "Parc des Sources" }).getAttribute("href")).toBe("/parks/p1");
  });

  it("Dashboard — pending edits link the park only when it is known", () => {
    const parks = new Map([["p1", { id: "p1", name: "Parc des Sources" } as Park]]);
    const edits = [
      { id: "e1", park_id: "p1", changes: {}, created_at: "2026-02-01T09:00:00Z" },
      { id: "e2", park_id: "inconnu", changes: {}, created_at: "2026-02-01T09:00:00Z" },
    ] as unknown as ParkEdit[];
    wrap(<PendingEditsPanel edits={edits} parkById={parks} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Parc des Sources" }).getAttribute("href")).toBe("/parks/p1");
  });

  it("Dashboard — upcoming maintenance links the park", () => {
    const parks = new Map([["p1", { id: "p1", name: "Parc des Sources" } as Park]]);
    const items = [{ id: "m1", park_id: "p1", date: "2026-03-01", note: null, assignee: null }] as unknown as Maintenance[];
    wrap(<UpcomingMaintenancePanel items={items} parkById={parks} />);
    expect(screen.getByRole("link", { name: "Parc des Sources" }).getAttribute("href")).toBe("/parks/p1");
  });

  it("ReportModal links the park, unless opened from that park's own page", () => {
    const { unmount } = wrap(<ReportModal report={report} onClose={() => {}} canManage={false} />);
    expect(screen.getByRole("link", { name: "Parc des Sources" }).getAttribute("href")).toBe("/parks/p1");
    unmount();
    wrap(<ReportModal report={report} onClose={() => {}} canManage={false} linkToPark={false} />);
    expect(screen.queryByRole("link", { name: "Parc des Sources" })).toBeNull();
    expect(screen.getByText("Parc des Sources")).toBeTruthy();
  });
});

describe("AppHeader breadcrumb", () => {
  it("shows organisation › section › park name on a park route", () => {
    wrap(<AppHeader orgLabel="Ville de Lyon" screenLabel="Mes parcs" detailLabel="Parc des Sources" />);
    const nav = screen.getByRole("navigation", { name: "Fil d'Ariane" });
    expect(nav.textContent).toBe("Ville de Lyon›Mes parcs›Parc des Sources");
  });

  it("keeps the two-level breadcrumb on a plain screen", () => {
    wrap(<AppHeader orgLabel="Ville de Lyon" screenLabel="Mes parcs" />);
    expect(screen.getByRole("navigation", { name: "Fil d'Ariane" }).textContent).toBe("Ville de Lyon›Mes parcs");
  });
});
