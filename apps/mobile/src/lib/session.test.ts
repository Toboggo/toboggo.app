import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LOT 3D.A — store-level lifecycle of `useSession` (mobile).
 *
 * Same mechanism as the back office (LOT 3D audit §B.2): `bootstrapProfile()`
 * starts with `set({ loading: true })` and App.tsx renders nothing while
 * `loading` is true, so an auth event that re-runs it unmounts every screen.
 * A same-user session refresh must not do that.
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
  profileCalls: 0,
}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    isSupabaseConfigured: () => true,
    getSession: vi.fn(async () => supa.session),
    onAuthStateChange: (fn: (userId: string | null) => void) => authMock.register(fn),
    getOrCreateProfile: vi.fn(async (userId: string, name: string, email: string) => {
      supa.profileCalls += 1;
      return { id: userId, name, email, dark_mode: false } as unknown as Awaited<
        ReturnType<typeof actual.getOrCreateProfile>
      >;
    }),
    updateProfile: vi.fn(async () => ({}) as never),
  };
});

import { useSession } from "./session";

const SESSION = { user: { id: "user-1", email: "alice@parents.fr", user_metadata: { name: "Alice" } } };
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  authMock.reset();
  supa.session = null;
  supa.profileCalls = 0;
  useSession.setState({ userId: null, profile: null, loading: true, guestMode: false, pendingResume: null });
});

describe("useSession.init", () => {
  it("no session → loading:false, signed out", async () => {
    useSession.getState().init();
    await flush();
    expect(useSession.getState().loading).toBe(false);
    expect(useSession.getState().userId).toBeNull();
  });

  it("existing session → bootstraps the profile once, ends loading:false", async () => {
    supa.session = SESSION;
    useSession.getState().init();
    await flush();
    expect(useSession.getState().userId).toBe("user-1");
    expect(useSession.getState().profile?.name).toBe("Alice");
    expect(useSession.getState().loading).toBe(false);
    expect(supa.profileCalls).toBe(1);
  });

  it("same-user SIGNED_IN / TOKEN_REFRESHED → no re-bootstrap, loading never flips true", async () => {
    supa.session = SESSION;
    useSession.getState().init();
    await flush();
    const callsAfterBootstrap = supa.profileCalls;

    let sawLoadingTrue = false;
    const unsub = useSession.subscribe((s) => {
      if (s.loading) sawLoadingTrue = true;
    });
    authMock.emit("user-1");
    await flush();
    unsub();

    expect(sawLoadingTrue).toBe(false);
    expect(supa.profileCalls).toBe(callsAfterBootstrap);
    expect(useSession.getState().userId).toBe("user-1");
  });

  it("SIGNED_OUT → clears userId + profile, loading:false", async () => {
    supa.session = SESSION;
    useSession.getState().init();
    await flush();

    authMock.emit(null);
    await flush();
    expect(useSession.getState().userId).toBeNull();
    expect(useSession.getState().profile).toBeNull();
    expect(useSession.getState().loading).toBe(false);
  });

  it("genuine account switch → re-bootstraps (loading flips true) with the new profile", async () => {
    supa.session = SESSION;
    useSession.getState().init();
    await flush();

    let sawLoadingTrue = false;
    const unsub = useSession.subscribe((s) => {
      if (s.loading) sawLoadingTrue = true;
    });
    supa.session = { user: { id: "user-2", email: "bob@parents.fr", user_metadata: { name: "Bob" } } };
    authMock.emit("user-2");
    await flush();
    unsub();

    expect(sawLoadingTrue).toBe(true);
    expect(useSession.getState().userId).toBe("user-2");
    expect(useSession.getState().profile?.name).toBe("Bob");
  });

  it("guest just-in-time login (null → user) runs the pendingResume callback", async () => {
    useSession.getState().init();
    await flush();
    const resume = vi.fn();
    useSession.setState({ pendingResume: resume });

    supa.session = SESSION;
    authMock.emit("user-1");
    await flush();

    expect(resume).toHaveBeenCalledTimes(1);
    expect(useSession.getState().pendingResume).toBeNull();
  });
});
