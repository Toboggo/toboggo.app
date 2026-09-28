import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Park } from "@toboggo/shared";
import "../../i18n/testInit";
import Favorites from "./Favorites";

function park(extra: Partial<Park> = {}): Park {
  return {
    id: "p1",
    name: "Parc de la Mairie",
    city: null,
    photos: [],
    rating: 0,
    review_count: 0,
    age_min: null,
    age_max: null,
    fenced: null,
    shade: null,
    wc: null,
    pmr: null,
    ...extra,
  } as Park;
}

const listParksByIdsMock = vi.hoisted(() => vi.fn());
vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, listParksByIds: listParksByIdsMock };
});

const sess = vi.hoisted(() => ({ favorites: [] as string[], toggleFavorite: vi.fn() }));
vi.mock("../../lib/session", () => ({
  useSession: (sel?: (s: unknown) => unknown) => {
    const s = { profile: { favorites: sess.favorites }, toggleFavorite: sess.toggleFavorite };
    return sel ? sel(s) : s;
  },
}));

function CompareStub() {
  const [params] = useSearchParams();
  return <div data-testid="compare-screen">{params.get("ids")}</div>;
}

function renderFavorites() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/favorites"]}>
        <Routes>
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/compare" element={<CompareStub />} />
          <Route path="/map" element={<div data-testid="map-screen" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sess.favorites = [];
  sess.toggleFavorite.mockClear();
  listParksByIdsMock.mockReset();
});

describe("Favorites — states", () => {
  it("shows a loading skeleton while the query is pending", async () => {
    sess.favorites = ["p1"];
    let resolve!: (v: Park[]) => void;
    listParksByIdsMock.mockReturnValue(new Promise<Park[]>((r) => (resolve = r)));
    const { container } = renderFavorites();
    expect(container.querySelectorAll('[class*="_skeletonRow_"]').length).toBeGreaterThan(0);
    resolve([park()]);
    await waitFor(() => expect(container.querySelector('[class*="_skeletonRow_"]')).toBeNull());
  });

  it("shows an error state with a retry action when the fetch fails", async () => {
    sess.favorites = ["p1"];
    listParksByIdsMock.mockRejectedValue(new Error("network"));
    renderFavorites();
    expect(await screen.findByText("Une erreur est survenue")).toBeTruthy();
    listParksByIdsMock.mockResolvedValue([park()]);
    fireEvent.click(screen.getByText("Réessayer"));
    expect(await screen.findByText("Parc de la Mairie")).toBeTruthy();
  });

  it("shows a real empty state with a CTA to Explorer when there are no favorites", async () => {
    sess.favorites = [];
    listParksByIdsMock.mockResolvedValue([]);
    renderFavorites();
    expect(await screen.findByText("Aucun parc favori pour le moment.")).toBeTruthy();
    // "Explorer" also labels the (unrelated) BottomTabs nav entry — scope to the CTA outside <nav>.
    const cta = screen.getAllByText("Explorer").find((el) => !el.closest("nav"));
    fireEvent.click(cta!);
    expect(await screen.findByTestId("map-screen")).toBeTruthy();
  });

  it("renders a single favorite", async () => {
    sess.favorites = ["p1"];
    listParksByIdsMock.mockResolvedValue([park({ name: "Parc Voltaire" })]);
    renderFavorites();
    expect(await screen.findByText("Parc Voltaire")).toBeTruthy();
    expect(screen.getByText("1 parc enregistré")).toBeTruthy();
  });

  it("renders several favorites and pluralizes the header count", async () => {
    sess.favorites = ["p1", "p2"];
    listParksByIdsMock.mockResolvedValue([park({ id: "p1", name: "Parc Voltaire" }), park({ id: "p2", name: "Parc Lumière" })]);
    renderFavorites();
    expect(await screen.findByText("Parc Voltaire")).toBeTruthy();
    expect(screen.getByText("Parc Lumière")).toBeTruthy();
    expect(screen.getByText("2 parcs enregistrés")).toBeTruthy();
  });

  it("keeps long park names intact (untruncated in the DOM, only visually clamped)", async () => {
    const longName = "Aire de jeux du Quai Sully-Chaliès et du jardin des Plantes de Millau";
    sess.favorites = ["p1"];
    listParksByIdsMock.mockResolvedValue([park({ name: longName })]);
    renderFavorites();
    expect(await screen.findByText(longName)).toBeTruthy();
  });
});

describe("Favorites — preserved behaviors", () => {
  it("removing a favorite calls the existing toggleFavorite action", async () => {
    sess.favorites = ["p1"];
    listParksByIdsMock.mockResolvedValue([park({ name: "Parc Voltaire" })]);
    renderFavorites();
    await screen.findByText("Parc Voltaire");
    fireEvent.click(screen.getByRole("button", { name: "Retirer des favoris" }));
    expect(sess.toggleFavorite).toHaveBeenCalledWith("p1");
  });

  it("clicking a card navigates to the park's detail page", async () => {
    sess.favorites = ["p1"];
    listParksByIdsMock.mockResolvedValue([park({ name: "Parc Voltaire" })]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/favorites"]}>
          <Routes>
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/park/:id" element={<div data-testid="park-detail" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByText("Parc Voltaire"));
    expect(await screen.findByTestId("park-detail")).toBeTruthy();
  });

  it("Comparer lets selecting 2+ favorites and navigates to /compare with their ids", async () => {
    sess.favorites = ["p1", "p2", "p3"];
    listParksByIdsMock.mockResolvedValue([
      park({ id: "p1", name: "Parc Voltaire" }),
      park({ id: "p2", name: "Parc Lumière" }),
      park({ id: "p3", name: "Parc Sully" }),
    ]);
    renderFavorites();
    await screen.findByText("Parc Voltaire");

    fireEvent.click(screen.getByText("Comparer"));
    expect(screen.getByText("Annuler")).toBeTruthy();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    fireEvent.click(screen.getByText("Comparer (2)"));
    const compareScreen = await screen.findByTestId("compare-screen");
    expect(within(compareScreen).getByText("p1,p2")).toBeTruthy();
  });
});
