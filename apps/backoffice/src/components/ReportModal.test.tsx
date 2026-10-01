import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@toboggo/design-system";
import { listAuditLog, resolveReport, dismissReport, reopenReport, createMaintenance, type Report } from "@toboggo/shared";
import { ReportModal, type ReportWithPark } from "./ReportModal";

function makeReport(over: Partial<ReportWithPark> = {}): ReportWithPark {
  return {
    id: "r1",
    park_id: "p1",
    zone_id: null,
    equipment_id: null,
    user_id: "u1",
    reported_by_name: "Jean Dupont",
    category: "broken_equipment",
    severity: "medium",
    equipment_label: null,
    description: null,
    photo: null,
    status: "open",
    resolution_note: null,
    resolution_photo: null,
    resolution_days: null,
    resolved_by: null,
    resolved_at: null,
    created_at: "2026-09-01T10:00:00Z",
    reason: "broken_equipment",
    equipment: null,
    comment: null,
    parks: { name: "Parc Test" },
    ...over,
  } as ReportWithPark;
}

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    dismissReport: vi.fn().mockResolvedValue(undefined),
    reopenReport: vi.fn().mockResolvedValue(undefined),
    resolveReport: vi.fn().mockResolvedValue(undefined),
    uploadPhoto: vi.fn().mockResolvedValue("https://x/y.jpg"),
    createMaintenance: vi.fn().mockResolvedValue(undefined),
    logActivity: vi.fn().mockResolvedValue(undefined),
    listAuditLog: vi.fn().mockResolvedValue([
      { id: "a1", entity_type: "reports", entity_id: "r1", action: "update", field: null, old_value: null, new_value: null, actor_id: null, source: "app", created_at: "2026-09-02T10:00:00Z" },
    ]),
  };
});

const scope = vi.hoisted(() => ({ isAdmin: true }));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: scope.isAdmin, communeId: scope.isAdmin ? undefined : "org-1" }) }));
vi.mock("../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = { userName: "Testeur", userId: "u1" };
    return sel ? sel(state) : state;
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderModal(report: ReportWithPark, canManage = true, onClose: () => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <LocationProbe />
          <ReportModal report={report} onClose={onClose} canManage={canManage} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("ReportModal (Lot Admin-2 hardening)", () => {
  beforeEach(() => {
    vi.mocked(listAuditLog).mockClear();
    vi.mocked(resolveReport).mockClear();
    vi.mocked(dismissReport).mockClear();
    vi.mocked(reopenReport).mockClear();
    vi.mocked(createMaintenance).mockClear();
  });

  it("garde le formulaire de traitement disponible pour un signalement 'in_progress'", () => {
    scope.isAdmin = true;
    renderModal(makeReport({ status: "in_progress" }));
    expect(screen.getByLabelText(/Note de traitement/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Résoudre" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ignorer" })).toBeTruthy();
    // Pas la vue "signalement fermé" (bouton Réouvrir) :
    expect(screen.queryByRole("button", { name: "Réouvrir le signalement" })).toBeNull();
  });

  it("affiche la photo de résolution dès qu'elle existe, même si le signalement est de nouveau 'open' (réouverture)", () => {
    scope.isAdmin = true;
    renderModal(makeReport({ status: "open", resolution_photo: "https://x/after.jpg" }));
    const img = screen.getByAltText("Photo après résolution") as HTMLImageElement;
    expect(img.src).toBe("https://x/after.jpg");
  });

  it("n'affiche pas la photo de résolution quand elle est absente", () => {
    scope.isAdmin = true;
    renderModal(makeReport({ status: "resolved", resolution_photo: null }));
    expect(screen.queryByAltText("Photo après résolution")).toBeNull();
  });

  it("charge l'historique pour un compte Admin (RLS staff = autorisée)", async () => {
    scope.isAdmin = true;
    renderModal(makeReport({ status: "resolved" }));
    await waitFor(() => expect(listAuditLog).toHaveBeenCalledWith("reports", "r1"));
    expect(await screen.findByText("Historique")).toBeTruthy();
  });

  it("ne tente même pas de charger l'historique pour une Collectivité (RLS le bloquerait silencieusement)", () => {
    scope.isAdmin = false;
    renderModal(makeReport({ status: "resolved" }));
    expect(listAuditLog).not.toHaveBeenCalled();
    expect(screen.queryByText("Historique")).toBeNull();
  });

  it("Admin-UI-6C : « Voir le parc » ferme la modale et navigue vers /parks/:parkId", () => {
    scope.isAdmin = true;
    const onClose = vi.fn();
    renderModal(makeReport({ park_id: "p42" }), true, onClose);
    fireEvent.click(screen.getByRole("button", { name: "Voir le parc" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId("location").textContent).toBe("/parks/p42");
  });

  it("Admin-UI-9H-B : Résoudre appelle resolveReport avec la note saisie, puis ferme la modale", async () => {
    scope.isAdmin = true;
    const onClose = vi.fn();
    renderModal(makeReport({ id: "r9", status: "open" }), true, onClose);
    fireEvent.change(screen.getByLabelText(/Note de traitement/), { target: { value: "Réparé." } });
    fireEvent.click(screen.getByRole("button", { name: "Résoudre" }));
    await waitFor(() => expect(resolveReport).toHaveBeenCalledWith("r9", "Réparé.", undefined));
    expect(onClose).toHaveBeenCalled();
  });

  it("Admin-UI-9H-B : Ignorer appelle dismissReport avec la note saisie, puis ferme la modale", async () => {
    scope.isAdmin = true;
    const onClose = vi.fn();
    renderModal(makeReport({ id: "r9", status: "open" }), true, onClose);
    fireEvent.change(screen.getByLabelText(/Note de traitement/), { target: { value: "Sans suite." } });
    fireEvent.click(screen.getByRole("button", { name: "Ignorer" }));
    await waitFor(() => expect(dismissReport).toHaveBeenCalledWith("r9", "Sans suite."));
    expect(onClose).toHaveBeenCalled();
  });

  it("Admin-UI-9H-B : Réouvrir appelle reopenReport, puis ferme la modale", async () => {
    scope.isAdmin = true;
    const onClose = vi.fn();
    renderModal(makeReport({ id: "r9", status: "resolved" }), true, onClose);
    fireEvent.click(screen.getByRole("button", { name: "Réouvrir le signalement" }));
    await waitFor(() => expect(reopenReport).toHaveBeenCalledWith("r9"));
    expect(onClose).toHaveBeenCalled();
  });

  it("Admin-UI-9H-B : pour une Collectivité, propose la photo après réparation et le contrôle de suivi", () => {
    scope.isAdmin = false;
    renderModal(makeReport({ status: "open" }));
    expect(screen.getByText("Ajouter une photo après réparation")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Programmer un contrôle de suivi" })).toBeTruthy();
  });

  it("Admin-UI-9H-B : pour un Admin, la photo après réparation et le contrôle de suivi sont absents", () => {
    scope.isAdmin = true;
    renderModal(makeReport({ status: "open" }));
    expect(screen.queryByText("Ajouter une photo après réparation")).toBeNull();
    expect(screen.queryByRole("button", { name: "Programmer un contrôle de suivi" })).toBeNull();
  });

  it("Admin-UI-9H-B : pour une Collectivité, programmer un contrôle de suivi crée la maintenance et navigue vers /maintenance", async () => {
    scope.isAdmin = false;
    const onClose = vi.fn();
    renderModal(makeReport({ id: "r9", park_id: "p1", status: "open" }), true, onClose);
    fireEvent.click(screen.getByRole("button", { name: "Programmer un contrôle de suivi" }));
    await waitFor(() => expect(createMaintenance).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId("location").textContent).toBe("/maintenance");
  });

  it("Admin-UI-9H-B : canManage=false affiche un message au lieu des actions de traitement", () => {
    scope.isAdmin = true;
    renderModal(makeReport({ status: "open" }), false);
    expect(screen.getByText("Vous n'avez pas les droits pour traiter ce signalement.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Résoudre" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ignorer" })).toBeNull();
  });

  it("Admin-UI-9H-B : canManage=false sur un signalement déjà résolu n'offre pas Réouvrir", () => {
    scope.isAdmin = true;
    renderModal(makeReport({ status: "resolved" }), false);
    expect(screen.queryByRole("button", { name: "Réouvrir le signalement" })).toBeNull();
  });
});
