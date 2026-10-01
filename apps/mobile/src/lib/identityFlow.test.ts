import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Parcours complet session ↔ analytics RÉELS (seuls posthog-js et Supabase sont
 * simulés) : prouve l'ordre identify → événement et `is_authenticated` sur
 * login_completed/signup_completed, comme `signIn()` le déclenche en vrai
 * (SIGNED_IN notifié AVANT que `signIn()` ne rende la main à l'écran).
 */
const ph = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn(), identify: vi.fn(), reset: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

const auth = vi.hoisted(() => ({ cb: null as ((id: string | null) => void) | null, session: null as unknown }));
vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    isSupabaseConfigured: () => true,
    getSession: vi.fn(async () => auth.session),
    onAuthStateChange: (fn: (id: string | null) => void) => {
      auth.cb = fn;
      return () => {};
    },
    getOrCreateProfile: vi.fn(async (id: string) => ({ id, name: "X", email: "x@y.z" }) as never),
    toggleFavorite: vi.fn(),
    updateProfile: vi.fn(),
  };
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const sessionFor = (id: string) => ({ user: { id, email: "x@y.z", user_metadata: {} } });

let useSession: typeof import("./session").useSession;
let trackEvent: typeof import("./analytics").trackEvent;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
  vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
  vi.stubEnv("VITE_APP_ENV", "production");
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
  auth.cb = null;
  auth.session = null;
  ({ useSession } = await import("./session"));
  ({ trackEvent } = await import("./analytics"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const m of Object.values(ph)) m.mockClear();
});

const eventsOf = (name: string) => ph.capture.mock.calls.filter(([n]) => n === name);

describe("auth ↔ analytics identity flow", () => {
  it("anonymous visitor: no identity, is_authenticated false", async () => {
    useSession.getState().init();
    auth.cb!(null);
    await flush();
    trackEvent("app_opened", {});
    expect(ph.identify).not.toHaveBeenCalled();
    expect(ph.capture.mock.calls[0][1]).toMatchObject({ is_authenticated: false });
  });

  it("email login/signup: identify precedes the event, which carries is_authenticated:true", async () => {
    useSession.getState().init();
    await flush();
    // Ce que fait Supabase : SIGNED_IN notifié pendant signIn()/signUp(), puis l'écran émet.
    auth.session = sessionFor("user-1");
    auth.cb!("user-1");
    trackEvent("login_completed", { provider: "email" });
    trackEvent("signup_completed", { provider: "email", entry_point: "splash" });
    expect(ph.identify).toHaveBeenCalledWith("user-1");
    for (const [, props] of [...eventsOf("login_completed"), ...eventsOf("signup_completed")]) {
      expect(props).toMatchObject({ is_authenticated: true });
    }
    expect(ph.identify.mock.invocationCallOrder[0]).toBeLessThan(ph.capture.mock.invocationCallOrder[0]);
  });

  it("Google signup then login: identify before the event, is_authenticated:true", async () => {
    const { markGoogleLoginStarted } = await import("./googleLogin");
    markGoogleLoginStarted();
    auth.session = {
      user: { ...sessionFor("user-1").user, created_at: "2026-10-01T10:00:00.000Z", last_sign_in_at: "2026-10-01T10:00:00.080Z" },
    };
    useSession.getState().init();
    auth.cb!("user-1");
    await flush();
    const [, props] = eventsOf("signup_completed")[0];
    expect(props).toMatchObject({ provider: "google", is_authenticated: true });
    expect(ph.identify.mock.invocationCallOrder[0]).toBeLessThan(ph.capture.mock.invocationCallOrder[0]);
  });

  it("session restore + reload: identify with the same id each load; no login_completed", async () => {
    auth.session = sessionFor("user-1");
    useSession.getState().init();
    auth.cb!("user-1"); // INITIAL_SESSION
    await flush();
    expect(ph.identify.mock.calls).toEqual([["user-1"]]);
    expect(eventsOf("login_completed")).toHaveLength(0);
    // « reload » : modules neufs, même utilisateur
    vi.resetModules();
    const again = await import("./session");
    again.useSession.getState().init();
    auth.cb!("user-1");
    await flush();
    expect(ph.identify.mock.calls).toEqual([["user-1"], ["user-1"]]);
  });

  it("logout → reset; account B afterwards is never merged with A", async () => {
    auth.session = sessionFor("A");
    useSession.getState().init();
    await flush();
    auth.session = null;
    auth.cb!(null);
    expect(ph.reset).toHaveBeenCalledTimes(1);
    auth.cb!("B");
    trackEvent("login_completed", { provider: "email" });
    expect(ph.identify.mock.calls.map((c) => c[0])).toEqual(["A", "B"]);
    expect(ph.reset.mock.invocationCallOrder[0]).toBeLessThan(ph.identify.mock.invocationCallOrder[1]);
    expect(eventsOf("login_completed")[0][1]).toMatchObject({ is_authenticated: true });
  });
});
