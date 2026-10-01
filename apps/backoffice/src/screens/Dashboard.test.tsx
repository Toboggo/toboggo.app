import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  listParks,
  listReports,
  listReviews,
  listActivity,
  listPendingMedia,
  listMaintenance,
  listPendingParkEditsForOrg,
  listParkEdits,
  getParkSourceDistribution,
  getParkStatusCounts,
  getParkCountryDistribution,
  listCommunes,
  listAllUsers,
  listOrganizationsWithCounts,
  downloadCsv,
} from "@toboggo/shared";
import Dashboard from "./Dashboard";

// ── MapLibre : même mock léger que ParkLocationEditor.test.tsx, sans WebGL
// ni réseau — Admin-UI-7D-D §1. ────────────────────────────────────────────
vi.mock("maplibre-gl", () => {
  class FakeMap {
    constructor() {
      instances.maps.push(this);
    }
    remove() {}
  }
  class FakeMarker {
    lngLat: [number, number] = [0, 0];
    element: HTMLElement | undefined;
    constructor(opts?: { element?: HTMLElement }) {
      this.element = opts?.element;
      instances.markers.push(this);
    }
    setLngLat(v: [number, number]) {
      this.lngLat = v;
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  const instances: { maps: FakeMap[]; markers: FakeMarker[] } = { maps: [], markers: [] };
  return { __esModule: true, default: { Map: FakeMap, Marker: FakeMarker }, __instances: instances };
});
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listParks: vi.fn(),
    listReports: vi.fn(),
    listReviews: vi.fn(),
    listActivity: vi.fn(),
    listPendingMedia: vi.fn(),
    listMaintenance: vi.fn(),
    listPendingParkEditsForOrg: vi.fn(),
    listParkEdits: vi.fn(),
    getParkSourceDistribution: vi.fn(),
    getParkStatusCounts: vi.fn(),
    getParkCountryDistribution: vi.fn(),
    listCommunes: vi.fn(),
    listAllUsers: vi.fn(),
    listOrganizationsWithCounts: vi.fn(),
    downloadCsv: vi.fn(),
    // Admin-UI-7D-D §1 : URL de style factice pour exercer réellement le
    // rendu de GeoCoverageMap (marker(s)) plutôt que son seul état
    // "indisponible" dans les tests.
    mapStyleUrl: vi.fn(() => "https://example.test/style.json"),
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mapInstances(): Promise<{ maps: any[]; markers: any[] }> {
  return (await import("maplibre-gl") as unknown as { __instances: { maps: unknown[]; markers: unknown[] } })
    .__instances as never;
}

const scope = vi.hoisted(() => ({ isAdmin: true, communeId: undefined as string | undefined }));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: scope.isAdmin, communeId: scope.communeId }) }));

function LocationProbe() {
  const loc = useLocation();
  return (
    <div data-testid="loc">
      {loc.pathname}
      {loc.search}
    </div>
  );
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <LocationProbe />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          {/* Cible de navigation seulement — Dashboard se démonte une fois qu'on la quitte. */}
          <Route path="*" element={<div>autre écran</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PARK = (status: "published" | "pending" | "blocked") => ({ id: `p-${status}-${Math.random()}`, status });

describe("Dashboard — Admin-UI-2", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Le mock maplibre-gl garde ses instances au niveau module (Admin-UI-7D-D
    // §1) — à vider entre chaque test, sinon les markers d'un test précédent
    // fausseraient le compte/la recherche par aria-label du test suivant.
    const { maps, markers } = await mapInstances();
    maps.length = 0;
    markers.length = 0;
    scope.isAdmin = true;
    scope.communeId = undefined;
    vi.mocked(listParks).mockResolvedValue([PARK("published"), PARK("published"), PARK("pending")] as never);
    vi.mocked(listReports).mockResolvedValue([{ id: "r1", status: "open" }] as never);
    vi.mocked(listReviews).mockResolvedValue([{ id: "rv1", stars: 5 }] as never);
    vi.mocked(listActivity).mockResolvedValue([]);
    vi.mocked(listPendingMedia).mockResolvedValue([]);
    vi.mocked(listMaintenance).mockResolvedValue([]);
    vi.mocked(listPendingParkEditsForOrg).mockResolvedValue([]);
    vi.mocked(listParkEdits).mockResolvedValue([{ id: "e1", status: "pending" }] as never);
    vi.mocked(getParkSourceDistribution).mockResolvedValue([{ source_type: "osm", count: 3 }]);
    // Admin-UI-7D-C : l'Admin ne dérive plus published/pending de listParks()
    // (voir Dashboard.tsx) — mêmes valeurs que l'ancien tableau `PARK(...)`
    // ci-dessus (2 published, 1 pending), mais via le comptage exact réel.
    vi.mocked(getParkStatusCounts).mockResolvedValue({ published: 2, pending: 1 });
    vi.mocked(getParkCountryDistribution).mockResolvedValue([]);
    vi.mocked(listCommunes).mockResolvedValue([{ id: "org-1" }, { id: "org-2" }, { id: "org-3" }, { id: "org-4" }, { id: "org-5" }] as never);
    vi.mocked(listAllUsers).mockResolvedValue([{ id: "u1" }, { id: "u2" }, { id: "u3" }, { id: "u4" }] as never);
    vi.mocked(listOrganizationsWithCounts).mockResolvedValue([]);
  });

  it("affiche les KPI admin, cliquables vers les écrans réels", async () => {
    renderDashboard();
    // Libellés propres au KPI (formulation différente de « À traiter », donc
    // sans ambiguïté) — "Parcs en attente" (KPI) ≠ "Parcs en attente de
    // validation" (À traiter), correspondance exacte par défaut de RTL.
    expect(await screen.findByText("Parcs actifs")).toBeTruthy();
    expect(screen.getByText("Parcs en attente")).toBeTruthy();
    expect(screen.getByText("Avis publiés")).toBeTruthy();

    fireEvent.click(screen.getByText("Avis publiés").closest("button")!);
    expect(screen.getByTestId("loc").textContent).toBe("/reviews");
  });

  it("Admin-UI-7E-B : les 7 KPI admin ont chacun un vrai pictogramme (plus aucun cercle vide) — Photos et Collectivités inclus", async () => {
    renderDashboard();
    await screen.findByText("Parcs actifs");
    const labels = [
      "Parcs actifs",
      "Parcs en attente",
      "Signalements ouverts",
      "Avis publiés",
      "Photos en attente",
      "Collectivités",
      "Utilisateurs",
    ];
    for (const label of labels) {
      // Certains libellés existent aussi dans « À traiter » — le premier
      // match du DOM est toujours la tuile KPI (rendue avant cette section).
      const btn = screen.getAllByText(label)[0].closest("button")!;
      expect(btn.querySelector("svg")).toBeTruthy();
    }
  });

  it("Admin-UI-7D-C — régression >1000 parcs : « Parcs actifs »/« Parcs en attente » reflètent le vrai total exact, jamais plafonnés à 1000 par un tableau tronqué", async () => {
    // Catalogue réel simulé : 2201 parcs (comme en local au moment de
    // l'audit), très au-delà de max_rows (1000) — getParkStatusCounts vient
    // d'un count exact serveur, jamais d'un `listParks().filter().length`.
    vi.mocked(getParkStatusCounts).mockResolvedValue({ published: 2189, pending: 12 });
    renderDashboard();

    expect(await screen.findByText("2189")).toBeTruthy();
    // "12" apparaît aussi dans le badge « À traiter » (même compteur réel,
    // jamais un 2e calcul) — on vérifie la valeur precisely dans la tuile KPI.
    expect(screen.getByText("Parcs en attente").closest("button")!.textContent).toContain("12");
    // listParks n'est même pas appelée côté Admin : rien à plafonner.
    expect(listParks).not.toHaveBeenCalled();
  });

  it("Admin-UI-7D-C : « Couverture géographique » affiche la répartition réelle par pays et lie vers /parks filtré, avec status=all", async () => {
    vi.mocked(getParkCountryDistribution).mockResolvedValue([
      { country_code: "FR", count: 1700 },
      { country_code: "ES", count: 800 },
    ]);
    renderDashboard();

    await screen.findByText("Couverture géographique");
    expect(await screen.findByText("France")).toBeTruthy();
    expect(screen.getByText("Espagne")).toBeTruthy();
    expect(screen.getByText("1700 · 68%")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Voir les parcs de Espagne/ }));
    expect(screen.getByTestId("loc").textContent).toBe("/parks?country=ES&status=all");
  });

  it("Admin-UI-7D-D §1 : « Couverture géographique » instancie une vraie carte MapLibre avec un marker agrégé par pays (jamais par parc), cliquable vers /parks filtré", async () => {
    vi.mocked(getParkCountryDistribution).mockResolvedValue([
      { country_code: "FR", count: 1700 },
      { country_code: "ES", count: 800 },
    ]);
    renderDashboard();
    await screen.findByText("Couverture géographique");
    await screen.findByText("France");

    const { maps, markers } = await mapInstances();
    expect(maps).toHaveLength(1);
    // 1 marker par pays présent dans les données (2), jamais un par parc (2500).
    expect(markers).toHaveLength(2);

    const esMarkerEl = markers.find((m) => m.element?.getAttribute("aria-label")?.includes("Espagne"))!.element!;
    fireEvent.click(esMarkerEl);
    expect(screen.getByTestId("loc").textContent).toBe("/parks?country=ES&status=all");
  });

  it("Admin-UI-7D-C : un pays inconnu du dictionnaire de libellés s'affiche quand même, avec son code brut — jamais masqué", async () => {
    // "PL" (Pologne) — délibérément absent de COUNTRY_LABEL/COUNTRY_CENTROID
    // (Dashboard.tsx), pour vérifier le fallback sur le code brut plutôt
    // qu'un libellé inventé, et l'absence de marker fabriqué sans centroïde
    // connu (Admin-UI-7D-D §1).
    vi.mocked(getParkCountryDistribution).mockResolvedValue([{ country_code: "PL", count: 5 }]);
    renderDashboard();

    await screen.findByText("Couverture géographique");
    expect(await screen.findByText("PL")).toBeTruthy();
    const { markers } = await mapInstances();
    expect(markers).toHaveLength(0);
  });

  it("Admin-UI-7D-C : « Couverture géographique » affiche un état vide honnête plutôt qu'une carte inventée quand le catalogue est vide", async () => {
    vi.mocked(getParkCountryDistribution).mockResolvedValue([]);
    renderDashboard();

    await screen.findByText("Couverture géographique");
    expect(await screen.findByText("Aucun pays enregistré pour le moment.")).toBeTruthy();
    const { maps } = await mapInstances();
    expect(maps).toHaveLength(0);
  });

  it("Admin-UI-7D-C : « Répartition des parcs par source » régression >1000 — la légende reflète un vrai count exact par source, pas un tableau tronqué à 1000", async () => {
    vi.mocked(getParkSourceDistribution).mockResolvedValue([
      { source_type: "osm", count: 2201 },
    ]);
    renderDashboard();

    expect(await screen.findByText("2201 · 100%")).toBeTruthy();
  });

  it("« À traiter » inclut désormais les photos en attente et navigue directement vers /validation (plus de 'écran à venir')", async () => {
    vi.mocked(listPendingMedia).mockResolvedValue([{ id: "m1" }] as never);
    renderDashboard();

    const editsRow = await screen.findByText("Modifications à valider");
    expect(screen.queryByText("Écran dédié à venir")).toBeNull();
    // "Photos en attente" existe à la fois dans le KPI et dans « À traiter » —
    // les deux doivent être présents (pas une ambiguïté à lever, une réalité
    // à vérifier).
    expect(screen.getAllByText("Photos en attente")).toHaveLength(2);

    fireEvent.click(editsRow.closest("button")!);
    expect(screen.getByTestId("loc").textContent).toBe("/validation");
  });

  it("« À traiter » (Admin-UI-2B) : les 4 catégories admin restent toujours visibles, même à 0", async () => {
    vi.mocked(listParkEdits).mockResolvedValue([]);
    renderDashboard();
    expect(await screen.findByText("Parcs en attente de validation")).toBeTruthy();
    // "Modifications à valider" reste affichée (catégorie utile) même à 0 —
    // ce n'est plus filtré, juste rendu en discret.
    const editsRow = screen.getByText("Modifications à valider").closest("button, div")!;
    expect(editsRow.textContent).toContain("0");
  });

  it("« À traiter » : un compteur à 0 n'affiche plus le gros état vide générique", async () => {
    vi.mocked(listParks).mockResolvedValue([PARK("published")] as never);
    vi.mocked(listReports).mockResolvedValue([]);
    vi.mocked(listParkEdits).mockResolvedValue([]);
    renderDashboard();
    await screen.findByText("Parcs en attente de validation");
    expect(screen.queryByText("Rien ne nécessite votre attention pour le moment.")).toBeNull();
    // Les 4 catégories admin sont toutes là (KPI + À traiter partagent le
    // libellé "Signalements ouverts" — 2 occurrences attendues).
    expect(screen.getAllByText("Signalements ouverts")).toHaveLength(2);
    expect(screen.getByText("Modifications à valider")).toBeTruthy();
  });

  it("donut : affiche le total réel, la légende, et gère le cas mono-source", async () => {
    renderDashboard();
    expect(await screen.findByText("OpenStreetMap")).toBeTruthy();
    expect(screen.getByText("3 · 100%")).toBeTruthy();
    // Le total réel (3 parcs) apparaît au centre du donut.
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("donut : état d'erreur avec un Réessayer dédié, distinct du reste de la page", async () => {
    vi.mocked(getParkSourceDistribution).mockRejectedValue(new Error("boom"));
    renderDashboard();
    await screen.findByText("Répartition des parcs par source");
    expect(await screen.findByText("Impossible de charger ces données.")).toBeTruthy();
  });

  it("Admin-UI-7D-B : la légende du donut navigue vers /parks filtré sur la source, avec status=all (le défaut admin de /parks est status=pending, qui masquerait le catalogue entier représenté par le donut)", async () => {
    renderDashboard();
    const link = await screen.findByRole("button", { name: /Voir les parcs source OpenStreetMap/ });
    fireEvent.click(link);
    expect(screen.getByTestId("loc").textContent).toBe("/parks?source=osm&status=all");
  });

  it("Admin-UI-7D-B : « Voir tous les parcs » navigue vers /parks avec status=all", async () => {
    renderDashboard();
    await screen.findByText("OpenStreetMap");
    fireEvent.click(screen.getByRole("button", { name: "Voir tous les parcs ›" }));
    expect(screen.getByTestId("loc").textContent).toBe("/parks?status=all");
  });

  it("Admin-UI-7D-B : « Évolution de l'activité » remplace « Activité récente » côté Admin, avec un sélecteur de période qui ne change aucun KPI", async () => {
    renderDashboard();
    expect(await screen.findByText("Évolution de l'activité")).toBeTruthy();
    // "2" (published) doit être chargé avant qu'on capture l'état de référence.
    await waitFor(() => expect(screen.getByText("Parcs actifs").closest("button")!.textContent).toContain("2"));
    const before = screen.getByText("Parcs actifs").closest("button")!.textContent;

    fireEvent.click(screen.getByRole("tab", { name: "30 j" }));
    // Le changement de période ne doit rien re-fetcher ni changer un seul KPI
    // (rebucketing 100% client des séries déjà chargées) — vérifié sur la
    // requête que l'Admin utilise réellement pour ce KPI (Admin-UI-7D-C),
    // `listParks` n'étant même plus appelée du tout côté Admin.
    expect(listParks).not.toHaveBeenCalled();
    expect(getParkStatusCounts).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Parcs actifs").closest("button")!.textContent).toBe(before);
  });

  it("actions rapides : ouvre les écrans réels uniquement (parcs, signalements, validation, photos)", async () => {
    renderDashboard();
    fireEvent.click(await screen.findByText("Ouvrir la file de validation"));
    expect(screen.getByTestId("loc").textContent).toBe("/validation");
  });

  it("vue Collectivité : conserve le comportement existant (pas de donut ni d'actions rapides admin)", async () => {
    scope.isAdmin = false;
    scope.communeId = "org-1";
    renderDashboard();
    await screen.findByText("Publiés");
    expect(screen.queryByText("Répartition des parcs par source")).toBeNull();
    expect(screen.queryByText("Actions rapides")).toBeNull();
    expect(getParkSourceDistribution).not.toHaveBeenCalled();
  });

  it("Admin-UI-4 : KPI Collectivités/Utilisateurs réels, cliquables, sans le mot « actives »", async () => {
    renderDashboard();
    expect(await screen.findByText("Collectivités")).toBeTruthy();
    expect(await screen.findByText("5")).toBeTruthy();
    expect(screen.getByText("Utilisateurs")).toBeTruthy();
    expect(await screen.findByText("4")).toBeTruthy();
    expect(screen.queryByText(/actives?/i)).toBeNull();
    expect(screen.queryByText(/utilisateurs actifs/i)).toBeNull();

    fireEvent.click(screen.getByText("Collectivités").closest("button")!);
    expect(screen.getByTestId("loc").textContent).toBe("/organizations");
  });

  it("Admin-UI-4 : le KPI Collectivités/Utilisateurs n'existe pas côté Collectivité", async () => {
    scope.isAdmin = false;
    scope.communeId = "org-1";
    renderDashboard();
    await screen.findByText("Publiés");
    expect(screen.queryByText("Collectivités")).toBeNull();
    expect(screen.queryByText("Utilisateurs")).toBeNull();
    expect(listCommunes).not.toHaveBeenCalled();
    expect(listAllUsers).not.toHaveBeenCalled();
  });

  it("Admin-UI-7D : « Top collectivités » classe par vrai parkCount (listOrganizationsWithCounts, RLS publique — pas activity_log) et lie vers /organizations/:id", async () => {
    vi.mocked(listOrganizationsWithCounts).mockResolvedValue([
      { id: "org-1", name: "Lyon", parkCount: 2 } as never,
      { id: "org-2", name: "Paris", parkCount: 9 } as never,
      { id: "org-3", name: "Nice", parkCount: 0 } as never,
    ]);
    renderDashboard();
    await screen.findByText("Paris");
    // Trié par parkCount décroissant : Paris (9) avant Lyon (2) avant Nice (0).
    const rows = screen.getAllByText(/^\d+ parcs?$/).map((el) => el.closest("button")?.textContent ?? "");
    expect(rows[0]).toContain("Paris");
    expect(rows[0]).toContain("9 parcs");
    expect(rows[1]).toContain("Lyon");

    fireEvent.click(screen.getByText("Paris").closest("button")!);
    expect(screen.getByTestId("loc").textContent).toBe("/organizations/org-2");
  });

  it("Admin-UI-7D : « Top collectivités » affiche un état vide honnête plutôt qu'un classement inventé quand il n'y a aucune collectivité", async () => {
    vi.mocked(listOrganizationsWithCounts).mockResolvedValue([]);
    renderDashboard();
    await screen.findByText("Top collectivités");
    expect(await screen.findByText("Aucune collectivité enregistrée pour le moment.")).toBeTruthy();
  });

  it("Admin-UI-4 : « Signalements ouverts » signale les critiques/hautes sévérités sans dupliquer un bloc « Alertes » (KPI + À traiter, même donnée réelle)", async () => {
    vi.mocked(listReports).mockResolvedValue([
      { id: "r1", status: "open", severity: "critical" },
      { id: "r2", status: "open", severity: "low" },
    ] as never);
    renderDashboard();
    // Admin-UI-7D : le hint réel apparaît maintenant aussi sur le KPI (StatCard),
    // en plus de la ligne « À traiter » — même compteur, jamais un 2e calcul.
    expect(await screen.findAllByText(/dont 1 critique\/haute sévérité/)).toHaveLength(2);
    expect(screen.queryByText("Alertes opérationnelles")).toBeNull();
  });

  it("Admin-UI-4 : export du dashboard réutilise toCsv/downloadCsv avec les compteurs réels", async () => {
    renderDashboard();
    // Le bouton reste désactivé tant qu'un seul KPI charge encore.
    await waitFor(() => expect((screen.getByRole("button", { name: "Exporter" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, csv] = vi.mocked(downloadCsv).mock.calls[0];
    expect(filename).toBe("toboggo-dashboard.csv");
    expect(csv).toContain("Collectivités");
    expect(csv).toContain("Utilisateurs");
  });
});
