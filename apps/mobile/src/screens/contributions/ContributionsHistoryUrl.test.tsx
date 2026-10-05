import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UserContribution } from "@toboggo/shared";
import "../../i18n/testInit";
import ContributionsHistory from "./ContributionsHistory";

const listMyContributions = vi.fn();
vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, listMyContributions: (...a: unknown[]) => listMyContributions(...a) };
});
vi.mock("../../lib/session", () => ({
  useSession: (sel?: (s: unknown) => unknown) => {
    const s = { userId: "u1" };
    return sel ? sel(s) : s;
  },
}));

function Probe() {
  const l = useLocation();
  return <div data-testid="url">{l.pathname + l.search}</div>;
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <Probe />
        <Routes>
          <Route path="/contributions/history" element={<ContributionsHistory />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const base = { parkId: "p", city: "Lyon", createdAt: "2026-09-01T10:00:00.000Z", thumbnail: null };
const PARK: UserContribution = { ...base, id: "park:1", sourceId: "1", type: "park", parkName: "Square A", status: "pending" };
const REVIEW: UserContribution = { ...base, id: "review:1", sourceId: "r1", type: "review", parkName: "Parc B", status: "published", rating: 4 };

beforeEach(() => listMyContributions.mockReset().mockResolvedValue([PARK, REVIEW]));

describe("ContributionsHistory — filtres dans l'URL", () => {
  it("?type=park n'affiche que les parcs proposés (avec leur statut) et le filtre actif", async () => {
    renderAt("/contributions/history?type=park");
    await screen.findByText(/Square A/);
    expect(screen.queryByText(/Parc B/)).toBeNull();
    await screen.findByText(/Square A/);
    expect(screen.getByRole("button", { name: "Statut : En vérification" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Nouveaux parcs");
  });

  it("?type=review garde « Modifier mon avis » accessible", async () => {
    renderAt("/contributions/history?type=review");
    await screen.findByText(/Parc B/);
    expect(screen.queryByText(/Square A/)).toBeNull();
    expect(screen.getByRole("button", { name: "Actions sur votre avis" })).toBeTruthy();
  });

  it("?status=pending filtre par statut", async () => {
    renderAt("/contributions/history?status=pending");
    await screen.findByText(/Square A/);
    expect(screen.queryByText(/Parc B/)).toBeNull();
  });

  it("« Tous les ajouts » retire le filtre de l'URL et réaffiche tout", async () => {
    renderAt("/contributions/history?type=park");
    await screen.findByText(/Square A/);
    fireEvent.click(screen.getByRole("button", { name: "Tous les ajouts" }));
    await screen.findByText(/Parc B/);
    expect(screen.getByTestId("url").textContent).toBe("/contributions/history");
  });

  it("filtre sans résultat : état vide filtré (pas de crash)", async () => {
    listMyContributions.mockResolvedValue([REVIEW]);
    renderAt("/contributions/history?type=park");
    await screen.findByText("Aucune contribution ne correspond à ces filtres.");
  });
});
