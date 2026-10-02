import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialogProvider, ToastProvider } from "@toboggo/design-system";
import { getParkEditWithDetails, getPark, reviewParkEdit, type Park, type ParkEditWithDetails } from "@toboggo/shared";
import ValidationDetail from "./ValidationDetail";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    getParkEditWithDetails: vi.fn(),
    getPark: vi.fn(),
    reviewParkEdit: vi.fn(),
  };
});

const permissionsState = vi.hoisted(() => ({ canReviewParkEdit: true }));
vi.mock("../lib/permissions", () => ({ usePermissions: () => ({ canReviewParkEdit: permissionsState.canReviewParkEdit }) }));

function makePark(overrides: Partial<Park> = {}): Park {
  return { min_age: 3, max_age: 10, latitude: 43.6, longitude: 1.44, features: {}, ...overrides } as Park;
}

function makeEdit(overrides: Partial<ParkEditWithDetails> = {}): ParkEditWithDetails {
  return {
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
    ...overrides,
  };
}

function renderDetail(editId = "e1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <MemoryRouter initialEntries={[`/validation/${editId}`]}>
            <Routes>
              <Route path="/validation/:editId" element={<ValidationDetail />} />
            </Routes>
          </MemoryRouter>
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("ValidationDetail — Admin-3B-2", () => {
  beforeEach(() => {
    permissionsState.canReviewParkEdit = true;
    vi.mocked(getParkEditWithDetails).mockReset();
    vi.mocked(getPark).mockReset();
    vi.mocked(reviewParkEdit).mockReset();
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

  it("proposition déjà traitée : aucune action, pas de relecture live du parc", async () => {
    vi.mocked(getParkEditWithDetails).mockResolvedValue(makeEdit({ status: "approved", reviewed_at: "2026-09-06T10:00:00Z" }));
    renderDetail();

    expect(await screen.findByRole("heading", { name: "Parc Nord" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approuver" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rejeter" })).toBeNull();
    expect(getPark).not.toHaveBeenCalled();
    expect(screen.getByText(/a déjà été traitée/)).toBeTruthy();
  });

  it("pending, sans conflit : classe l'item Applicable et approuve via la RPC après confirmation", async () => {
    vi.mocked(getParkEditWithDetails).mockResolvedValue(makeEdit());
    // Le parc a toujours la valeur "current" soumise (3-10) → APPLICABLE.
    vi.mocked(getPark).mockResolvedValue(makePark({ min_age: 3, max_age: 10 }));
    vi.mocked(reviewParkEdit).mockResolvedValue({
      outcome: "approved",
      status: "approved",
      items: [{ field: "ages", label: "Tranche d'âge", result: "APPLICABLE", applied: true }],
    });
    renderDetail();

    await screen.findByRole("heading", { name: "Parc Nord" });
    expect(await screen.findByText("Applicable")).toBeTruthy();
    expect(screen.getByText(/Valeur actuelle réelle du parc/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Approuver" }));
    await screen.findByText("Approuver la proposition");
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'approbation" }));

    await waitFor(() => expect(reviewParkEdit).toHaveBeenCalledWith("e1", "approve", undefined));
    expect(await screen.findByText(/Proposition approuvée/)).toBeTruthy();
  });

  it("pending, conflit : affiche le badge Conflit et le message d'avertissement", async () => {
    vi.mocked(getParkEditWithDetails).mockResolvedValue(makeEdit());
    // Le parc a une 3e valeur, ni current (3-10) ni proposed (4-11) → CONFLICT.
    vi.mocked(getPark).mockResolvedValue(makePark({ min_age: 6, max_age: 14 }));
    renderDetail();

    expect(await screen.findByText("Conflit")).toBeTruthy();
    expect(screen.getByText(/ne sera pas appliqué automatiquement/)).toBeTruthy();
    // Les boutons restent disponibles : c'est la RPC (relecture verrouillée) qui tranche réellement.
    expect(screen.getByRole("button", { name: "Approuver" })).toBeTruthy();
  });

  it("rejette via la RPC avec la note saisie, après confirmation", async () => {
    vi.mocked(getParkEditWithDetails).mockResolvedValue(makeEdit());
    vi.mocked(getPark).mockResolvedValue(makePark());
    vi.mocked(reviewParkEdit).mockResolvedValue({ outcome: "rejected", status: "rejected", items: [] });
    renderDetail();

    await screen.findByRole("heading", { name: "Parc Nord" });
    fireEvent.change(screen.getByLabelText("Note (optionnelle)"), { target: { value: "Doublon" } });
    fireEvent.click(screen.getByRole("button", { name: "Rejeter" }));
    await screen.findByText("Rejeter la proposition");
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le rejet" }));

    await waitFor(() => expect(reviewParkEdit).toHaveBeenCalledWith("e1", "reject", "Doublon"));
    expect(await screen.findByText("Proposition rejetée.")).toBeTruthy();
  });

  it("annuler la confirmation n'appelle jamais la RPC", async () => {
    vi.mocked(getParkEditWithDetails).mockResolvedValue(makeEdit());
    vi.mocked(getPark).mockResolvedValue(makePark());
    renderDetail();

    await screen.findByRole("heading", { name: "Parc Nord" });
    fireEvent.click(screen.getByRole("button", { name: "Approuver" }));
    await screen.findByText("Approuver la proposition");
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));

    await waitFor(() => expect(screen.queryByText("Approuver la proposition")).toBeNull());
    expect(reviewParkEdit).not.toHaveBeenCalled();
  });

  it("requires_manual_review reste affiché comme un résultat normal, pas une exception", async () => {
    vi.mocked(getParkEditWithDetails).mockResolvedValue(makeEdit());
    vi.mocked(getPark).mockResolvedValue(makePark({ min_age: 6, max_age: 14 }));
    vi.mocked(reviewParkEdit).mockResolvedValue({
      outcome: "requires_manual_review",
      status: "pending",
      items: [{ field: "ages", label: "Tranche d'âge", result: "CONFLICT", applied: false }],
    });
    renderDetail();

    await screen.findByRole("heading", { name: "Parc Nord" });
    fireEvent.click(screen.getByRole("button", { name: "Approuver" }));
    await screen.findByText("Approuver la proposition");
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'approbation" }));

    expect(await screen.findByText(/reste en attente/)).toBeTruthy();
  });

  it("n'affiche aucune action pour un acteur sans droit de traitement (ex. contributeur / support)", async () => {
    permissionsState.canReviewParkEdit = false;
    vi.mocked(getParkEditWithDetails).mockResolvedValue(makeEdit());
    vi.mocked(getPark).mockResolvedValue(makePark());
    renderDetail();

    await screen.findByRole("heading", { name: "Parc Nord" });
    expect(screen.queryByRole("button", { name: "Approuver" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rejeter" })).toBeNull();
    expect(screen.getByText("Vous n'avez pas les droits pour traiter cette proposition.")).toBeTruthy();
  });

  it("proposition sans park_id : aucune action, message explicite, aucune relecture parc", async () => {
    vi.mocked(getParkEditWithDetails).mockResolvedValue(makeEdit({ park_id: null }));
    renderDetail();

    await screen.findByRole("heading", { name: "Parc Nord" });
    expect(screen.queryByRole("button", { name: "Approuver" })).toBeNull();
    expect(screen.getByText(/n'est rattachée à aucun parc/)).toBeTruthy();
    expect(getPark).not.toHaveBeenCalled();
  });
});
