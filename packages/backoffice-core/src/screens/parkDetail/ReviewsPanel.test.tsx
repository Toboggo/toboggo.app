import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialogProvider, ToastProvider } from "@toboggo/design-system";
import { listReviewsForPark, deleteReview, replyToReview, type Review } from "@toboggo/shared";
import { ReviewsPanel } from "./ReviewsPanel";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listReviewsForPark: vi.fn(),
    deleteReview: vi.fn().mockResolvedValue(undefined),
    replyToReview: vi.fn().mockResolvedValue(undefined),
  };
});

const perms = vi.hoisted(() => ({ canReplyToReview: false, canDeleteReview: false }));
vi.mock("../../lib/permissions", () => ({
  usePermissions: () => ({ canReplyToReview: perms.canReplyToReview, canDeleteReview: perms.canDeleteReview }),
}));
vi.mock("../../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = { userName: "Testeur" };
    return sel ? sel(state) : state;
  },
}));

function review(partial: Partial<Review>): Review {
  return {
    id: "r1",
    park_id: "p1",
    user_id: "u1",
    author_name: "Camille",
    rating: 4,
    cleanliness: null,
    safety: null,
    equipment: null,
    comfort: null,
    recommended_min_age: null,
    recommended_max_age: null,
    comment: "Très agréable, ombragé.",
    status: "published",
    reply: null,
    reply_by: null,
    reply_at: null,
    created_at: "2026-03-01T10:00:00Z",
    updated_at: "2026-03-01T10:00:00Z",
    stars: 4,
    flagged: false,
    sub_ratings: null,
    photo: null,
    age_band: null,
    ...partial,
  } as Review;
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <ReviewsPanel parkId="p1" />
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("ReviewsPanel (Lot 9G-B)", () => {
  beforeEach(() => {
    perms.canReplyToReview = false;
    perms.canDeleteReview = false;
    vi.mocked(listReviewsForPark).mockReset().mockResolvedValue([]);
    vi.mocked(deleteReview).mockReset().mockResolvedValue(undefined);
    vi.mocked(replyToReview).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an empty state when there are no reviews", async () => {
    vi.mocked(listReviewsForPark).mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByText("Aucun avis pour ce parc.")).toBeTruthy();
  });

  it("renders a published review with author, comment and date", async () => {
    vi.mocked(listReviewsForPark).mockResolvedValue([review({})]);
    renderPanel();
    expect(await screen.findByText("Camille")).toBeTruthy();
    expect(screen.getByText("Très agréable, ombragé.")).toBeTruthy();
    expect(screen.getByText("01 mars 2026")).toBeTruthy();
  });

  it("renders the star rating", async () => {
    vi.mocked(listReviewsForPark).mockResolvedValue([review({ rating: 4 })]);
    renderPanel();
    expect(await screen.findByText("4.0")).toBeTruthy();
  });

  it("shows the published status tag", async () => {
    vi.mocked(listReviewsForPark).mockResolvedValue([review({ status: "published" })]);
    renderPanel();
    expect(await screen.findByText("Publié")).toBeTruthy();
  });

  it("shows the flagged status tag", async () => {
    vi.mocked(listReviewsForPark).mockResolvedValue([review({ status: "flagged" })]);
    renderPanel();
    expect(await screen.findByText("Signalé")).toBeTruthy();
  });

  it("shows the pending status tag", async () => {
    vi.mocked(listReviewsForPark).mockResolvedValue([review({ status: "pending" })]);
    renderPanel();
    expect(await screen.findByText("En attente")).toBeTruthy();
  });

  it("shows the hidden status tag", async () => {
    vi.mocked(listReviewsForPark).mockResolvedValue([review({ status: "hidden" })]);
    renderPanel();
    expect(await screen.findByText("Masqué")).toBeTruthy();
  });

  it("shows an existing reply instead of the reply form", async () => {
    perms.canReplyToReview = true;
    vi.mocked(listReviewsForPark).mockResolvedValue([review({ reply: "Merci pour votre avis !" })]);
    renderPanel();
    expect(await screen.findByText("Merci pour votre avis !")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Répondre à cet avis…")).toBeFalsy();
  });

  it("shows the reply form for an authorized Collectivité", async () => {
    perms.canReplyToReview = true;
    vi.mocked(listReviewsForPark).mockResolvedValue([review({ reply: null })]);
    renderPanel();
    expect(await screen.findByPlaceholderText("Répondre à cet avis…")).toBeTruthy();
  });

  it("hides the reply form for an Admin", async () => {
    perms.canReplyToReview = false;
    vi.mocked(listReviewsForPark).mockResolvedValue([review({ reply: null })]);
    renderPanel();
    await screen.findByText("Camille");
    expect(screen.queryByPlaceholderText("Répondre à cet avis…")).toBeFalsy();
  });

  it("shows the delete button for an Admin", async () => {
    perms.canDeleteReview = true;
    vi.mocked(listReviewsForPark).mockResolvedValue([review({})]);
    renderPanel();
    expect(await screen.findByRole("button", { name: "Supprimer" })).toBeTruthy();
  });

  it("hides the delete button for a Collectivité", async () => {
    perms.canDeleteReview = false;
    vi.mocked(listReviewsForPark).mockResolvedValue([review({})]);
    renderPanel();
    await screen.findByText("Camille");
    expect(screen.queryByRole("button", { name: "Supprimer" })).toBeFalsy();
  });

  it("deletes a review via the existing action after confirmation", async () => {
    perms.canDeleteReview = true;
    vi.mocked(listReviewsForPark).mockResolvedValue([review({ id: "r9" })]);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Supprimer" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));
    await vi.waitFor(() => expect(deleteReview).toHaveBeenCalledWith("r9"));
  });

  it("replies to a review via the existing action", async () => {
    perms.canReplyToReview = true;
    vi.mocked(listReviewsForPark).mockResolvedValue([review({ id: "r9", reply: null })]);
    renderPanel();
    const input = await screen.findByPlaceholderText("Répondre à cet avis…");
    fireEvent.change(input, { target: { value: "Merci !" } });
    fireEvent.click(screen.getByRole("button", { name: "Répondre" }));
    await vi.waitFor(() => expect(replyToReview).toHaveBeenCalledWith("r9", "Merci !", "Testeur"));
  });
});
