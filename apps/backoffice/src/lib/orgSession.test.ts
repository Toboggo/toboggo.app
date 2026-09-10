import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LOT 3D.A — store-level lifecycle of `useOrgSession`.
 *
 * The mechanism behind the remount bug (LOT 3D audit §B.2): every auth event
 * used to re-run `load()`, whose first line is `set({ loading: true })`, and
 * App.tsx unmounts the whole routed tree while `loading` is true. These tests
 * pin exactly when `loading` is (and is not) allowed to flip back to true.
 */

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
  eqCalls: 0,
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
            eq: async () => {
              supa.eqCalls += 1;
              return { data: supa.memberships };
            },
            in: async () => ({ data: [{ id: "org-1", name: "Ville-Test" }] }),
          }),
        }),
      }) as unknown as ReturnType<typeof actual.getSupabase>,
  };
});

import { useOrgSession } from "./orgSession";

const SESSION = { user: { id: "user-1", email: "alice@ville.fr", user_metadata: { name: "Alice" } } };
const MEMBERSHIP = { id: "m1", user_id: "user-1", role: "gestionnaire", commune_id: "org-1", organization_id: "org-1" };

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  authMock.reset();
  supa.session = null;
  supa.memberships = [];
  supa.eqCalls = 0;
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
});

describe("useOrgSession.init", () => {
  it("1. no session → resolves loading:false, stays signed out", async () => {
    useOrgSession.getState().init();
    await flush();
    expect(useOrgSession.getState().loading).toBe(false);
    expect(useOrgSession.getState().userId).toBeNull();
  });

  it("2. existing session → loads memberships once, ends loading:false", async () => {
    supa.session = SESSION;
    supa.memberships = [MEMBERSHIP];
    useOrgSession.getState().init();
    await flush();
    expect(useOrgSession.getState().userId).toBe("user-1");
    expect(useOrgSession.getState().memberships.map((m) => m.id)).toEqual(["m1"]);
    expect(useOrgSession.getState().loading).toBe(false);
    const callsAfterBootstrap = supa.eqCalls;

    // 3. TOKEN_REFRESHED / SIGNED_IN for the SAME user → no reload, no re-fetch,
    // `loading` never flips back to true.
    let sawLoadingTrue = false;
    const unsub = useOrgSession.subscribe((s) => {
      if (s.loading) sawLoadingTrue = true;
    });
    authMock.emit("user-1");
    await flush();
    unsub();
    expect(sawLoadingTrue).toBe(false);
    expect(supa.eqCalls).toBe(callsAfterBootstrap);
    expect(useOrgSession.getState().userId).toBe("user-1");
  });

  it("4. SIGNED_OUT → clears every user field, loading:false", async () => {
    supa.session = SESSION;
    supa.memberships = [MEMBERSHIP];
    useOrgSession.getState().init();
    await flush();

    authMock.emit(null);
    await flush();
    const s = useOrgSession.getState();
    expect(s.userId).toBeNull();
    expect(s.userName).toBe("");
    expect(s.userEmail).toBe("");
    expect(s.memberships).toEqual([]);
    expect(s.communes).toEqual([]);
    expect(s.activeOrg).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.accessDenied).toBe(false);
  });

  it("5. genuine account switch → reload runs (loading flips true) and replaces the user", async () => {
    supa.session = SESSION;
    supa.memberships = [MEMBERSHIP];
    useOrgSession.getState().init();
    await flush();

    let sawLoadingTrue = false;
    const unsub = useOrgSession.subscribe((s) => {
      if (s.loading) sawLoadingTrue = true;
    });
    supa.session = { user: { id: "user-2", email: "bob@ville.fr", user_metadata: { name: "Bob" } } };
    supa.memberships = [{ ...MEMBERSHIP, id: "m2", user_id: "user-2" }];
    authMock.emit("user-2");
    await flush();
    unsub();

    expect(sawLoadingTrue).toBe(true);
    const s = useOrgSession.getState();
    expect(s.userId).toBe("user-2");
    expect(s.userName).toBe("Bob");
    expect(s.memberships.map((m) => m.id)).toEqual(["m2"]);
  });

  it("6. a user with no team_members row still ends loading:false (accessDenied)", async () => {
    supa.session = SESSION;
    supa.memberships = [];
    useOrgSession.getState().init();
    await flush();
    expect(useOrgSession.getState().loading).toBe(false);
    expect(useOrgSession.getState().accessDenied).toBe(true);
  });
});
