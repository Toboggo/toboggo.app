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

// `geo.hasFix/lat/lng` control what the screen sees; `setLocation`/`setPermission`
// let tests assert the real geolocation flow is invoked (never auto-triggered).
const geo = vi.hoisted(() => ({
  lat: 45.764,
  lng: 4.8357,
  hasFix: false,
  setLocation: vi.fn(),
  setPermission: vi.fn(),
}));
// Mirrors the real store: granting a position actually flips `hasFix`, so
// tests can assert the "nearby" filter recalculates on its own afterwards.
geo.setLocation.mockImplementation((lat: number, lng: number) => {
  geo.lat = lat;
  geo.lng = lng;
  geo.hasFix = true;
});
const requestBrowserLocationMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/geo", () => {
  const useGeoFn = (sel?: (s: unknown) => unknown) => {
    const s = { lat: geo.lat, lng: geo.lng, hasFix: geo.hasFix };
    return sel ? sel(s) : s;
  };
  useGeoFn.getState = () => ({ setLocation: geo.setLocation, setPermission: geo.setPermission });
  return {
    useGeo: useGeoFn,
    requestBrowserLocation: requestBrowserLocationMock,
    DEFAULT_GEO_LABEL: "Autour de vous",
  };
});

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
  geo.lat = 45.764;
  geo.lng = 4.8357;
  geo.hasFix = false;
  geo.setLocation.mockClear();
  geo.setPermission.mockClear();
  requestBrowserLocationMock.mockReset();
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

// LOT 2 — filters, discover CTA, tips.
describe("Favorites — filters", () => {
  it("'Tous' is selected by default and shows the real count", async () => {
    sess.favorites = ["p1", "p2"];
    listParksByIdsMock.mockResolvedValue([park({ id: "p1" }), park({ id: "p2", name: "Parc Lumière" })]);
    renderFavorites();
    await screen.findByText("Parc de la Mairie");
    const allChip = screen.getByRole("button", { name: "Tous (2)" });
    expect(allChip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "À proximité" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("filters to nearby favorites using the real position and the map's default radius, without changing the 'Tous' count", async () => {
    geo.hasFix = true;
    sess.favorites = ["p1", "p2"];
    listParksByIdsMock.mockResolvedValue([
      park({ id: "p1", name: "Parc proche", lat: geo.lat, lng: geo.lng }),
      park({ id: "p2", name: "Parc lointain", lat: 48.8566, lng: 2.3522 }), // Paris — well beyond 2 km
    ]);
    renderFavorites();
    await screen.findByText("Parc proche");
    expect(screen.getByRole("button", { name: "Tous (2)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "À proximité" }));
    expect(screen.getByText("Parc proche")).toBeTruthy();
    expect(screen.queryByText("Parc lointain")).toBeNull();
    // The total-favorites count is unaffected by which filter is active.
    expect(screen.getByRole("button", { name: "Tous (2)" })).toBeTruthy();
  });

  it("without a position, 'À proximité' asks to turn on location rather than claiming no match", async () => {
    sess.favorites = ["p1"];
    listParksByIdsMock.mockResolvedValue([park({ name: "Parc Voltaire" })]);
    renderFavorites();
    await screen.findByText("Parc Voltaire");
    fireEvent.click(screen.getByRole("button", { name: "À proximité" }));
    expect(await screen.findByText("Activez votre localisation")).toBeTruthy();
    expect(screen.getByText("Autorisez la localisation pour voir vos favoris situés à moins de 2 km.")).toBeTruthy();
    expect(screen.queryByText("Aucun favori ne correspond à ce filtre.")).toBeNull();
    expect(screen.queryByText("Parc Voltaire")).toBeNull();
    // "Tous" stays visible and obviously reachable from this state.
    expect(screen.getByRole("button", { name: "Tous (1)" })).toBeTruthy();
  });

  it("after granting location from that state, the nearby filter recalculates automatically", async () => {
    sess.favorites = ["p1", "p2"];
    listParksByIdsMock.mockResolvedValue([
      park({ id: "p1", name: "Parc proche", lat: 45.764, lng: 4.8357 }),
      park({ id: "p2", name: "Parc lointain", lat: 48.8566, lng: 2.3522 }),
    ]);
    requestBrowserLocationMock.mockResolvedValue({ lat: 45.764, lng: 4.8357 });
    renderFavorites();
    await screen.findByText("Parc proche");
    fireEvent.click(screen.getByRole("button", { name: "À proximité" }));
    await screen.findByText("Activez votre localisation");

    fireEvent.click(screen.getByRole("button", { name: "Activer la localisation" }));

    await waitFor(() => expect(screen.queryByText("Activez votre localisation")).toBeNull());
    expect(screen.getByText("Parc proche")).toBeTruthy();
    expect(screen.queryByText("Parc lointain")).toBeNull();
  });

  it("once a real position is known, a filter with no real match falls back to the generic 'no match' state", async () => {
    geo.hasFix = true;
    sess.favorites = ["p1"];
    listParksByIdsMock.mockResolvedValue([park({ name: "Parc lointain", lat: 48.8566, lng: 2.3522 })]);
    renderFavorites();
    await screen.findByText("Parc lointain");
    fireEvent.click(screen.getByRole("button", { name: "À proximité" }));
    expect(await screen.findByText("Aucun favori ne correspond à ce filtre.")).toBeTruthy();
    expect(screen.queryByText("Activez votre localisation")).toBeNull();
  });

  it("resets to 'Tous' from the empty-filter state", async () => {
    geo.hasFix = true;
    sess.favorites = ["p1"];
    listParksByIdsMock.mockResolvedValue([park({ name: "Parc lointain", lat: 48.8566, lng: 2.3522 })]);
    renderFavorites();
    await screen.findByText("Parc lointain");
    fireEvent.click(screen.getByRole("button", { name: "À proximité" }));
    await screen.findByText("Aucun favori ne correspond à ce filtre.");
    fireEvent.click(screen.getByText("Voir tous mes favoris"));
    expect(await screen.findByText("Parc lointain")).toBeTruthy();
  });

  it("never issues a new network call when switching filters (client-side only)", async () => {
    sess.favorites = ["p1"];
    listParksByIdsMock.mockResolvedValue([park({ name: "Parc Voltaire" })]);
    renderFavorites();
    await screen.findByText("Parc Voltaire");
    expect(listParksByIdsMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "À proximité" }));
    fireEvent.click(screen.getByRole("button", { name: "Tous (1)" }));
    expect(listParksByIdsMock).toHaveBeenCalledTimes(1);
  });

  it("Comparer still works while a filter is active (no regression)", async () => {
    geo.hasFix = true;
    sess.favorites = ["p1", "p2"];
    listParksByIdsMock.mockResolvedValue([
      park({ id: "p1", name: "Parc Voltaire", lat: geo.lat, lng: geo.lng }),
      park({ id: "p2", name: "Parc Lumière", lat: geo.lat, lng: geo.lng }),
    ]);
    renderFavorites();
    await screen.findByText("Parc Voltaire");
    fireEvent.click(screen.getByRole("button", { name: "À proximité" }));
    fireEvent.click(screen.getByText("Comparer"));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByText("Comparer (2)"));
    const compareScreen = await screen.findByTestId("compare-screen");
    expect(within(compareScreen).getByText("p1,p2")).toBeTruthy();
  });
});

describe("Favorites — discover CTA & tips", () => {
  it("shows the discover block after the list and navigates to Explorer", async () => {
    sess.favorites = ["p1"];
    listParksByIdsMock.mockResolvedValue([park({ name: "Parc Voltaire" })]);
    renderFavorites();
    await screen.findByText("Parc Voltaire");
    expect(screen.getByText("Envie de nouveaux parcs ?")).toBeTruthy();
    const discoverCta = screen.getAllByText("Explorer").find((el) => !el.closest("nav"));
    fireEvent.click(discoverCta!);
    expect(await screen.findByTestId("map-screen")).toBeTruthy();
  });

  it("does not duplicate the discover block on the global empty state", async () => {
    sess.favorites = [];
    listParksByIdsMock.mockResolvedValue([]);
    renderFavorites();
    await screen.findByText("Aucun parc favori pour le moment.");
    expect(screen.queryByText("Envie de nouveaux parcs ?")).toBeNull();
  });

  it("offers 'Activer la localisation' only when no position is known, and triggers the real flow (never automatically)", async () => {
    sess.favorites = ["p1"];
    listParksByIdsMock.mockResolvedValue([park({ name: "Parc Voltaire" })]);
    requestBrowserLocationMock.mockResolvedValue({ lat: 1, lng: 2 });
    renderFavorites();
    await screen.findByText("Parc Voltaire");
    expect(requestBrowserLocationMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Activer la localisation"));
    await waitFor(() => expect(requestBrowserLocationMock).toHaveBeenCalledTimes(1));
    expect(geo.setLocation).toHaveBeenCalledWith(1, 2, "Autour de vous");
  });

  it("hides the location tip once a position is already known", async () => {
    geo.hasFix = true;
    sess.favorites = ["p1"];
    listParksByIdsMock.mockResolvedValue([park({ name: "Parc Voltaire", lat: geo.lat, lng: geo.lng })]);
    renderFavorites();
    await screen.findByText("Parc Voltaire");
    expect(screen.queryByText("Activer la localisation")).toBeNull();
    expect(screen.getByText("Écrire un avis")).toBeTruthy();
  });

  it("the review tip navigates to the rating flow", async () => {
    sess.favorites = ["p1"];
    listParksByIdsMock.mockResolvedValue([park({ name: "Parc Voltaire" })]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/favorites"]}>
          <Routes>
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/rate" element={<div data-testid="rate-screen" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByText("Écrire un avis"));
    expect(await screen.findByTestId("rate-screen")).toBeTruthy();
  });
});
