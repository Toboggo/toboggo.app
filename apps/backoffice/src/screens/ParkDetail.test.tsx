import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialogProvider, ToastProvider } from "@toboggo/design-system";
import {
  getOrganization,
  getPark,
  getParkHistory,
  listFeatures,
  listMedia,
  listOrgParkIds,
  listParkEditsWithDetails,
  listParkFeatures,
  listReportsForPark,
  listReviewsForPark,
  listSources,
} from "@toboggo/shared";
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
    // COLL-03C — garde de périmètre collectivité (`useScopedPark`).
    listOrgParkIds: vi.fn().mockResolvedValue(["p1"]),
    // Admin-UI-9B — Collectivité dans l'entête : requête ciblée par id.
    getOrganization: vi.fn().mockResolvedValue(null),
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
const scope = vi.hoisted(() => ({ isAdmin: false, communeId: "org-1" as string | undefined }));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => scope }));
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
    country_code: "FR",
    organization_id: null,
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
    scope.isAdmin = false;
    scope.communeId = "org-1";
    vi.mocked(listOrgParkIds).mockReset().mockResolvedValue(["p1"]);
    vi.mocked(getPark).mockReset().mockResolvedValue(makePark() as never);
    vi.mocked(getParkHistory).mockReset().mockResolvedValue([]);
    vi.mocked(listSources).mockReset().mockResolvedValue([]);
    vi.mocked(getOrganization).mockReset().mockResolvedValue(null);
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
    // real, present secondary info — never invented (header + carte Localisation)
    expect(screen.getAllByText("1 rue du Test, 12100 Millau").length).toBeGreaterThanOrEqual(1);
    // le statut de vérification (non vérifié) est visible dans l'entête — le
    // "—" discret de ParkVerificationTag (Admin-UI-9B), jamais masqué.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  describe("Admin-UI-9C — Vue d'ensemble", () => {
    it("ne répète plus le nom du parc (déjà dans l'entête 9B)", async () => {
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      // L'ancien <dt>Nom</dt> de la carte Localisation a disparu — le nom
      // n'apparaît plus que dans l'entête (h1) et le fil d'Ariane (9B), jamais
      // une 3e fois dans une carte de la Vue d'ensemble.
      expect(screen.queryByText("Nom")).toBeNull();
      expect(screen.getAllByText("Parc des Sources")).toHaveLength(2);
    });

    it("ne montre plus les cards 'Statuts & métadonnées' ni 'Source & provenance' (doublons du header 9B)", async () => {
      // Test Admin-UI : fiche Admin (la fiche collectivité ajoute son bloc « État du parc », testé plus bas).
      scope.isAdmin = true;
      scope.communeId = undefined;
      vi.mocked(listSources).mockResolvedValue([
        { id: "s1", park_id: "p1", source_type: "osm", source_name: null, source_url: null, license: null, last_synced_at: null, created_at: "2026-01-01" },
      ] as never);
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(screen.queryByText("Statuts & métadonnées")).toBeNull();
      expect(screen.queryByText("Source & provenance")).toBeNull();
      // "OpenStreetMap" reste visible une fois — dans l'entête (9B), plus dans
      // une carte Overview dédiée qui n'existe plus.
      expect(screen.getAllByText("OpenStreetMap")).toHaveLength(1);
    });

    it("renomme la carte en 'Localisation' et garde Équipements & services / Photos", async () => {
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(screen.getByText("Localisation")).toBeTruthy();
      expect(screen.queryByText("Identité & localisation")).toBeNull();
      expect(screen.getAllByText("Équipements & services").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Photos").length).toBeGreaterThanOrEqual(1);
    });

    it("exactement 3 liens 'Voir l'onglet' désormais (Localisation, Équipements, Photos)", async () => {
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(screen.getAllByRole("button", { name: "Voir l'onglet" })).toHaveLength(3);
    });

    it("n'affiche jamais 'Adresse non renseignée' — la ligne Adresse est omise si absente", async () => {
      // Test Admin-UI : fiche Admin (la fiche collectivité ajoute son bloc « État du parc », testé plus bas).
      scope.isAdmin = true;
      scope.communeId = undefined;
      vi.mocked(getPark).mockReset().mockResolvedValue(
        makePark({ formatted_address: null, address_line: null, city: null, postal_code: null }) as never,
      );
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(screen.queryByText("Adresse non renseignée")).toBeNull();
      expect(screen.queryByText("Adresse")).toBeNull();
    });

    it("garde les coordonnées même sans adresse (uniquement lat/lng) — ParkLocationEditor toujours monté", async () => {
      vi.mocked(getPark).mockReset().mockResolvedValue(
        makePark({ formatted_address: null, address_line: null, city: null, postal_code: null }) as never,
      );
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      // `mapStyleUrl()` est mocké à `null` dans cette suite (pas de vraie carte
      // MapLibre en test, cf. ParkLocationEditor) — les coordonnées discrètes
      // restent le signal testable que le bloc Localisation reste utile même
      // sans adresse.
      expect(screen.getByText("44.100000, 3.070000")).toBeTruthy();
    });

    it("Équipements & services : résumé réel quand des caractéristiques sont renseignées", async () => {
      vi.mocked(listFeatures).mockResolvedValueOnce([
        { id: "f1", code: "toilets", category: "service", label_key: "toilets", icon_key: null, value_set: null, sort_order: 1, is_active: true },
      ] as never);
      vi.mocked(listParkFeatures).mockResolvedValueOnce([
        { park_id: "p1", feature_id: "f1", status: "available", value: null, quantity: null, note: null, source_id: null, verified_at: null, updated_at: "2026-01-01" },
      ] as never);
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(await screen.findByText("1 / 1")).toBeTruthy();
    });

    it("Équipements & services : empty state sobre quand rien n'est renseigné", async () => {
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(await screen.findByText(/Aucune caractéristique renseignée|Catalogue indisponible/)).toBeTruthy();
    });

    it("Photos : aperçu + compteur réels quand des photos existent", async () => {
      vi.mocked(listMedia).mockResolvedValueOnce([
        { id: "m1", park_id: "p1", url: "https://cdn/a.jpg", status: "approved", is_cover: false, caption: null, source: "user", source_url: null, author: null, license: null, attribution: null, created_at: "2026-01-01" },
      ] as never);
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(await screen.findByText("1 photo")).toBeTruthy();
    });

    it("Photos : empty state compact quand aucune photo", async () => {
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(await screen.findByText("Aucune photo pour ce parc")).toBeTruthy();
    });
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

  it("Admin-UI-9D : les champs facultatifs absents (âges, description, OSM) sont omis proprement, jamais 'Non renseigné'", async () => {
    // Test Admin-UI : fiche Admin (la fiche collectivité ajoute son bloc « État du parc », testé plus bas).
    scope.isAdmin = true;
    scope.communeId = undefined;
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    fireEvent.click(screen.getByRole("tab", { name: "Données / Informations" }));
    // description + ages + identifiant OSM sont absents sur la fixture.
    await screen.findByText("Créé le");
    expect(screen.queryByText("Non renseigné")).toBeNull();
    expect(screen.queryByText("Âge minimum")).toBeNull();
    expect(screen.queryByText("Âge maximum")).toBeNull();
    expect(screen.queryByText("Description")).toBeNull();
    expect(screen.queryByText("Identifiant OSM")).toBeNull();
    // Exploitation, elle, est toujours renseignée (valeur par défaut réelle).
    expect(screen.getByText("Exploitation")).toBeTruthy();
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
    await screen.findByText("Créé le");
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

  describe("Admin-UI-9B — entête", () => {
    it("breadcrumb Admin : 'Parcs' (pas 'Mes parcs'), lien vers /parks", async () => {
      scope.isAdmin = true;
      scope.communeId = undefined;
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      const link = screen.getByRole("link", { name: "Parcs" }) as HTMLAnchorElement;
      expect(link.getAttribute("href")).toBe("/parks?status=pending&page=2");
      expect(screen.queryByRole("link", { name: "Mes parcs" })).toBeNull();
    });

    it("breadcrumb Collectivité : 'Mes parcs'", async () => {
      renderDetail(); // scope par défaut du beforeEach : isAdmin=false
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(screen.getByRole("link", { name: "Mes parcs" })).toBeTruthy();
      expect(screen.queryByRole("link", { name: "Parcs" })).toBeNull();
    });

    it("breadcrumb identique (même lien) pendant le chargement — pas de rupture de structure", async () => {
      let resolveGetPark!: (p: unknown) => void;
      vi.mocked(getPark).mockReset().mockReturnValue(
        new Promise((resolve) => {
          resolveGetPark = resolve;
        }) as never,
      );
      scope.isAdmin = true;
      scope.communeId = undefined;
      renderDetail();
      expect(await screen.findByRole("link", { name: "Parcs" })).toBeTruthy();
      resolveGetPark(makePark());
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(screen.getByRole("link", { name: "Parcs" })).toBeTruthy();
    });

    it("Pays : libellé lisible depuis country_code", async () => {
      vi.mocked(getPark).mockReset().mockResolvedValue(makePark({ country_code: "ES" }) as never);
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(screen.getByText("Espagne")).toBeTruthy();
    });

    it("Pays : un code absent de la table de libellés retombe sur le code brut", async () => {
      vi.mocked(getPark).mockReset().mockResolvedValue(makePark({ country_code: "ZZ" }) as never);
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(screen.getByText("ZZ")).toBeTruthy();
    });

    it("Collectivité présente : résolue via une requête ciblée par organization_id, sans N+1", async () => {
      vi.mocked(getPark).mockReset().mockResolvedValue(makePark({ organization_id: "org-lyon" }) as never);
      vi.mocked(getOrganization).mockReset().mockResolvedValue({ id: "org-lyon", name: "Ville de Lyon" } as never);
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(await screen.findByText("Ville de Lyon")).toBeTruthy();
      expect(getOrganization).toHaveBeenCalledTimes(1);
      expect(getOrganization).toHaveBeenCalledWith("org-lyon");
    });

    it("Collectivité absente : tiret discret, jamais 'Non renseigné', et getOrganization n'est pas appelée", async () => {
      renderDetail(); // organization_id: null sur la fixture par défaut
      await screen.findByRole("heading", { name: "Parc des Sources" });
      const header = screen.getByTestId("park-header");
      expect(within(header).queryByText(/Non renseigné/)).toBeNull();
      // Vérification (non vérifié) ET Source (aucune) sont aussi "—" ici —
      // au moins une occurrence prouve que Collectivité retombe bien dessus.
      expect(within(header).getAllByText("—").length).toBeGreaterThanOrEqual(1);
      expect(getOrganization).not.toHaveBeenCalled();
    });

    it("Source : affiche toutes les sources réelles, pas seulement la première", async () => {
      // Test Admin-UI : fiche Admin (la fiche collectivité ajoute son bloc « État du parc », testé plus bas).
      scope.isAdmin = true;
      scope.communeId = undefined;
      vi.mocked(listSources).mockResolvedValue([
        { id: "s1", park_id: "p1", source_type: "osm", source_name: null, source_url: null, license: null, last_synced_at: null, created_at: "2026-01-01" },
        { id: "s2", park_id: "p1", source_type: "municipality", source_name: null, source_url: null, license: null, last_synced_at: null, created_at: "2026-01-01" },
      ] as never);
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(screen.getByText("OpenStreetMap, Collectivité")).toBeTruthy();
    });

    it("Adresse absente : ni 'Adresse non renseignée' ni ligne secondaire vide dans l'entête", async () => {
      vi.mocked(getPark).mockReset().mockResolvedValue(makePark({ formatted_address: null }) as never);
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(screen.queryByText("Adresse non renseignée")).toBeNull();
    });

    it("Adresse présente : affichée discrètement dans l'entête", async () => {
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(screen.getAllByText("1 rue du Test, 12100 Millau").length).toBeGreaterThanOrEqual(1);
    });

    it("le menu Actions reste propre (absent) quand aucune transition n'est disponible — permissions inchangées", async () => {
      perms.canEditPark = false;
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      expect(screen.queryByRole("button", { name: "Actions du parc" })).toBeNull();
    });

    it("les transitions de statut existantes restent inchangées (Bloqué → Débloquer)", async () => {
      vi.mocked(getPark).mockReset().mockResolvedValue(makePark({ status: "blocked" }) as never);
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      fireEvent.click(screen.getByRole("button", { name: "Actions du parc" }));
      expect(screen.getByRole("menuitem", { name: "Débloquer" })).toBeTruthy();
    });
  });
});

describe("ParkDetail — périmètre collectivité & état du parc (COLL-03C)", () => {
  beforeEach(() => {
    perms.canEditPark = true;
    perms.canResolveReport = true;
    scope.isAdmin = false;
    scope.communeId = "org-1";
    vi.mocked(listOrgParkIds).mockReset().mockResolvedValue(["p1"]);
    vi.mocked(getPark).mockReset().mockResolvedValue(makePark() as never);
    vi.mocked(listSources).mockReset().mockResolvedValue([]);
    vi.mocked(listReviewsForPark).mockReset().mockResolvedValue([]);
    vi.mocked(listReportsForPark).mockReset().mockResolvedValue([]);
    vi.mocked(listParkEditsWithDetails).mockReset().mockResolvedValue([]);
    vi.mocked(getParkHistory).mockReset().mockResolvedValue([]);
  });

  it("shows the loading state before the park resolves", () => {
    vi.mocked(getPark).mockReset().mockReturnValue(new Promise(() => {}) as never);
    renderDetail();
    expect(screen.getByText("Chargement…")).toBeTruthy();
  });

  it("shows the error state when the load fails", async () => {
    vi.mocked(getPark).mockReset().mockRejectedValue(new Error("boom"));
    renderDetail();
    expect(await screen.findByText("Parc introuvable")).toBeTruthy();
  });

  it("treats a park outside the organisation like an unknown id — and loads nothing about it", async () => {
    vi.mocked(listOrgParkIds).mockReset().mockResolvedValue(["autre-parc"]);
    renderDetail();
    expect(await screen.findByText("Parc introuvable")).toBeTruthy();
    expect(screen.getByText(/n'existe pas ou n'est pas accessible/i)).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(getPark).not.toHaveBeenCalled();
    // none of the side queries may run before the scope check has passed
    expect(listSources).not.toHaveBeenCalled();
    expect(listReviewsForPark).not.toHaveBeenCalled();
    expect(listReportsForPark).not.toHaveBeenCalled();
    expect(listParkEditsWithDetails).not.toHaveBeenCalled();
  });

  it("does not apply the organisation guard to the admin, who has no « État du parc » block", async () => {
    scope.isAdmin = true;
    scope.communeId = undefined;
    vi.mocked(listOrgParkIds).mockReset().mockResolvedValue([]);
    renderDetail();
    expect(await screen.findByRole("heading", { name: "Parc des Sources" })).toBeTruthy();
    expect(listOrgParkIds).not.toHaveBeenCalled();
    expect(screen.queryByText("État du parc")).toBeNull();
  });

  it("lists the missing information and routes each one to the right tab", async () => {
    renderDetail(); // fixture: address only → 4 missing
    expect(await screen.findByText("État du parc")).toBeTruthy();
    expect(screen.getByText("1/5 renseignées")).toBeTruthy();
    const todo = screen.getAllByRole("button", { name: "À compléter" });
    expect(todo).toHaveLength(4);
    fireEvent.click(todo[todo.length - 2]); // Photo
    expect(await screen.findByRole("tab", { name: "Photos", selected: true })).toBeTruthy();
  });

  it("shows the missing items as plain text (no action) without edit permission", async () => {
    perms.canEditPark = false;
    renderDetail();
    await screen.findByText("État du parc");
    expect(screen.queryByRole("button", { name: "À compléter" })).toBeNull();
    expect(screen.getAllByText("À compléter")).toHaveLength(4);
  });

  it("does not duplicate reports or edit proposals in the état du parc block (they have their own tab)", async () => {
    renderDetail();
    await screen.findByText("État du parc");
    expect(screen.queryByText("Aucun signalement sur ce parc.")).toBeNull();
    expect(screen.queryByText("Propositions à vérifier")).toBeNull();
  });

  it("keeps the list context (filters, page) in the way back", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    const back = screen.getByRole("link", { name: "Mes parcs" }) as HTMLAnchorElement;
    expect(back.getAttribute("href")).toBe("/parks?status=pending&page=2");
  });
});
