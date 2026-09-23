import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialogProvider, ToastProvider } from "@toboggo/design-system";
import { listReviews } from "@toboggo/shared";
import Reviews from "./Reviews";

// `vi.mock` est hoisté au-dessus des imports/consts du fichier — la fixture
// doit donc passer par `vi.hoisted` (même convention que Reports.test.tsx).
const FIXTURE = vi.hoisted(() => [
  {
    id: "r-published",
    park_id: "p1",
    user_id: "u1",
    author_name: "Jean Dupont",
    rating: 5,
    cleanliness: null,
    safety: null,
    equipment: null,
    comfort: null,
    recommended_min_age: null,
    recommended_max_age: null,
    comment: "Super parc",
    status: "published",
    reply: null,
    reply_by: null,
    reply_at: null,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    stars: 5,
    flagged: false,
    sub_ratings: null,
    photo: null,
    age_band: null,
    parks: { name: "Parc Nord" },
  },
  {
    id: "r-flagged",
    park_id: "p2",
    user_id: "u2",
    author_name: "Marie Curie",
    rating: 1,
    cleanliness: null,
    safety: null,
    equipment: null,
    comfort: null,
    recommended_min_age: null,
    recommended_max_age: null,
    comment: "Dangereux",
    status: "flagged",
    reply: "Merci, une équipe intervient.",
    reply_by: "Mairie",
    reply_at: "2026-09-03T10:00:00Z",
    created_at: "2026-09-02T10:00:00Z",
    updated_at: "2026-09-03T10:00:00Z",
    stars: 1,
    flagged: true,
    sub_ratings: null,
    photo: null,
    age_band: null,
    parks: { name: "Parc Sud" },
  },
]);

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listReviews: vi.fn().mockResolvedValue(FIXTURE),
    deleteReview: vi.fn().mockResolvedValue(undefined),
    replyToReview: vi.fn().mockResolvedValue(undefined),
  };
});

const permissionsState = vi.hoisted(() => ({ canReplyToReview: false, canDeleteReview: true }));
vi.mock("../lib/permissions", () => ({
  usePermissions: () => ({ canReplyToReview: permissionsState.canReplyToReview, canDeleteReview: permissionsState.canDeleteReview }),
}));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: true, communeId: undefined }) }));
vi.mock("../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = { userName: "Testeur" };
    return sel ? sel(state) : state;
  },
}));

function renderReviews() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <MemoryRouter initialEntries={["/reviews"]}>
            <Reviews />
          </MemoryRouter>
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("Reviews — modération des avis (Admin-UI-6E)", () => {
  it("affiche le statut réel de chaque avis", async () => {
    permissionsState.canReplyToReview = false;
    permissionsState.canDeleteReview = true;
    renderReviews();
    await waitFor(() => expect(listReviews).toHaveBeenCalled());
    const nordRow = (await screen.findByText("Jean Dupont")).closest("div")!;
    const sudRow = (await screen.findByText("Marie Curie")).closest("div")!;
    expect(within(nordRow).getByText("Publié")).toBeTruthy();
    expect(within(sudRow).getByText("Signalé")).toBeTruthy();
  });

  it("le filtre statut restreint la liste au statut choisi", async () => {
    renderReviews();
    await screen.findByText("Jean Dupont");
    fireEvent.change(screen.getByLabelText("Statut"), { target: { value: "flagged" } });
    expect(screen.queryByText("Jean Dupont")).toBeNull();
    expect(await screen.findByText("Marie Curie")).toBeTruthy();
  });

  it("le nom du parc est un lien vers sa fiche Parc 360", async () => {
    renderReviews();
    const link = await screen.findByRole("link", { name: "Parc Nord" });
    expect(link.getAttribute("href")).toBe("/parks/p1");
  });

  it("un rôle sans droit de réponse (Admin) voit quand même la réponse déjà envoyée, sans formulaire", async () => {
    permissionsState.canReplyToReview = false;
    renderReviews();
    expect(await screen.findByText("Merci, une équipe intervient.")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Répondre à cet avis…")).toBeNull();
  });

  it("un rôle avec droit de réponse voit le formulaire uniquement sur un avis sans réponse", async () => {
    permissionsState.canReplyToReview = true;
    renderReviews();
    await screen.findByText("Jean Dupont");
    expect(screen.getByPlaceholderText("Répondre à cet avis…")).toBeTruthy();
    // L'avis déjà répondu (Marie Curie) n'affiche pas de 2e formulaire.
    expect(screen.getAllByPlaceholderText("Répondre à cet avis…")).toHaveLength(1);
  });

  it("sans droit de suppression, le bouton Supprimer n'apparaît pas", async () => {
    permissionsState.canDeleteReview = false;
    renderReviews();
    await screen.findByText("Jean Dupont");
    expect(screen.queryByRole("button", { name: "Supprimer" })).toBeNull();
  });
});
