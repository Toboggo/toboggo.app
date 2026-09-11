import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { purgeDraftsForPrincipal, signOut } from "@toboggo/shared";
import "../../i18n/testInit";
import Profile from "./Profile";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listMyParks: vi.fn().mockResolvedValue([]),
    listMyReviews: vi.fn().mockResolvedValue([]),
    signOut: vi.fn().mockResolvedValue(undefined),
    purgeDraftsForPrincipal: vi.fn(() => 0),
  };
});

const PROFILE = { name: "Alice Test", email: "alice@example.com", favorites: [], children: [] };
const sess = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("../../lib/session", () => ({
  useSession: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const s = { userId: sess.userId, profile: sess.userId ? PROFILE : null };
      return sel ? sel(s) : s;
    },
    { getState: () => ({ userId: sess.userId }) },
  ),
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/profile"]}>
        <LocationProbe />
        <Routes>
          <Route path="/profile" element={<Profile />} />
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sess.userId = "u1";
  vi.mocked(signOut).mockReset().mockResolvedValue(undefined);
  vi.mocked(purgeDraftsForPrincipal).mockReset().mockReturnValue(0);
});

describe("Profile — logout draft purge (LOT 3D.F)", () => {
  it("logging out purges only this account's drafts, captured before the session is cleared", async () => {
    renderProfile();
    fireEvent.click(await screen.findByRole("button", { name: "Se déconnecter" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(purgeDraftsForPrincipal).toHaveBeenCalledTimes(1);
    expect(purgeDraftsForPrincipal).toHaveBeenCalledWith({ userId: "u1" });
    expect(screen.getByTestId("loc").textContent).toBe("/");
  });
});
