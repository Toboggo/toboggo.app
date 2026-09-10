import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmDialogProvider, ToastProvider } from "@toboggo/design-system";

/**
 * LOT 3D.A — behavioural proof that a Supabase auth *refresh* (the SIGNED_IN /
 * TOKEN_REFRESHED that supabase-js emits on every return to tab visibility)
 * does NOT unmount the routed tree, so a form the user is filling in keeps its
 * local state. See `orgSession.ts` and the LOT 3D audit §B.2.
 */

// Capture the callback the store registers with `onAuthStateChange`, so the
// test can replay the real supabase-js events by hand.
const authMock = vi.hoisted(() => {
  let cb: ((userId: string | null) => void) | null = null;
  return {
    register(fn: (userId: string | null) => void) {
      cb = fn;
      return () => {
        cb = null;
      };
    },
    emit(userId: string | null) {
      cb?.(userId);
    },
    reset() {
      cb = null;
    },
  };
});

const supa = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; user_metadata: { name: string } } } | null,
  memberships: [] as Array<Record<string, unknown>>,
}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    isSupabaseConfigured: () => true,
    getSession: vi.fn(async () => supa.session),
    onAuthStateChange: (fn: (userId: string | null) => void) => authMock.register(fn),
    signOut: vi.fn(async () => {}),
    getSupabase: () =>
      ({
        from: () => ({
          select: () => ({
            eq: async () => ({ data: supa.memberships }),
            in: async () => ({ data: [{ id: "org-1", name: "Ville-Test" }] }),
          }),
        }),
      }) as unknown as ReturnType<typeof actual.getSupabase>,
    // Data pulled by Shell / Dashboard — never asserted here.
    listParks: vi.fn(async () => []),
    listReports: vi.fn(async () => []),
    listPendingMedia: vi.fn(async () => []),
  };
});

vi.mock("maplibre-gl", () => ({
  __esModule: true,
  default: { Map: class {}, Marker: class {}, NavigationControl: class {} },
}));

// The screen tree is not under test. A stateful probe stands in for "a form the
// user is filling in", mounted where the real screens live. It counts its own
// mounts so the test can tell a survived subtree from a torn-down/rebuilt one.
const probe = vi.hoisted(() => ({ mounts: 0 }));
function Probe() {
  const [v, setV] = useState("");
  useEffect(() => {
    probe.mounts += 1;
  }, []);
  return <input aria-label="draft-field" value={v} onChange={(e) => setV(e.target.value)} />;
}
vi.mock("../components/Shell", () => ({
  Shell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">
      <Probe />
      {children}
    </div>
  ),
}));
vi.mock("../screens/Dashboard", () => ({ default: () => <div>dashboard</div> }));

// Imported after the mocks are declared.
import App from "../App";
import { useOrgSession } from "./orgSession";

const SESSION = { user: { id: "user-1", email: "alice@ville.fr", user_metadata: { name: "Alice" } } };
const MEMBERSHIP = { id: "m1", user_id: "user-1", role: "gestionnaire", commune_id: "org-1", organization_id: "org-1" };

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <MemoryRouter initialEntries={["/"]}>
            <App />
          </MemoryRouter>
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  authMock.reset();
  probe.mounts = 0;
  supa.session = SESSION;
  supa.memberships = [MEMBERSHIP];
  useOrgSession.setState({
    userId: null,
    userName: "",
    userEmail: "",
    memberships: [],
    communes: [],
    activeOrg: null,
    loading: true,
    accessDenied: false,
  });
  // useIconSprite() fetches /icons-sprite.svg → 404 in jsdom; expected noise.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("LOT 3D.A — auth refresh must not remount the app", () => {
  it("bootstraps with an existing session and mounts the routed tree once", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId("shell")).toBeTruthy());
    expect(probe.mounts).toBe(1);
    expect(useOrgSession.getState().loading).toBe(false);
  });

  it("keeps the mounted form (and its local state) across a same-user TOKEN_REFRESHED / SIGNED_IN", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId("shell")).toBeTruthy());

    const field = screen.getByLabelText("draft-field") as HTMLInputElement;
    act(() => {
      // typed as a controlled change
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(field, "brouillon non enregistré");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect((screen.getByLabelText("draft-field") as HTMLInputElement).value).toBe("brouillon non enregistré");

    // supabase-js re-emits this on every tab re-focus, same user, same session.
    await act(async () => {
      authMock.emit("user-1");
      await Promise.resolve();
    });

    // The subtree was never torn down…
    expect(probe.mounts).toBe(1);
    // …so the in-progress value is still there.
    expect((screen.getByLabelText("draft-field") as HTMLInputElement).value).toBe("brouillon non enregistré");
    // …and `loading` was never flipped back to true.
    expect(useOrgSession.getState().loading).toBe(false);
  });

  it("still tears the tree down on a real SIGNED_OUT", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId("shell")).toBeTruthy());

    await act(async () => {
      supa.session = null;
      authMock.emit(null);
      await Promise.resolve();
    });

    expect(screen.queryByTestId("shell")).toBeNull();
    expect(useOrgSession.getState().userId).toBeNull();
    expect(useOrgSession.getState().accessDenied).toBe(false);
  });

  it("fully replaces the session on a genuine account switch (no stale user data kept)", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId("shell")).toBeTruthy());
    expect(useOrgSession.getState().userName).toBe("Alice");

    await act(async () => {
      supa.session = { user: { id: "user-2", email: "bob@ville.fr", user_metadata: { name: "Bob" } } };
      supa.memberships = [{ ...MEMBERSHIP, id: "m2", user_id: "user-2" }];
      authMock.emit("user-2");
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(useOrgSession.getState().userId).toBe("user-2"));
    expect(useOrgSession.getState().userName).toBe("Bob");
    expect(useOrgSession.getState().userEmail).toBe("bob@ville.fr");
    expect(useOrgSession.getState().memberships.map((m) => m.id)).toEqual(["m2"]);
  });
});
