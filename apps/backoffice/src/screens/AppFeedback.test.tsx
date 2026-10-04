import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { getAppFeedbackSummary, listAppFeedback, type AppFeedback as Row } from "@toboggo/shared";
import AppFeedback from "./AppFeedback";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, listAppFeedback: vi.fn(), getAppFeedbackSummary: vi.fn() };
});

const scope = vi.hoisted(() => ({ isAdmin: true }));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: scope.isAdmin }) }));

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/app-feedback"]}>
        <Routes>
          <Route path="/app-feedback" element={<AppFeedback />} />
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const row = (o: Partial<Row>): Row => ({
  id: "1", user_id: "u1xxxxxxxx", rating: 4, title: null, body: null,
  created_at: "2026-10-02T10:00:00Z", updated_at: "2026-10-02T10:00:00Z", edited_at: null, ...o,
});

beforeEach(() => {
  scope.isAdmin = true;
  vi.mocked(listAppFeedback).mockReset();
  vi.mocked(getAppFeedbackSummary).mockReset().mockResolvedValue({
    average_rating: 4, rating_count: 2, total_submissions: 3, count_1: 0, count_2: 0, count_3: 1, count_4: 0, count_5: 1,
  });
});

describe("Évaluations de l'app (admin)", () => {
  it("lists every submission, marks the latest per user, keeps legacy titles", async () => {
    vi.mocked(listAppFeedback).mockResolvedValue([
      row({ id: "3", user_id: "uA", rating: 5, body: "Mieux", created_at: "2026-10-02T10:00:00Z", edited_at: "2026-10-03T10:00:00Z" }),
      row({ id: "2", user_id: "uB", rating: 3, body: "Moyen" }),
      row({ id: "1", user_id: "uA", rating: 2, title: "Super app", body: "Très pratique", created_at: "2026-07-01T10:00:00Z" }),
    ]);
    renderScreen();
    expect(await screen.findByText("Super app")).toBeTruthy();
    expect(screen.getByText("Très pratique")).toBeTruthy();
    expect(screen.getAllByText("Dernier avis")).toHaveLength(2);
    expect(screen.getAllByText("Historique")).toHaveLength(1);
    expect(screen.getByText(/modifié le/)).toBeTruthy();
  });

  it("shows the overall rating computed from latest reviews (summary view)", async () => {
    vi.mocked(listAppFeedback).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText("Note moyenne")).toBeTruthy();
    expect(await screen.findByText("4,0")).toBeTruthy();
    expect(screen.getByText("Utilisateurs ayant évalué")).toBeTruthy();
    expect(screen.getByText("Avis au total")).toBeTruthy();
  });

  it("redirects a non-admin without even querying", () => {
    scope.isAdmin = false;
    renderScreen();
    expect(screen.getByText("HOME")).toBeTruthy();
    expect(listAppFeedback).not.toHaveBeenCalled();
    expect(getAppFeedbackSummary).not.toHaveBeenCalled();
  });
});
