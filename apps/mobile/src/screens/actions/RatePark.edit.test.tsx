import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createReview, getReview, updateMyReview } from "@toboggo/shared";
import "../../i18n/testInit";
import { EditReviewRoute } from "./RatePark";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, createReview: vi.fn(), getReview: vi.fn(), updateMyReview: vi.fn() };
});

vi.mock("../../lib/parksQuery", () => ({
  usePark: (id?: string) => ({ data: id === "p1" ? { id: "p1", name: "Square Voltaire" } : undefined }),
}));

const sess = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("../../lib/session", () => ({
  useSession: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const s = { userId: sess.userId, loading: false, profile: { name: "Alice" } };
      return sel ? sel(s) : s;
    },
    { getState: () => ({ userId: sess.userId }) },
  ),
}));

const toasts = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock("../../lib/toast", () => ({
  useToastStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const s = { show: (m: string) => toasts.list.push(m) };
      return sel ? sel(s) : s;
    },
    { getState: () => ({ show: (m: string) => toasts.list.push(m) }) },
  ),
}));
vi.mock("../../lib/analytics", () => ({ trackEvent: vi.fn() }));

const REVIEW = {
  id: "r1",
  park_id: "p1",
  user_id: "u1",
  author_name: "Alice",
  rating: 4,
  stars: 4,
  status: "published",
  comment: "Super parc",
  age_band: "3-6",
  sub_ratings: { clean: 3, safety: 2, equipment: 1, comfort: 2 },
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
  edited_at: null,
};

function LocationProbe() {
  return <div data-testid="loc">{useLocation().pathname}</div>;
}

function renderEdit() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/review/r1/edit"]}>
        <LocationProbe />
        <Routes>
          <Route path="/review/:reviewId/edit" element={<EditReviewRoute />} />
          <Route path="/park/:id" element={<div>FICHE PARC</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const comment = () => screen.getByLabelText(/Votre commentaire/) as HTMLTextAreaElement;
/** Étape « Mon expérience » (commentaire inclus) → étape « Vérifier mon avis ». */
async function toVerify() {
  fireEvent.click(await screen.findByRole("button", { name: "Continuer" }));
  await screen.findByText("Vérifier mon avis");
}

describe("RatePark — edit mode (Modifier mon avis)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toasts.list.length = 0;
    sess.userId = "u1";
    vi.mocked(getReview).mockResolvedValue(REVIEW as never);
    vi.mocked(updateMyReview).mockResolvedValue(REVIEW as never);
  });

  it("prefills the form, titles it « Modifier mon avis » and never creates a review", async () => {
    renderEdit();
    expect(await screen.findByRole("heading", { name: "Modifier mon avis" })).toBeTruthy();
    expect((await screen.findByLabelText(/Votre commentaire/) as HTMLTextAreaElement).value).toBe("Super parc");
    expect(screen.getByText("Étape 1 sur 2")).toBeTruthy(); // le parc est fixé : pas d'étape « Choisir le parc »
    expect(createReview).not.toHaveBeenCalled();
  });

  it("disables saving until something changes, then updates the same review and returns", async () => {
    renderEdit();
    await toVerify();
    expect((screen.getByRole("button", { name: "Enregistrer les modifications" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));

    fireEvent.change(await screen.findByLabelText(/Votre commentaire/), { target: { value: "Vraiment super" } });
    await toVerify();
    const save = screen.getByRole("button", { name: "Enregistrer les modifications" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(updateMyReview).toHaveBeenCalledTimes(1));
    expect(updateMyReview).toHaveBeenCalledWith("r1", "u1", {
      stars: 4,
      sub_ratings: REVIEW.sub_ratings,
      age_band: "3-6",
      comment: "Vraiment super",
    });
    await waitFor(() => expect(toasts.list).toContain("Votre avis a été mis à jour"));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/park/p1"));
    expect(createReview).not.toHaveBeenCalled();
  });

  it("keeps what the user typed when saving fails", async () => {
    vi.mocked(updateMyReview).mockRejectedValueOnce(new Error("boom"));
    renderEdit();
    fireEvent.change(await screen.findByLabelText(/Votre commentaire/), { target: { value: "Texte en cours" } });
    await toVerify();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/conservées/);
    await waitFor(() => expect((screen.getByRole("button", { name: "Enregistrer les modifications" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(comment().value).toBe("Texte en cours");
    expect(screen.getByTestId("loc").textContent).toBe("/review/r1/edit");
  });

  it("asks before leaving with unsaved changes, and leaves freely without", async () => {
    renderEdit();
    await screen.findByRole("heading", { name: "Modifier mon avis" });
    fireEvent.change(await screen.findByLabelText(/Votre commentaire/), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(await screen.findByText("Quitter sans enregistrer ?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuer la modification" }));
    expect(screen.queryByText("Quitter sans enregistrer ?")).toBeNull();
    expect(screen.getByTestId("loc").textContent).toBe("/review/r1/edit");

    fireEvent.change(comment(), { target: { value: "Super parc" } }); // back to original ⇒ clean
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/park/p1"));
  });

  it("refuses to edit someone else's review", async () => {
    vi.mocked(getReview).mockResolvedValue({ ...REVIEW, user_id: "other" } as never);
    renderEdit();
    expect(await screen.findByText("Cet avis n’est plus modifiable.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enregistrer les modifications" })).toBeNull();
  });
});
