import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../../i18n/testInit";
import { useSession } from "../../lib/session";
import Profile from "./Profile";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listMyParks: async () => [{ id: "p1" }, { id: "p2" }],
    listMyReviews: async () => [{ id: "r1" }],
    listChildren: async () => [],
  };
});

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

function renderProfile() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/profile"]}>
        <Routes>
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSession.setState({
    userId: "u1",
    profile: { id: "u1", name: "Test", favorites: ["a"], created_at: "2026-01-01T00:00:00Z" } as never,
  });
});

describe("Profile — accès aux ajouts", () => {
  it("« Parcs ajoutés » ouvre Mes ajouts filtré sur les parcs proposés", async () => {
    renderProfile();
    const btn = await screen.findByText("Parcs ajoutés");
    await waitFor(() => expect(screen.getAllByText("2").length).toBeGreaterThan(0));
    fireEvent.click(btn.closest("button")!);
    expect(screen.getByTestId("where").textContent).toBe("/contributions/history?type=park");
  });

  it("« Avis » ouvre Mes ajouts filtré sur les avis", async () => {
    renderProfile();
    const btn = await screen.findByText("Avis");
    fireEvent.click(btn.closest("button")!);
    expect(screen.getByTestId("where").textContent).toBe("/contributions/history?type=review");
  });

  it("« Favoris » ouvre la page Favoris existante", async () => {
    renderProfile();
    const btns = await screen.findAllByText("Favoris");
    fireEvent.click(btns[0]!.closest("button")!);
    expect(screen.getByTestId("where").textContent).toBe("/favorites");
  });
});
