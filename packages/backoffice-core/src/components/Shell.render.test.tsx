import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getParkStatusCounts, listParks } from "@toboggo/shared";
import { Shell } from "./Shell";

// `buildNavGroups` (the pure logic) is covered by Shell.test.ts. This file
// covers the one genuinely new bit of render-level logic added by
// Admin-UI-7C: the "bo-shell-admin" marker class, applied only for an Admin
// session — the Collectivité shell must never receive it.
vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listParks: vi.fn().mockResolvedValue([]),
    getParkStatusCounts: vi.fn().mockResolvedValue({ pending: 6783 }),
    listReports: vi.fn().mockResolvedValue([]),
    listPendingMedia: vi.fn().mockResolvedValue([]),
    listParkEdits: vi.fn().mockResolvedValue([]),
  };
});

const scope = vi.hoisted(() => ({ isAdmin: true, communeId: undefined as string | undefined }));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: scope.isAdmin, communeId: scope.communeId }) }));

vi.mock("../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = {
      memberships: [],
      communes: [],
      activeOrg: scope.isAdmin ? { type: "admin" } : { type: "commune", communeId: "c1" },
      setActiveOrg: vi.fn(),
      userName: "Testeur",
      userEmail: "testeur@toboggo.local",
      currentRole: () => "super_admin",
      signOut: vi.fn(),
    };
    return sel ? sel(state) : state;
  },
}));

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <Shell>
          <div>contenu</div>
        </Shell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Shell — Admin-UI-7C (bo-shell-admin scoping)", () => {
  it("adds bo-shell-admin only for an Admin session", () => {
    scope.isAdmin = true;
    scope.communeId = undefined;
    const { container } = renderShell();
    expect(container.querySelector(".bo-shell")?.className).toContain("bo-shell-admin");
  });

  it("never adds bo-shell-admin for a Collectivité session", () => {
    scope.isAdmin = false;
    scope.communeId = "c1";
    const { container } = renderShell();
    const el = container.querySelector(".bo-shell");
    expect(el?.className).toContain("bo-shell");
    expect(el?.className).not.toContain("bo-shell-admin");
  });
});

describe("Shell — Lot P1 (badge « parcs en attente »)", () => {
  it("uses an exact server-side count instead of downloading every pending park", async () => {
    scope.isAdmin = true;
    scope.communeId = undefined;
    vi.mocked(getParkStatusCounts).mockClear();
    vi.mocked(listParks).mockClear();
    const { findByText } = renderShell();
    await waitFor(() => expect(getParkStatusCounts).toHaveBeenCalledWith(["pending"], { communeId: undefined }));
    expect(listParks).not.toHaveBeenCalled();
    // Real total shown (not capped at PostgREST's max_rows).
    expect(await findByText("6783")).toBeTruthy();
  });

  it("scopes the count to the commune for a Collectivité session", async () => {
    scope.isAdmin = false;
    scope.communeId = "c1";
    vi.mocked(getParkStatusCounts).mockClear();
    renderShell();
    await waitFor(() => expect(getParkStatusCounts).toHaveBeenCalledWith(["pending"], { communeId: "c1" }));
  });
});
