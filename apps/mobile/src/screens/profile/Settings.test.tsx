import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { purgeDraftsForPrincipal, signOut } from "@toboggo/shared";
import "../../i18n/testInit";
import Settings from "./Settings";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    signOut: vi.fn().mockResolvedValue(undefined),
    purgeDraftsForPrincipal: vi.fn(() => 0),
  };
});

const sess = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("../../lib/session", () => ({
  useSession: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const s = { userId: sess.userId };
      return sel ? sel(s) : s;
    },
    { getState: () => ({ userId: sess.userId }) },
  ),
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <LocationProbe />
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sess.userId = "u1";
  vi.mocked(signOut).mockReset().mockResolvedValue(undefined);
  vi.mocked(purgeDraftsForPrincipal).mockReset().mockReturnValue(0);
});

describe("Settings — logout draft purge (LOT 3D.F, relocated from Profile in the Profile/Réglages split)", () => {
  it("logging out purges only this account's drafts, captured before the session is cleared", async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: "Se déconnecter" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(purgeDraftsForPrincipal).toHaveBeenCalledTimes(1);
    expect(purgeDraftsForPrincipal).toHaveBeenCalledWith({ userId: "u1" });
    expect(screen.getByTestId("loc").textContent).toBe("/");
  });
});
