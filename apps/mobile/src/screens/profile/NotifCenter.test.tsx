import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import "../../i18n/testInit";
import { queryClient } from "../../lib/queryClient";
import { useSession } from "../../lib/session";

const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));
vi.mock("@toboggo/shared", async (orig) => ({ ...(await orig<object>()), ...api }));

import NotifCenter from "./NotifCenter";

const n = (id: string, read: boolean) => ({
  id,
  user_id: "u1",
  type: "thanks",
  title: `Titre ${id}`,
  description: `Desc ${id}`,
  read,
  park_id: null,
  created_at: "2026-09-01T10:00:00Z",
});

function renderCenter() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotifCenter />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Centre de notifications", () => {
  beforeEach(() => {
    queryClient.clear();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    vi.clearAllMocks();
    useSession.setState({ userId: "u1" });
    api.markNotificationRead.mockResolvedValue(undefined);
    api.markAllNotificationsRead.mockResolvedValue(undefined);
  });

  it("shows the empty state with no « Tout lire » when there is no notification", async () => {
    api.listNotifications.mockResolvedValue([]);
    renderCenter();
    expect(await screen.findByText("Vous êtes à jour !")).toBeTruthy();
    expect(screen.getByText(/Les nouvelles de vos parcs/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tout lire" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Lues" })).toBeNull();
  });

  it("filters unread, exposes the active tab, and shows a dedicated empty unread state", async () => {
    api.listNotifications.mockResolvedValue([n("a", true)]);
    renderCenter();
    await screen.findByText("Titre a");
    expect(screen.getByRole("tab", { name: "Toutes" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Non lues" }));
    expect(screen.getByRole("tab", { name: "Non lues" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Aucune notification non lue")).toBeTruthy();
  });

  it("marks one as read on open and all as read with « Tout lire »", async () => {
    api.listNotifications.mockResolvedValue([n("a", false), n("b", true)]);
    renderCenter();
    fireEvent.click(await screen.findByText("Titre a"));
    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith("a"));
    fireEvent.click(screen.getByRole("button", { name: "Tout lire" }));
    await waitFor(() => expect(api.markAllNotificationsRead).toHaveBeenCalledWith("u1"));
  });

  it("shows an error state with retry", async () => {
    api.listNotifications.mockRejectedValue(new Error("x"));
    renderCenter();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });
});
