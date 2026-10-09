import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listActiveReports, respondToReport, reverseGeocode, searchPlaces, type ActiveReport, type Park } from "@toboggo/shared";
import "../../i18n/testInit";
import ParkDetail from "./ParkDetail";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    incrementParkViews: vi.fn().mockResolvedValue(undefined),
    reverseGeocode: vi.fn(),
    searchPlaces: vi.fn(),
    listActiveReports: vi.fn(),
    respondToReport: vi.fn(),
  };
});

const sess = vi.hoisted(() => ({ userId: "u1" as string | null, favorites: [] as string[], requireAccount: vi.fn() }));
vi.mock("../../lib/session", () => ({
  requireAccount: sess.requireAccount,
  useSession: (sel?: (s: unknown) => unknown) => {
    const s = { userId: sess.userId, profile: { favorites: sess.favorites }, toggleFavorite: vi.fn() };
    return sel ? sel(s) : s;
  },
}));

const toasts = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock("../../lib/toast", () => ({
  useToastStore: (sel?: (s: unknown) => unknown) => {
    const s = { show: (m: string) => toasts.list.push(m) };
    return sel ? sel(s) : s;
  },
}));

const visits = vi.hoisted(() => ({ calls: [] as Array<[string, string]> }));
vi.mock("../../lib/visitPrompt", () => ({
  useVisitPrompt: (sel?: (s: unknown) => unknown) => {
    const s = { schedule: (parkId: string, parkName: string) => visits.calls.push([parkId, parkName]) };
    return sel ? sel(s) : s;
  },
}));

const PARK: Park = {
  id: "p1",
  name: "Square Voltaire",
  slug: null,
  description: null,
  latitude: 45.764,
  longitude: 4.8357,
  lat: 45.764,
  lng: 4.8357,
  boundary: null,
  country_code: "FR",
  timezone: "Europe/Paris",
  address_line: null,
  postal_code: null,
  city: null,
  admin_area_1: null,
  admin_area_2: null,
  min_age: null,
  max_age: null,
  ages_derived: false,
  moderation_status: "published",
  operational_status: "active",
  status_reason: null,
  status_from: null,
  status_until: null,
  verification_status: "unverified",
  created_by: null,
  rating: 0,
  review_count: 0,
  has_open_report: false,
  views: 0,
  created_at: "",
  updated_at: "",
  last_verified_at: null,
  features: {},
  cover_photo: null,
  photos: [],
  translated_names: [],
  score: null,
  has_score: false,
  age_min: null,
  age_max: null,
  status: "published",
  formatted_address: "1 rue de la Paix, 69000 Lyon",
  commune_id: null,
  organization_id: null,
  surface: "non_precise",
  play_equipment: [],
  wc: null,
  shade: null,
  fenced: null,
  pmr: null,
  benches: null,
  water: null,
  parking: null,
};

const activePark = vi.hoisted(() => ({ current: null as Park | null }));
vi.mock("../../lib/parksQuery", () => ({
  usePark: () => ({ data: activePark.current, isLoading: false }),
  useParkReviews: () => ({ data: [] }),
}));

function renderDetail(overrides: Partial<Park> = {}) {
  activePark.current = { ...PARK, ...overrides };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/park/p1"]}>
        <Routes>
          <Route path="/park/:id" element={<ParkDetail />} />
          <Route path="/park/:id/directions" element={<div>ANCIEN ÉCRAN FACTICE</div>} />
          <Route path="/park/:id/photos" element={<div>GALERIE</div>} />
          <Route path="/photo-add" element={<div>AJOUT PHOTO</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ParkDetail — Itinéraire CTA", () => {
  // `Location.assign` is spec-"unforgeable" (own, non-configurable) in jsdom —
  // `vi.spyOn` can't touch it, so the whole `window.location` is swapped for a
  // plain mock object instead.
  let originalLocation: Location;

  beforeEach(() => {
    toasts.list = [];
    visits.calls = [];
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  it("valid coordinates: opens the app picker, navigates only once a provider is chosen, no internal navigation to /directions", () => {
    renderDetail();
    fireEvent.click(screen.getByText("Itinéraire"));

    expect(screen.getByText("Choisir l’itinéraire")).toBeTruthy();
    expect(window.location.assign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Waze"));

    expect(window.location.assign).toHaveBeenCalledTimes(1);
    const [url] = (window.location.assign as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/^https:\/\/waze\.com\/ul\?/);
    expect(screen.queryByText("ANCIEN ÉCRAN FACTICE")).toBeNull();
    expect(visits.calls).toEqual([["p1", "Square Voltaire"]]);
  });

  it("Annuler: closes the sheet, navigates nowhere, no visit prompt", () => {
    renderDetail();
    fireEvent.click(screen.getByText("Itinéraire"));
    fireEvent.click(screen.getByText("Annuler"));

    expect(window.location.assign).not.toHaveBeenCalled();
    expect(visits.calls).toEqual([]);
    expect(screen.queryByText("Choisir l’itinéraire")).toBeNull();
  });

  it("missing coordinates: shows a toast, sheet never opens, navigates nowhere, does not crash", () => {
    renderDetail({ latitude: null as unknown as number, longitude: null as unknown as number });
    expect(() => fireEvent.click(screen.getByText("Itinéraire"))).not.toThrow();

    expect(screen.queryByText("Choisir l’itinéraire")).toBeNull();
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(toasts.list).toEqual(["Itinéraire indisponible : coordonnées du parc manquantes."]);
  });
});

describe("ParkDetail — adresse persistée", () => {
  it("affiche l'adresse enregistrée telle quelle, sans aucun géocodage (reverse ni recherche) ni appel réseau", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderDetail({ formatted_address: "12 Rue de la Capelle, 12100 Millau" });

    expect(screen.getByText("12 Rue de la Capelle, 12100 Millau")).toBeTruthy();
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(searchPlaces).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("ParkDetail — photos (swipe)", () => {
  // jsdom n'implémente pas PointerEvent : sans lui, clientX/clientY seraient perdus.
  beforeEach(() => {
    vi.stubGlobal("PointerEvent", class extends MouseEvent {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const photos = { photos: ["a.jpg", "b.jpg", "c.jpg"] };
  const hero = () => screen.getByRole("button", { name: "Ouvrir la galerie de photos" });
  const swipe = (dx: number, dy = 0) => {
    fireEvent.pointerDown(hero(), { clientX: 200, clientY: 100 });
    fireEvent.pointerUp(hero(), { clientX: 200 + dx, clientY: 100 + dy });
    fireEvent.click(hero());
  };

  it("un swipe horizontal change de photo sans ouvrir la galerie", () => {
    renderDetail(photos);
    expect(screen.getByText("1/3")).toBeTruthy();
    swipe(-80);
    expect(screen.getByText("2/3")).toBeTruthy();
    swipe(80);
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.queryByText("GALERIE")).toBeNull();
  });

  it("un geste surtout vertical ou trop court ne change pas de photo", () => {
    renderDetail(photos);
    fireEvent.pointerDown(hero(), { clientX: 200, clientY: 100 });
    fireEvent.pointerUp(hero(), { clientX: 150, clientY: 220 });
    fireEvent.pointerDown(hero(), { clientX: 200, clientY: 100 });
    fireEvent.pointerUp(hero(), { clientX: 180, clientY: 100 });
    expect(screen.getByText("1/3")).toBeTruthy();
  });

  it("un tap ouvre la galerie", () => {
    renderDetail(photos);
    fireEvent.click(hero());
    expect(screen.getByText("GALERIE")).toBeTruthy();
  });
});

describe("ParkDetail — jeux et signalements", () => {
  it("n'affiche que les jeux présents dans les données, avec les libellés du référentiel", () => {
    renderDetail({
      play_equipment: ["toboggan", "springs"],
      features: {
        slide: { status: "available", value: null, quantity: null, category: "play", verified_at: null },
        zipline: { status: "unavailable", value: null, quantity: null, category: "play", verified_at: null },
      },
    });
    expect(screen.getByText("Toboggan")).toBeTruthy();
    expect(screen.getByText("Jeux à ressort")).toBeTruthy();
    expect(screen.queryByText("Tyrolienne")).toBeNull();
  });

  it("sans signalement actif : aucune mention « aucun problème », « Signaler un problème » reste accessible", () => {
    renderDetail();
    expect(screen.queryByText(/Aucun problème/)).toBeNull();
    expect(screen.queryByText("Un problème a été signalé sur ce parc récemment.")).toBeNull();
    expect(screen.getByText("Signaler un problème")).toBeTruthy();
  });

  it("signalement signalé mais détail indisponible : repli sur l'ancienne alerte", async () => {
    vi.mocked(listActiveReports).mockResolvedValue([]);
    renderDetail({ has_open_report: true });
    expect(await screen.findByText("Un problème a été signalé sur ce parc récemment.")).toBeTruthy();
    expect(screen.getByText("Signaler un problème")).toBeTruthy();
  });
});

function activeReport(over: Partial<ActiveReport> = {}): ActiveReport {
  return {
    id: "r1",
    category: "broken_equipment",
    description: "Toboggan fissuré",
    equipment_label: null,
    status: "open",
    created_at: "2026-10-01T10:00:00Z",
    still_present_count: 2,
    resolved_count: 1,
    my_response: null,
    ...over,
  };
}

describe("ParkDetail — bannière compacte et réponse dans le sheet", () => {
  beforeEach(() => {
    sess.userId = "u1";
    sess.requireAccount.mockReset();
    vi.mocked(respondToReport).mockReset().mockResolvedValue(undefined);
    vi.mocked(listActiveReports).mockReset();
    toasts.list = [];
  });

  /** Serveur simulé : la réponse enregistrée est relue au rechargement. */
  function statefulServer(initial: ActiveReport[]) {
    const rows = initial.map((r) => ({ ...r }));
    vi.mocked(listActiveReports).mockImplementation(async () => rows.map((r) => ({ ...r })));
    vi.mocked(respondToReport).mockImplementation(async (id, response) => {
      const row = rows.find((r) => r.id === id)!;
      row.my_response = response;
    });
  }

  async function openSheet() {
    fireEvent.click(await screen.findByText("Signalement en cours"));
    return screen.findByRole("button", { name: "Toujours présent" });
  }

  it("bannière compacte : plus d'encart, de boutons ni de lien « Signaler un problème » sur la fiche", async () => {
    vi.mocked(listActiveReports).mockResolvedValue([activeReport()]);
    renderDetail({ has_open_report: true });
    expect(await screen.findByText("Signalement en cours")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Toujours présent" })).toBeNull();
    expect(screen.queryByText("Vous êtes sur place ?")).toBeNull();
    expect(screen.queryByText("Signaler un problème")).toBeNull();
  });

  it("répondre depuis le sheet : enregistré, puis « Votre réponse » dans la bannière ; réponse modifiable", async () => {
    statefulServer([activeReport()]);
    renderDetail({ has_open_report: true });
    fireEvent.click(await openSheet());
    await waitFor(() => expect(respondToReport).toHaveBeenLastCalledWith("r1", "still_present"));
    expect(await screen.findByText("Votre réponse : toujours présent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Problème résolu" }));
    await waitFor(() => expect(respondToReport).toHaveBeenLastCalledWith("r1", "resolved"));
    expect(await screen.findByText("Votre réponse : problème résolu")).toBeTruthy();
  });

  it("après rechargement : ma réponse serveur est affichée dans la bannière", async () => {
    vi.mocked(listActiveReports).mockResolvedValue([activeReport({ my_response: "resolved" })]);
    renderDetail({ has_open_report: true });
    expect(await screen.findByText("Votre réponse : problème résolu")).toBeTruthy();
  });

  it("plusieurs signalements : pluriel, résumé, la réponse cible celui qui est choisi", async () => {
    statefulServer([
      activeReport(),
      activeReport({ id: "r2", category: "cleanliness", description: "Verre brisé" }),
    ]);
    renderDetail({ has_open_report: true });
    fireEvent.click(await screen.findByText("Signalements en cours"));
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "r2" } });
    fireEvent.click(screen.getByRole("button", { name: "Problème résolu" }));
    await waitFor(() => expect(respondToReport).toHaveBeenCalledWith("r2", "resolved"));
    expect(await screen.findByText("Vous avez répondu à 1 sur 2 signalements")).toBeTruthy();
  });

  it("visiteur : connexion demandée au clic, aucune réponse envoyée avant", async () => {
    sess.userId = null;
    vi.mocked(listActiveReports).mockResolvedValue([activeReport()]);
    renderDetail({ has_open_report: true });
    fireEvent.click(await openSheet());
    expect(sess.requireAccount).toHaveBeenCalledTimes(1);
    expect(respondToReport).not.toHaveBeenCalled();
  });

  it("échec serveur : message d'erreur, pas de « Votre réponse »", async () => {
    vi.mocked(listActiveReports).mockResolvedValue([activeReport()]);
    vi.mocked(respondToReport).mockRejectedValue(new Error("boom"));
    renderDetail({ has_open_report: true });
    fireEvent.click(await openSheet());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/Votre réponse/)).toBeNull();
  });
});

describe("ParkDetail — allègement de la fiche", () => {
  beforeEach(() => {
    sess.userId = "u1";
    vi.mocked(listActiveReports).mockReset().mockResolvedValue([]);
  });

  it("plus de grande carte « Enrichir ce parc » ; ligne discrète « Modifier les infos du parc » ouvre le parcours existant", async () => {
    renderDetail();
    expect(screen.queryByText("Enrichir ce parc")).toBeNull();
    expect(screen.queryByText("Vous connaissez ce parc ?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Modifier les infos du parc/ }));
    expect(await screen.findByText("Enrichir ce parc")).toBeTruthy();
  });

  it("un seul cœur (header) ; « Itinéraire » reste le seul bouton du footer", () => {
    renderDetail();
    expect(screen.getAllByRole("button", { name: /favori/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Itinéraire/ })).toBeTruthy();
  });
});

describe("ParkDetail — couverture illustrée & encart première photo", () => {
  it("sans photo : illustration + encart ; « Ajouter une photo » ouvre le parcours existant", () => {
    renderDetail({ photos: [] });
    expect(screen.getByText("Ce parc attend sa première photo")).toBeTruthy();
    expect(screen.getByText("Aidez les familles à le découvrir")).toBeTruthy();
    expect(document.querySelector('img[data-cover="illustration"]')).toBeTruthy();
    const card = screen.getByTestId("first-photo-card");
    fireEvent.click(card.querySelector("button")!);
    expect(screen.getByText("AJOUT PHOTO")).toBeTruthy();
  });

  it("avec photo approuvée : pas d'encart ; photo en couverture", () => {
    renderDetail({ photos: ["https://x/a.jpg"] });
    expect(screen.queryByTestId("first-photo-card")).toBeNull();
    expect(document.querySelector('img[data-cover="illustration"]')).toBeNull();
  });

  it("photo qui échoue à charger : illustration de secours, mais PAS d'encart", () => {
    renderDetail({ photos: ["https://x/broken.jpg"] });
    fireEvent.error(document.querySelector('img[src="https://x/broken.jpg"]')!);
    expect(document.querySelector('img[data-cover="illustration"]')).toBeTruthy();
    expect(screen.queryByTestId("first-photo-card")).toBeNull();
  });
});
