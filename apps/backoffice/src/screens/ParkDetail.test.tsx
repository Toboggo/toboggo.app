import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialogProvider, ToastProvider } from "@toboggo/design-system";
import { getPark, getParkHistory, listParkEditsWithDetails, listReportsForPark, listReviewsForPark, listSources } from "@toboggo/shared";
import ParkDetail from "./ParkDetail";

// MapLibre (pulled in by InfoPanel → ParkLocationEditor) — never instantiated
// here (mapStyleUrl → null), but the module must resolve without WebGL.
vi.mock("maplibre-gl", () => ({
  __esModule: true,
  default: { Map: class {}, Marker: class {}, NavigationControl: class {} },
}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    mapStyleUrl: vi.fn(() => null),
    getPark: vi.fn(),
    getParkHistory: vi.fn().mockResolvedValue([]),
    listMedia: vi.fn().mockResolvedValue([]),
    listExternalIds: vi.fn().mockResolvedValue([]),
    listSources: vi.fn().mockResolvedValue([]),
    setParkStatus: vi.fn().mockResolvedValue(undefined),
    logActivity: vi.fn().mockResolvedValue(undefined),
    updatePark: vi.fn().mockResolvedValue(undefined),
    addParkPhotos: vi.fn().mockResolvedValue(undefined),
    deleteMediaByUrl: vi.fn().mockResolvedValue(undefined),
    setParkCover: vi.fn().mockResolvedValue(undefined),
    uploadPhoto: vi.fn().mockResolvedValue("https://x/y.jpg"),
    listFeatures: vi.fn().mockResolvedValue([]),
    listParkFeatures: vi.fn().mockResolvedValue([]),
    setParkFeature: vi.fn().mockResolvedValue(undefined),
    removeParkFeature: vi.fn().mockResolvedValue(undefined),
    listReviewsForPark: vi.fn().mockResolvedValue([]),
    deleteReview: vi.fn().mockResolvedValue(undefined),
    replyToReview: vi.fn().mockResolvedValue(undefined),
    listReportsForPark: vi.fn().mockResolvedValue([]),
    listParkEditsWithDetails: vi.fn().mockResolvedValue([]),
  };
});

const perms = vi.hoisted(() => ({
  canEditPark: true,
  canReplyToReview: false,
  canDeleteReview: false,
  canResolveReport: true,
}));
vi.mock("../lib/permissions", () => ({
  usePermissions: () => ({
    canEditPark: perms.canEditPark,
    canReplyToReview: perms.canReplyToReview,
    canDeleteReview: perms.canDeleteReview,
    canResolveReport: perms.canResolveReport,
  }),
}));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: false, communeId: "org-1" }) }));
vi.mock("../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = { userName: "Testeur", userId: "u1" };
    return sel ? sel(state) : state;
  },
}));

function makePark(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Parc des Sources",
    status: "published",
    verification_status: "unverified",
    operational_status: "active",
    cover_photo: null,
    formatted_address: "1 rue du Test, 12100 Millau",
    city: "Millau",
    latitude: 44.1,
    longitude: 3.07,
    min_age: null,
    max_age: null,
    description: null,
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-02-03T12:00:00Z",
    ...over,
  };
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <MemoryRouter initialEntries={["/parks/p1?status=pending&page=2"]}>
            <LocationProbe />
            <Routes>
              <Route path="/parks/:id" element={<ParkDetail />} />
              <Route path="/parks" element={<div>ÉCRAN LISTE</div>} />
              <Route path="/validation/:editId" element={<div>ÉCRAN VALIDATION</div>} />
            </Routes>
          </MemoryRouter>
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("ParkDetail — /parks/:id", () => {
  beforeEach(() => {
    perms.canEditPark = true;
    perms.canReplyToReview = false;
    perms.canDeleteReview = false;
    perms.canResolveReport = true;
    vi.mocked(getPark).mockReset().mockResolvedValue(makePark() as never);
    vi.mocked(getParkHistory).mockReset().mockResolvedValue([]);
    vi.mocked(listSources).mockReset().mockResolvedValue([]);
    vi.mocked(listReviewsForPark).mockReset().mockResolvedValue([]);
    vi.mocked(listReportsForPark).mockReset().mockResolvedValue([]);
    vi.mocked(listParkEditsWithDetails).mockReset().mockResolvedValue([]);
  });

  it("loads the park, shows its identity, and opens on Vue d'ensemble by default (Admin-UI-5C)", async () => {
    renderDetail();
    expect(await screen.findByRole("heading", { name: "Parc des Sources" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Sections du parc" })).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Vue d'ensemble",
      "Données / Informations",
      "Équipements & services",
      "Photos",
      "Avis",
      "Signalements",
      "Modifications proposées",
      "Historique",
    ]);
    expect(screen.getByRole("tab", { name: "Vue d'ensemble" }).getAttribute("aria-selected")).toBe("true");
    // real, present secondary info — never invented (header + carte de la Vue d'ensemble)
    expect(screen.getAllByText("1 rue du Test, 12100 Millau").length).toBeGreaterThanOrEqual(1);
    // le statut de vérification est désormais TOUJOURS visible (entête +
    // carte "Statuts & métadonnées" de la Vue d'ensemble), même "non vérifié"
    // (le "—" de ParkVerificationTag, jamais masqué).
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("Vue d'ensemble : synthèse dense avec les données réellement disponibles", async () => {
    vi.mocked(listSources).mockResolvedValue([
      { id: "s1", park_id: "p1", source_type: "osm", source_name: null, source_url: null, license: null, last_synced_at: null, created_at: "2026-01-01" },
    ] as never);
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    expect(screen.getByText("Identité & localisation")).toBeTruthy();
    expect(screen.getByText("Statuts & métadonnées")).toBeTruthy();
    expect(screen.getByText("Source & provenance")).toBeTruthy();
    expect(screen.getAllByText("Équipements & services").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("OpenStreetMap").length).toBeGreaterThanOrEqual(1);
  });

  it("Vue d'ensemble : inchangée par 5D — toujours exactement 4 liens 'Voir l'onglet', pas de nouveau bloc", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    // Identité, Statuts, Équipements, Photos renvoient vers un onglet ; Source
    // n'en a pas — inchangé depuis 5C, aucun bloc Avis/Signalements/
    // Modifications proposées ajouté à la Vue d'ensemble par ce lot.
    expect(screen.getAllByRole("button", { name: "Voir l'onglet" })).toHaveLength(4);
  });

  it("Avis : affiche les avis réels (note, auteur, date, statut, contenu) avec état vide propre", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    fireEvent.click(screen.getByRole("tab", { name: /^Avis/ }));
    expect(await screen.findByText("Aucun avis pour ce parc.")).toBeTruthy();

    vi.mocked(listReviewsForPark).mockResolvedValue([
      {
        id: "r1",
        park_id: "p1",
        author_name: "Camille",
        rating: 4,
        comment: "Très agréable, ombragé.",
        status: "published",
        reply: null,
        created_at: "2026-03-01T10:00:00Z",
      } as never,
    ]);
    fireEvent.click(screen.getByRole("tab", { name: /^Données/ }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /^Données/ }).getAttribute("aria-selected")).toBe("true"));
    fireEvent.click(screen.getByRole("tab", { name: /^Avis/ }));
    expect(await screen.findByText("Camille")).toBeTruthy();
    expect(screen.getByText("Très agréable, ombragé.")).toBeTruthy();
    // "Publié" apparaît aussi sur le tag de statut du parc dans l'entête —
    // au moins une occurrence suffit à prouver que le statut de l'avis est affiché.
    expect(screen.getAllByText("Publié").length).toBeGreaterThanOrEqual(1);
  });

  it("Signalements : affiche statut/sévérité/catégorie/date, ouvre le signalement au clic, compteur réel sur l'onglet", async () => {
    vi.mocked(listReportsForPark).mockResolvedValue([
      {
        id: "rep1",
        park_id: "p1",
        reported_by_name: "Alex",
        category: "broken_equipment",
        severity: "critical",
        status: "open",
        description: "Balançoire cassée",
        created_at: "2026-03-02T10:00:00Z",
      } as never,
    ]);
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    // compteur réel (1 signalement ouvert) sur le libellé de l'onglet
    expect(await screen.findByRole("tab", { name: /^Signalements/ })).toHaveProperty("textContent", "Signalements1");
    fireEvent.click(screen.getByRole("tab", { name: /^Signalements/ }));
    expect(await screen.findByText("Critique")).toBeTruthy();
    expect(screen.getByText("Ouvert")).toBeTruthy();
    fireEvent.click(screen.getByText("Critique"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("Modifications proposées : lecture synthétique, clic renvoie vers /validation/:editId, pas d'Accepter/Refuser ici", async () => {
    vi.mocked(listParkEditsWithDetails).mockResolvedValue([
      {
        id: "edit1",
        park_id: "p1",
        user_id: "u9",
        organization_id: null,
        changes: { items: [{ field: "ages", label: "Âges", current: null, proposed: { min: 2, max: 8 } }] },
        status: "pending",
        reviewed_by: null,
        review_note: null,
        created_at: "2026-03-03T10:00:00Z",
        reviewed_at: null,
        parks: { name: "Parc des Sources", formatted_address: null },
        proposedByName: "Jordan",
      } as never,
    ]);
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    fireEvent.click(screen.getByRole("tab", { name: /^Modifications proposées/ }));
    expect(await screen.findByText("Jordan")).toBeTruthy();
    expect(screen.getByText("Âges")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accepter" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refuser" })).toBeNull();

    fireEvent.click(screen.getByText("Jordan"));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/validation/edit1"));
  });

  it("Vue d'ensemble : les blocs renvoient vers l'onglet concerné", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    const links = screen.getAllByRole("button", { name: "Voir l'onglet" });
    fireEvent.click(links[0]); // Identité & localisation -> info
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Données / Informations" }).getAttribute("aria-selected")).toBe("true"),
    );
  });

  it("keeps status transitions behind the … actions menu (not a dominant button)", async () => {
    renderDetail(); // fixture is "published" -> only transition is "Bloquer"
    await screen.findByRole("heading", { name: "Parc des Sources" });
    expect(screen.queryByRole("button", { name: "Bloquer" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Actions du parc" }));
    expect(screen.getByRole("menuitem", { name: "Bloquer" })).toBeTruthy();
  });

  it("renders 'Non renseigné' for genuinely absent fields", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    fireEvent.click(screen.getByRole("tab", { name: "Données / Informations" }));
    // description + ages are null on the fixture
    expect(await screen.findByText("Non renseigné")).toBeTruthy();
    expect(screen.getAllByText("Non renseigné").length).toBeGreaterThanOrEqual(3);
  });

  it("shows a not-found state when the park cannot be loaded", async () => {
    vi.mocked(getPark).mockReset().mockRejectedValue(new Error("PGRST116"));
    renderDetail();
    expect(await screen.findByText(/n'existe pas ou n'est pas accessible/i)).toBeTruthy();
  });

  it("shows the Modifier button only with edit permission", async () => {
    perms.canEditPark = false;
    const { unmount } = renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    fireEvent.click(screen.getByRole("tab", { name: "Données / Informations" }));
    await screen.findByText("Nom");
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
    unmount();

    perms.canEditPark = true;
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    fireEvent.click(screen.getByRole("tab", { name: "Données / Informations" }));
    expect(await screen.findByRole("button", { name: "Modifier" })).toBeTruthy();
  });

  it("renders the cover photo when present, a sober placeholder otherwise", async () => {
    vi.mocked(getPark).mockReset().mockResolvedValue(makePark({ cover_photo: "https://cdn/x.jpg" }) as never);
    const { unmount } = renderDetail();
    const img = (await screen.findByRole("img", { name: /Photo de Parc des Sources/i })) as HTMLImageElement;
    expect(img.src).toBe("https://cdn/x.jpg");
    unmount();

    vi.mocked(getPark).mockReset().mockResolvedValue(makePark({ cover_photo: null }) as never);
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    expect(screen.getByText("Aucune photo")).toBeTruthy();
  });

  it("switches to Historique and shows its empty state", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    fireEvent.click(screen.getByRole("tab", { name: "Historique" }));
    expect(await screen.findByText(/Aucun évènement enregistré/i)).toBeTruthy();
  });

  it("shows history actions without gluing the non-informative source ('app') to the label", async () => {
    vi.mocked(getParkHistory).mockReset().mockResolvedValue([
      { id: "e1", park_id: "p1", actor: "app", action: "Modifié", note: null, created_at: "2026-02-01T09:00:00Z" },
      { id: "e2", park_id: "p1", actor: "b385e7b6-fe47-41d1-ae40-b3ff448529b6", action: "Créé", note: null, created_at: "2026-01-01T08:00:00Z" },
    ]);
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    fireEvent.click(screen.getByRole("tab", { name: "Historique" }));

    expect(await screen.findByText("Modifié")).toBeTruthy();
    expect(screen.getByText("Créé")).toBeTruthy();
    // the literal default source and a raw actor_id UUID are never rendered
    expect(screen.queryByText("app")).toBeNull();
    expect(screen.queryByText(/Modifiéapp/)).toBeNull();
    expect(screen.queryByText(/b385e7b6/)).toBeNull();
  });
});
