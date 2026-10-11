import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialogProvider, ToastProvider } from "@toboggo/design-system";
import { listPendingMedia, listProcessedMedia } from "@toboggo/shared";
import Photos from "./Photos";

// `vi.mock` est hoisté au-dessus des imports/consts du fichier — les fixtures
// doivent donc passer par `vi.hoisted` pour être visibles depuis la factory
// (même convention que Reports.test.tsx).
const { PENDING, PROCESSED } = vi.hoisted(() => ({
  PENDING: [
    {
      id: "m-pending-1",
      park_id: "p1",
      user_id: "u1",
      url: "https://x/pending1.webp",
      category: "other",
      caption: null,
      is_cover: false,
      status: "pending",
      created_at: "2026-09-10T10:00:00Z",
      source: "user",
      source_url: null,
      author: null,
      license: null,
      attribution: null,
      park: { id: "p1", name: "Parc Nord" },
      uploadedByName: "Alice",
    },
  ],
  PROCESSED: [
    {
      id: "m-approved-1",
      park_id: "p2",
      user_id: null,
      url: "https://x/approved1.webp",
      category: "other",
      caption: null,
      is_cover: false,
      status: "approved",
      created_at: "2026-09-05T10:00:00Z",
      source: "toboggo",
      source_url: null,
      author: "Équipe Toboggo",
      license: null,
      attribution: null,
      park: { id: "p2", name: "Parc Sud" },
      uploadedByName: null,
    },
  ],
}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listPendingMedia: vi.fn().mockResolvedValue(PENDING),
    listProcessedMedia: vi.fn().mockResolvedValue(PROCESSED),
    setMediaStatus: vi.fn().mockResolvedValue(undefined),
    setParkCover: vi.fn().mockResolvedValue(undefined),
    deleteMedia: vi.fn().mockResolvedValue(undefined),
  };
});

const permissionsState = vi.hoisted(() => ({ canModerateMedia: true }));
vi.mock("../lib/permissions", () => ({ usePermissions: () => ({ canModerateMedia: permissionsState.canModerateMedia }) }));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: true, communeId: undefined }) }));

function renderPhotos() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <MemoryRouter initialEntries={["/photos"]}>
            <Photos />
          </MemoryRouter>
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("Photos — file de modération (Admin-UI-6D)", () => {
  it("affiche des compteurs réels sur les deux onglets", async () => {
    permissionsState.canModerateMedia = true;
    renderPhotos();
    await waitFor(() => expect(listPendingMedia).toHaveBeenCalled());
    expect(await screen.findByRole("tab", { name: "À traiter (1)" })).toBeTruthy();
    expect(await screen.findByRole("tab", { name: "Traitées (1)" })).toBeTruthy();
  });

  it("le nom du parc est un lien vers sa fiche Parc 360", async () => {
    permissionsState.canModerateMedia = true;
    renderPhotos();
    const link = await screen.findByRole("link", { name: "Parc Nord" });
    expect(link.getAttribute("href")).toBe("/parks/p1");
  });

  it("un rôle sans droit de modération voit la file en lecture seule, sans actions", async () => {
    permissionsState.canModerateMedia = false;
    renderPhotos();
    await screen.findByText("Parc Nord");
    expect(screen.getByText(/lecture seule/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approuver" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refuser" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Supprimer" })).toBeNull();
  });

  it("un rôle avec droit de modération voit les 4 actions sur une photo à traiter", async () => {
    permissionsState.canModerateMedia = true;
    renderPhotos();
    await screen.findByText("Parc Nord");
    expect(screen.getByRole("button", { name: "Approuver" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approuver + couverture" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refuser" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeTruthy();
  });

  it("l'onglet Traitées affiche le statut réel et seulement l'action Supprimer", async () => {
    permissionsState.canModerateMedia = true;
    renderPhotos();
    await waitFor(() => expect(listProcessedMedia).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("tab", { name: "Traitées (1)" }));

    expect(await screen.findByText("Parc Sud")).toBeTruthy();
    expect(screen.getByText("Approuvée")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approuver" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refuser" })).toBeNull();
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeTruthy();
  });

  it("la recherche filtre par nom de parc", async () => {
    permissionsState.canModerateMedia = true;
    renderPhotos();
    await screen.findByText("Parc Nord");
    fireEvent.change(screen.getByLabelText("Rechercher"), { target: { value: "Sud" } });
    expect(screen.queryByText("Parc Nord")).toBeNull();
  });
});
