import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { listAppFeedback } from "@toboggo/shared";
import AppFeedback from "./AppFeedback";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, listAppFeedback: vi.fn() };
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

beforeEach(() => {
  scope.isAdmin = true;
  vi.mocked(listAppFeedback).mockReset();
});

describe("Évaluations de l'app (admin)", () => {
  it("lists rating, title, text and date", async () => {
    vi.mocked(listAppFeedback).mockResolvedValue([
      { id: "1", user_id: "u1", rating: 4, title: "Super app", body: "Très pratique", created_at: "2026-10-02T10:00:00Z", updated_at: "2026-10-02T10:00:00Z" },
    ]);
    renderScreen();
    expect(await screen.findByText("Super app")).toBeTruthy();
    expect(screen.getByText("Très pratique")).toBeTruthy();
    expect(screen.getByText(/2026/)).toBeTruthy();
  });

  it("redirects a non-admin without even querying", () => {
    scope.isAdmin = false;
    renderScreen();
    expect(screen.getByText("HOME")).toBeTruthy();
    expect(listAppFeedback).not.toHaveBeenCalled();
  });
});
