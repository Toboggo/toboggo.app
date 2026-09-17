import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getParkEditWithDetails } from "@toboggo/shared";
import ValidationDetail from "./ValidationDetail";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, getParkEditWithDetails: vi.fn() };
});

function renderDetail(editId = "e1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/validation/${editId}`]}>
        <Routes>
          <Route path="/validation/:editId" element={<ValidationDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ValidationDetail — lecture seule (Admin-3B-1)", () => {
  it("affiche le parc, l'auteur et les items proposés, sans aucune action Approuver/Rejeter", async () => {
    vi.mocked(getParkEditWithDetails).mockResolvedValue({
      id: "e1",
      park_id: "p1",
      user_id: "u1",
      organization_id: null,
      changes: {
        items: [{ field: "ages", label: "Tranche d'âge", current: { min: 3, max: 10 }, proposed: { min: 4, max: 11 } }],
      },
      status: "pending",
      reviewed_by: null,
      review_note: null,
      created_at: "2026-09-01T10:00:00Z",
      reviewed_at: null,
      parks: { name: "Parc Nord", formatted_address: "1 rue A" },
      proposedByName: "Jean Dupont",
    });

    renderDetail();

    expect(await screen.findByRole("heading", { name: "Parc Nord" })).toBeTruthy();
    expect(screen.getByText("Jean Dupont")).toBeTruthy();
    expect(screen.getByText("Tranche d'âge")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approuver" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rejeter" })).toBeNull();
  });

  it("affiche un état introuvable quand la RPC/lecture retourne null", async () => {
    vi.mocked(getParkEditWithDetails).mockResolvedValue(null);
    renderDetail();
    expect(await screen.findByText(/n'existe pas ou n'est pas accessible/)).toBeTruthy();
  });

  it("affiche un état d'erreur avec un bouton Réessayer", async () => {
    vi.mocked(getParkEditWithDetails).mockRejectedValue(new Error("boom"));
    renderDetail();
    expect(await screen.findByText("Impossible de charger cette proposition.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });
});
