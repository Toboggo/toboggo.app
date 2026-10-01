import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialogProvider, ToastProvider } from "@toboggo/design-system";
import { getPark, getParkHistory, listOrgParkIds, listParkEdits, listReportsForPark, listSources } from "@toboggo/shared";
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
    listOrgParkIds: vi.fn().mockResolvedValue(["p1"]),
    listReportsForPark: vi.fn().mockResolvedValue([]),
    listParkEdits: vi.fn().mockResolvedValue([]),
    listSources: vi.fn().mockResolvedValue([]),
    listMedia: vi.fn().mockResolvedValue([]),
    listExternalIds: vi.fn().mockResolvedValue([]),
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
  };
});

const perms = vi.hoisted(() => ({ canEditPark: true, canResolveReport: true, isAdmin: false }));
vi.mock("../lib/permissions", () => ({
  usePermissions: () => ({ canEditPark: perms.canEditPark, canResolveReport: perms.canResolveReport }),
}));
vi.mock("../lib/orgScope", () => ({
  useOrgScope: () => ({ isAdmin: perms.isAdmin, communeId: perms.isAdmin ? undefined : "org-1" }),
}));
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

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <MemoryRouter initialEntries={["/parks/p1?status=pending&page=2"]}>
            <Routes>
              <Route path="/parks/:id" element={<ParkDetail />} />
              <Route path="/parks" element={<div>ÉCRAN LISTE</div>} />
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
    perms.canResolveReport = true;
    perms.isAdmin = false;
    vi.mocked(listOrgParkIds).mockReset().mockResolvedValue(["p1"]);
    vi.mocked(listReportsForPark).mockReset().mockResolvedValue([]);
    vi.mocked(listParkEdits).mockReset().mockResolvedValue([]);
    vi.mocked(listSources).mockReset().mockResolvedValue([]);
    vi.mocked(getPark).mockReset().mockResolvedValue(makePark() as never);
    vi.mocked(getParkHistory).mockReset().mockResolvedValue([]);
  });

  it("loads the park and shows its identity + the three tabs", async () => {
    renderDetail();
    expect(await screen.findByRole("heading", { name: "Parc des Sources" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Sections du parc" })).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Informations",
      "Caractéristiques",
      "Photos",
      "Historique",
    ]);
    // real, present secondary info — never invented (header + Informations dd)
    expect(screen.getAllByText("1 rue du Test, 12100 Millau").length).toBeGreaterThanOrEqual(1);
    // an "unverified" park shows NO verification badge in the header (no bare "—")
    expect(screen.queryByText("—")).toBeNull();
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
    // description + ages are null on the fixture
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
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
    unmount();

    perms.canEditPark = true;
    renderDetail();
    await screen.findByRole("heading", { name: "Parc des Sources" });
    expect(screen.getByRole("button", { name: "Modifier" })).toBeTruthy();
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

  describe("collectivité scope & overview (COLL-03C)", () => {
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

    it("treats a park outside the organisation like an unknown id — without even loading it", async () => {
      vi.mocked(listOrgParkIds).mockReset().mockResolvedValue(["autre-parc"]);
      renderDetail();
      expect(await screen.findByText("Parc introuvable")).toBeTruthy();
      expect(screen.getByText(/n'existe pas ou n'est pas accessible/i)).toBeTruthy();
      expect(getPark).not.toHaveBeenCalled();
      expect(screen.queryByRole("tablist")).toBeNull();
    });

    it("does not apply the organisation guard to the admin, and hides the overview", async () => {
      perms.isAdmin = true;
      vi.mocked(listOrgParkIds).mockReset().mockResolvedValue([]);
      renderDetail();
      expect(await screen.findByRole("heading", { name: "Parc des Sources" })).toBeTruthy();
      expect(listOrgParkIds).not.toHaveBeenCalled();
      expect(screen.queryByText("État du parc")).toBeNull();
      expect(screen.queryByText("Signalements")).toBeNull();
      expect(listReportsForPark).not.toHaveBeenCalled();
    });

    it("lists the missing information, and routes each to the right tab", async () => {
      renderDetail(); // fixture: address only → 4 missing
      expect(await screen.findByText("État du parc")).toBeTruthy();
      expect(screen.getByText("1/5 renseignées")).toBeTruthy();
      const todo = screen.getAllByRole("button", { name: "À compléter" });
      expect(todo).toHaveLength(4);
      fireEvent.click(todo[todo.length - 2]); // Photo
      expect((await screen.findByRole("tab", { name: "Photos", selected: true })) != null).toBe(true);
    });

    it("shows missing items as plain text (no action) without edit permission", async () => {
      perms.canEditPark = false;
      renderDetail();
      await screen.findByText("État du parc");
      expect(screen.queryByRole("button", { name: "À compléter" })).toBeNull();
      expect(screen.getAllByText("À compléter")).toHaveLength(4);
    });

    it("flags pending edit proposals and the verification state", async () => {
      vi.mocked(listParkEdits).mockReset().mockResolvedValue([
        { id: "e1", park_id: "p1", status: "pending", created_at: "2026-02-01T09:00:00Z" },
        { id: "e2", park_id: "p1", status: "pending", created_at: "2026-02-02T09:00:00Z" },
      ] as never);
      vi.mocked(getPark).mockReset().mockResolvedValue(makePark({ verification_status: "organization_verified" }) as never);
      renderDetail();
      expect(await screen.findByText("modifications proposées")).toBeTruthy();
      expect(screen.getAllByText(/Vérifié par la collectivité/).length).toBeGreaterThanOrEqual(1);
      expect(vi.mocked(listParkEdits).mock.calls[0][0]).toEqual({ parkId: "p1", status: ["pending"] });
    });

    it("shows the provenance of the data, or 'Non renseignée'", async () => {
      vi.mocked(listSources).mockReset().mockResolvedValue([
        { id: "s1", park_id: "p1", source_type: "osm", source_name: "OpenStreetMap", license: "ODbL" },
      ] as never);
      renderDetail();
      expect(await screen.findByText("OpenStreetMap · ODbL")).toBeTruthy();
    });

    it("shows a compact empty state when the park has no report", async () => {
      renderDetail();
      expect(await screen.findByText("Aucun signalement sur ce parc.")).toBeTruthy();
    });

    it("lists linked reports, open ones first, with their status", async () => {
      vi.mocked(listReportsForPark).mockReset().mockResolvedValue([
        { id: "r1", park_id: "p1", category: "cleanliness", severity: "low", status: "resolved", created_at: "2026-02-03T10:00:00Z" },
        { id: "r2", park_id: "p1", category: "broken_equipment", severity: "high", status: "open", created_at: "2026-02-02T10:00:00Z" },
      ] as never);
      renderDetail();
      const rows = await screen.findAllByRole("button", { name: /Jeu cassé|Propreté/ });
      expect(rows[0].textContent).toContain("Jeu cassé / dangereux");
      expect(rows[0].textContent).toContain("Ouvert");
      expect(rows[1].textContent).toContain("Résolu");
    });

    it("keeps the list context in the way back (filters, page)", async () => {
      renderDetail();
      await screen.findByRole("heading", { name: "Parc des Sources" });
      const back = screen.getByRole("link", { name: "Mes parcs" }) as HTMLAnchorElement;
      expect(back.getAttribute("href")).toBe("/parks?status=pending&page=2");
    });
  });
});
