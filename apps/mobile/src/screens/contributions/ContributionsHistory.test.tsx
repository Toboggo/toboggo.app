import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UserContribution } from "@toboggo/shared";
import "../../i18n/testInit";
import ContributionsHistory from "./ContributionsHistory";

const listMyContributions = vi.fn();

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listMyContributions: (...args: unknown[]) => listMyContributions(...args),
  };
});

const sess = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("../../lib/session", () => ({
  useSession: (sel?: (s: unknown) => unknown) => {
    const s = { userId: sess.userId };
    return sel ? sel(s) : s;
  },
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderHistory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/contributions/history"]}>
        <LocationProbe />
        <Routes>
          <Route path="/contributions/history" element={<ContributionsHistory />} />
          <Route path="*" element={<div>OTHER</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const loc = () => screen.getByTestId("loc").textContent;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// 5 items spanning every type, several cities, several statuses (some sharing
// the same presentation label across different raw enums/types), and a
// spread of dates crossing every date-filter boundary.
const PHOTO = {
  id: "media:m1",
  sourceId: "m1",
  type: "media" as const,
  parkId: "p1",
  parkName: "Parc de la Mairie",
  city: "Millau",
  createdAt: daysAgo(0),
  status: "approved",
  thumbnail: "https://x/1.jpg",
  photoCount: 1,
};
const EDIT = {
  id: "edit:e1",
  sourceId: "e1",
  type: "edit" as const,
  parkId: "p1",
  parkName: "Aire de jeux de Viastels",
  city: "Millau",
  createdAt: daysAgo(1),
  status: "pending",
  thumbnail: null,
};
const REVIEW = {
  id: "review:r1",
  sourceId: "r1",
  type: "review" as const,
  parkId: "p3",
  parkName: "Parc des Aumières",
  city: "Rivière-sur-Tarn",
  createdAt: daysAgo(2),
  status: "published",
  thumbnail: null,
  rating: 5,
};
const PARK = {
  id: "park:p2",
  sourceId: "p2",
  type: "park" as const,
  parkId: "p2",
  parkName: "Aire de jeux de Paulhe",
  city: "Paulhe",
  createdAt: daysAgo(10),
  status: "published",
  thumbnail: null,
};
const REPORT = {
  id: "report:rep1",
  sourceId: "rep1",
  type: "report" as const,
  parkId: "p4",
  parkName: "Parc de la Victoire",
  city: "Millau",
  createdAt: daysAgo(40),
  status: "in_progress",
  thumbnail: null,
  reportCategory: "broken_equipment",
};

const ALL_ITEMS: UserContribution[] = [PHOTO, EDIT, REVIEW, PARK, REPORT];

beforeEach(() => {
  sess.userId = "u1";
  listMyContributions.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ContributionsHistory — list", () => {
  it("renders every type, sorted newest first, with thumbnail when available", async () => {
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    renderHistory();
    await screen.findByText("1 photo ajoutée");

    const titles = screen.getAllByText(/photo ajoutée|Modification proposée|Avis ajouté|Nouveau parc proposé|Signalement d.un problème/).map((n) => n.textContent);
    expect(titles).toEqual(["1 photo ajoutée", "Modification proposée", "Avis ajouté", "Nouveau parc proposé", "Signalement d’un problème"]);

    const photoRow = screen.getByText("1 photo ajoutée").closest("button")!;
    const thumb = photoRow.querySelector('[class*="thumb"]') as HTMLElement;
    expect(thumb.style.backgroundImage).toContain("https://x/1.jpg");

    const editRow = screen.getByText("Modification proposée").closest("button")!;
    const editThumb = editRow.querySelector('[class*="thumb"]') as HTMLElement;
    expect(editThumb.style.backgroundImage).toBe(""); // no photo — falls back to the type icon
  });

  it("tapping a row opens the park it's attached to", async () => {
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    renderHistory();
    fireEvent.click(await screen.findByText("Avis ajouté"));
    await waitFor(() => expect(loc()).toBe("/park/p3"));
  });

  it("shows relative dates: today, yesterday, N days ago, then an absolute date beyond a week", async () => {
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    renderHistory();
    await screen.findByText("1 photo ajoutée");
    screen.getByText("Aujourd’hui");
    screen.getByText("Hier");
    screen.getByText("Il y a 2 jours");
    // 10 and 40 days ago fall back to an absolute date — not a relative phrase.
    expect(screen.queryByText("Il y a 10 jours")).toBeNull();
    expect(screen.queryByText("Il y a 40 jours")).toBeNull();
  });
});

describe("ContributionsHistory — filters", () => {
  it("filters by type", async () => {
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    renderHistory();
    await screen.findByText("1 photo ajoutée");

    fireEvent.change(screen.getByLabelText("Tous types"), { target: { value: "media" } });
    screen.getByText("1 photo ajoutée");
    expect(screen.queryByText("Avis ajouté")).toBeNull();
    expect(screen.queryByText("Modification proposée")).toBeNull();
  });

  it("filters by status, grouping equivalent statuses across different types", async () => {
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    renderHistory();
    await screen.findByText("1 photo ajoutée");

    // "Publié" covers media.approved, park.published and review.published.
    fireEvent.change(screen.getByLabelText("Tous statuts"), { target: { value: "hub.status.published" } });
    screen.getByText("1 photo ajoutée");
    screen.getByText("Nouveau parc proposé");
    screen.getByText("Avis ajouté");
    expect(screen.queryByText("Modification proposée")).toBeNull();
    expect(screen.queryByText("Signalement d’un problème")).toBeNull();
  });

  it("filters by date (last 7 days excludes the 10- and 40-day-old items)", async () => {
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    renderHistory();
    await screen.findByText("1 photo ajoutée");

    fireEvent.change(screen.getByLabelText("Toutes les dates"), { target: { value: "last7" } });
    screen.getByText("1 photo ajoutée");
    screen.getByText("Modification proposée");
    screen.getByText("Avis ajouté");
    expect(screen.queryByText("Nouveau parc proposé")).toBeNull();
    expect(screen.queryByText("Signalement d’un problème")).toBeNull();
  });

  it("filters by city, and the city list only offers cities actually present", async () => {
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    renderHistory();
    await screen.findByText("1 photo ajoutée");

    const citySelect = screen.getByLabelText("Toutes les villes") as HTMLSelectElement;
    const values = Array.from(citySelect.options).map((o) => o.value);
    expect(values).toEqual(["all", "Millau", "Paulhe", "Rivière-sur-Tarn"]);

    fireEvent.change(citySelect, { target: { value: "Millau" } });
    screen.getByText("1 photo ajoutée");
    screen.getByText("Modification proposée");
    screen.getByText("Signalement d’un problème");
    expect(screen.queryByText("Nouveau parc proposé")).toBeNull();
    expect(screen.queryByText("Avis ajouté")).toBeNull();
  });

  it("combines several filters (type + status + city)", async () => {
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    renderHistory();
    await screen.findByText("1 photo ajoutée");

    fireEvent.change(screen.getByLabelText("Tous types"), { target: { value: "media" } });
    fireEvent.change(screen.getByLabelText("Tous statuts"), { target: { value: "hub.status.published" } });
    fireEvent.change(screen.getByLabelText("Toutes les villes"), { target: { value: "Millau" } });

    screen.getByText("1 photo ajoutée");
    expect(screen.queryByText("Modification proposée")).toBeNull();
    expect(screen.queryByText("Signalement d’un problème")).toBeNull();
  });

  it("shows 'Réinitialiser' only once a filter is active, and it clears everything", async () => {
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    renderHistory();
    await screen.findByText("1 photo ajoutée");
    expect(screen.queryByText("Réinitialiser")).toBeNull();

    fireEvent.change(screen.getByLabelText("Tous types"), { target: { value: "media" } });
    const reset = screen.getByText("Réinitialiser");
    fireEvent.click(reset);

    expect(screen.queryByText("Réinitialiser")).toBeNull();
    screen.getByText("Modification proposée");
    screen.getByText("Avis ajouté");
  });

  it("no result after filtering shows the dedicated empty state with a reset CTA", async () => {
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    renderHistory();
    await screen.findByText("1 photo ajoutée");

    fireEvent.change(screen.getByLabelText("Tous types"), { target: { value: "review" } });
    fireEvent.change(screen.getByLabelText("Toutes les villes"), { target: { value: "Millau" } });

    await screen.findByText("Aucune contribution ne correspond à ces filtres.");
    fireEvent.click(screen.getByText("Réinitialiser les filtres"));
    await screen.findByText("Avis ajouté");
  });
});

describe("ContributionsHistory — search", () => {
  it("searches by park name", async () => {
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    renderHistory();
    await screen.findByText("1 photo ajoutée");

    fireEvent.change(screen.getByPlaceholderText("Rechercher un parc, une ville…"), { target: { value: "Aumières" } });
    screen.getByText("Avis ajouté");
    expect(screen.queryByText("1 photo ajoutée")).toBeNull();
  });

  it("searches by city, accent- and case-insensitively, without issuing a new request", async () => {
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    renderHistory();
    await screen.findByText("1 photo ajoutée");

    fireEvent.change(screen.getByPlaceholderText("Rechercher un parc, une ville…"), { target: { value: "riviere-sur-tarn" } });
    screen.getByText("Avis ajouté");
    expect(screen.queryByText("1 photo ajoutée")).toBeNull();
    expect(listMyContributions).toHaveBeenCalledTimes(1);
  });
});

describe("ContributionsHistory — empty / loading / error", () => {
  it("shows a skeleton while loading, not the empty state", () => {
    listMyContributions.mockImplementation(() => new Promise(() => {}));
    const { container } = renderHistory();
    expect(container.querySelectorAll("[class*=skeletonRow]").length).toBeGreaterThan(0);
    expect(screen.queryByText("Vous n’avez encore rien contribué")).toBeNull();
  });

  it("shows the empty-history state when there is nothing at all", async () => {
    listMyContributions.mockResolvedValue([]);
    renderHistory();
    await screen.findByText("Vous n’avez encore rien contribué");
    screen.getByText("Explorer les parcs");
  });

  it("shows a retry action on error", async () => {
    listMyContributions.mockRejectedValue(new Error("boom"));
    renderHistory();
    await screen.findByText("Une erreur est survenue");
    listMyContributions.mockResolvedValue(ALL_ITEMS);
    fireEvent.click(screen.getByText("Réessayer"));
    await screen.findByText("1 photo ajoutée");
  });
});
