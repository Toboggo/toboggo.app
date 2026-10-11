import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialogProvider, ToastProvider } from "@toboggo/design-system";
import { listMedia, setParkCover, deleteMediaByUrl, addParkPhotos, type ParkMedia } from "@toboggo/shared";
import { PhotosPanel } from "./PhotosPanel";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listMedia: vi.fn(),
    setParkCover: vi.fn().mockResolvedValue(undefined),
    deleteMediaByUrl: vi.fn().mockResolvedValue(undefined),
    addParkPhotos: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("../../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: false, communeId: "org-1" }) }));
vi.mock("../../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = { userName: "Testeur", userId: "u1" };
    return sel ? sel(state) : state;
  },
}));
function media(partial: Partial<ParkMedia>): ParkMedia {
  return {
    id: "m1",
    park_id: "p1",
    zone_id: null,
    user_id: null,
    url: "https://example.test/photo.jpg",
    category: "other",
    caption: null,
    is_cover: false,
    status: "approved",
    created_at: "2026-09-12T10:00:00Z",
    source: "municipality",
    source_url: null,
    author: null,
    license: null,
    attribution: null,
    ...partial,
  } as ParkMedia;
}

function renderPanel(canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <PhotosPanel parkId="p1" canManage={canManage} />
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("PhotosPanel (Lot 9F-B)", () => {
  beforeEach(() => {
    vi.mocked(listMedia).mockReset().mockResolvedValue([]);
    vi.mocked(setParkCover).mockReset().mockResolvedValue(undefined);
    vi.mocked(deleteMediaByUrl).mockReset().mockResolvedValue(undefined);
    vi.mocked(addParkPhotos).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an empty state when there are no photos and the viewer cannot manage", async () => {
    vi.mocked(listMedia).mockResolvedValue([]);
    renderPanel(false);
    expect(await screen.findByText("Aucune photo pour ce parc.")).toBeTruthy();
  });

  it("renders an approved photo", async () => {
    vi.mocked(listMedia).mockResolvedValue([media({ id: "m1", status: "approved" })]);
    renderPanel();
    expect(await screen.findByAltText("Photo du parc")).toBeTruthy();
  });

  it("shows the cover badge for the cover photo", async () => {
    vi.mocked(listMedia).mockResolvedValue([media({ id: "m1", is_cover: true, status: "approved" })]);
    renderPanel();
    expect(await screen.findByText("Couverture")).toBeTruthy();
  });

  it("shows the pending badge for a pending photo", async () => {
    vi.mocked(listMedia).mockResolvedValue([media({ id: "m1", status: "pending" })]);
    renderPanel();
    expect(await screen.findByText("En attente")).toBeTruthy();
  });

  it("does not display a rejected photo", async () => {
    vi.mocked(listMedia).mockResolvedValue([media({ id: "m1", status: "rejected" })]);
    renderPanel(false);
    expect(await screen.findByText("Aucune photo pour ce parc.")).toBeTruthy();
    expect(screen.queryByAltText("Photo du parc")).toBeFalsy();
  });

  it("shows the provenance line", async () => {
    vi.mocked(listMedia).mockResolvedValue([
      media({ id: "m1", source: "municipality", attribution: "Mairie de Testville", license: "CC-BY" }),
    ]);
    renderPanel();
    expect(await screen.findByText("Collectivité · Mairie de Testville · CC-BY")).toBeTruthy();
  });

  it("shows the created_at date using the Park 360 date format", async () => {
    vi.mocked(listMedia).mockResolvedValue([media({ id: "m1", created_at: "2026-09-12T10:00:00Z" })]);
    renderPanel();
    expect(await screen.findByText("Ajoutée le 12 sept. 2026")).toBeTruthy();
  });

  it("only shows 'Définir couverture' for an approved, non-cover photo when canManage", async () => {
    vi.mocked(listMedia).mockResolvedValue([media({ id: "m1", status: "approved", is_cover: false })]);
    renderPanel(true);
    expect(await screen.findByRole("button", { name: "Définir couverture" })).toBeTruthy();
  });

  it("hides 'Définir couverture' for a pending photo even when canManage", async () => {
    vi.mocked(listMedia).mockResolvedValue([media({ id: "m1", status: "pending", is_cover: false })]);
    renderPanel(true);
    await screen.findByAltText("Photo du parc");
    expect(screen.queryByRole("button", { name: "Définir couverture" })).toBeFalsy();
  });

  it("hides delete and upload actions when canManage is false", async () => {
    vi.mocked(listMedia).mockResolvedValue([media({ id: "m1", status: "approved" })]);
    renderPanel(false);
    await screen.findByAltText("Photo du parc");
    expect(screen.queryByRole("button", { name: "Supprimer" })).toBeFalsy();
    expect(screen.queryByText("Ajouter une photo")).toBeFalsy();
  });

  it("shows delete and upload actions when canManage is true", async () => {
    vi.mocked(listMedia).mockResolvedValue([media({ id: "m1", status: "approved" })]);
    renderPanel(true);
    expect(await screen.findByRole("button", { name: "Supprimer" })).toBeTruthy();
    expect(screen.getByText("Ajouter une photo")).toBeTruthy();
  });
});
