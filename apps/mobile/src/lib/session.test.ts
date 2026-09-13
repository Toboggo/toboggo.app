import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@toboggo/shared";

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

const favMock = vi.hoisted(() => ({
  apiToggleFavorite: vi.fn(),
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
    toggleFavorite: favMock.apiToggleFavorite,
  };
});

import { useSession } from "./session";

const SESSION = { user: { id: "user-1", email: "alice@parents.fr", user_metadata: { name: "Alice" } } };
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  authMock.reset();
  supa.session = null;
  supa.profileCalls = 0;
  favMock.apiToggleFavorite.mockReset().mockResolvedValue([]);
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

/**
 * The map's "Autour de vous" carousel, the park detail page and the
 * favorites list each used to toggle the heart with their own inline
 * `includes`/`filter` against the `favorites` array captured at render time,
 * then `patchProfile`d the result. Two hearts tapped back to back — before
 * either network round trip resolved — raced: the second write's base array
 * didn't yet include the first change, so it could persist and silently
 * revert it. `toggleFavorite` below is the single place every screen now
 * goes through instead, applied optimistically against live store state.
 */
describe("useSession.toggleFavorite", () => {
  function setProfile(userId: string | null, favorites: string[] | null) {
    useSession.setState({
      userId,
      profile: favorites ? ({ favorites } as unknown as Profile) : null,
      loading: false,
    });
  }

  it("adds a park to favorites immediately, without waiting for the network round trip", () => {
    setProfile("user-1", []);
    useSession.getState().toggleFavorite("park-a");
    expect(useSession.getState().profile?.favorites).toEqual(["park-a"]);
  });

  it("removes an already-favorited park", () => {
    setProfile("user-1", ["park-a"]);
    useSession.getState().toggleFavorite("park-a");
    expect(useSession.getState().profile?.favorites).toEqual([]);
  });

  it("two hearts tapped back to back can't race each other's still-pending write", () => {
    setProfile("user-1", []);
    // Neither network call resolves during this test — simulates two taps
    // landing before either PATCH completes (e.g. two cards in a carousel).
    favMock.apiToggleFavorite.mockReturnValue(new Promise(() => {}));

    useSession.getState().toggleFavorite("park-a");
    useSession.getState().toggleFavorite("park-b");

    // Both stick locally...
    expect([...(useSession.getState().profile?.favorites ?? [])].sort()).toEqual(["park-a", "park-b"]);
    // ...and the second write already carries the first one forward, so
    // whichever request resolves last still converges on both parks kept —
    // never the pre-fix bug where the second write's base excluded the first.
    expect(favMock.apiToggleFavorite).toHaveBeenNthCalledWith(2, "user-1", "park-b", ["park-a"]);
  });

  it("rolls back only that park's change if its network write fails", async () => {
    setProfile("user-1", []);
    favMock.apiToggleFavorite.mockRejectedValueOnce(new Error("network"));

    useSession.getState().toggleFavorite("park-a");
    expect(useSession.getState().profile?.favorites).toEqual(["park-a"]);

    await vi.waitFor(() => expect(useSession.getState().profile?.favorites).toEqual([]));
  });

  it("is a no-op for a signed-out user", () => {
    setProfile(null, null);
    useSession.getState().toggleFavorite("park-a");
    expect(favMock.apiToggleFavorite).not.toHaveBeenCalled();
  });
});
