import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { initMock, captureMock, identifyMock, resetMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  captureMock: vi.fn(),
  identifyMock: vi.fn(),
  resetMock: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: { init: initMock, capture: captureMock, identify: identifyMock, reset: resetMock },
}));

type Client = typeof import("./client");
let client: Client;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
  vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
  vi.stubEnv("VITE_APP_ENV", "production");
  client = await import("./client");
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const m of [initMock, captureMock, identifyMock, resetMock]) m.mockClear();
});

describe("identifyAnalyticsUser / resetAnalyticsIdentity", () => {
  it("anonymous: no identify until a user is known; events are is_authenticated:false", () => {
    client.trackEvent("app_opened", {});
    expect(identifyMock).not.toHaveBeenCalled();
    expect(captureMock.mock.calls[0][1]).toMatchObject({ is_authenticated: false });
  });

  it("identifies with the Supabase UUID ONLY — no properties, no PII", () => {
    client.identifyAnalyticsUser("11111111-2222-3333-4444-555555555555");
    expect(identifyMock).toHaveBeenCalledTimes(1);
    expect(identifyMock.mock.calls[0]).toEqual(["11111111-2222-3333-4444-555555555555"]);
  });

  it("is idempotent: same user again (restore + SIGNED_IN + TOKEN_REFRESHED) → one identify", () => {
    client.identifyAnalyticsUser("u1");
    client.identifyAnalyticsUser("u1");
    client.identifyAnalyticsUser("u1");
    expect(identifyMock).toHaveBeenCalledTimes(1);
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("a reload (fresh module, same user) identifies the same id again → same person", async () => {
    client.identifyAnalyticsUser("u1");
    vi.resetModules();
    const reloaded = await import("./client");
    reloaded.identifyAnalyticsUser("u1");
    expect(identifyMock.mock.calls.map((c) => c[0])).toEqual(["u1", "u1"]);
  });

  it("logout → reset() once; a second reset (or one when anonymous) is a no-op", () => {
    client.resetAnalyticsIdentity(); // anonymous: must not cut a guest's browsing identity
    expect(resetMock).not.toHaveBeenCalled();
    client.identifyAnalyticsUser("u1");
    client.resetAnalyticsIdentity();
    client.resetAnalyticsIdentity();
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("account A logout then B login → reset happens before identify(B); never A merged into B", () => {
    client.identifyAnalyticsUser("A");
    client.resetAnalyticsIdentity();
    client.identifyAnalyticsUser("B");
    expect(identifyMock.mock.calls.map((c) => c[0])).toEqual(["A", "B"]);
    expect(resetMock.mock.invocationCallOrder[0]).toBeLessThan(identifyMock.mock.invocationCallOrder[1]);
  });

  it("switch A → B without a logout event still resets between them", () => {
    client.identifyAnalyticsUser("A");
    client.identifyAnalyticsUser("B");
    expect(resetMock).toHaveBeenCalledTimes(1);
    expect(resetMock.mock.invocationCallOrder[0]).toBeLessThan(identifyMock.mock.invocationCallOrder[1]);
  });

  it("is_authenticated becomes true right after identify, and false again after reset", () => {
    client.identifyAnalyticsUser("u1");
    client.trackEvent("login_completed", { provider: "email" });
    expect(captureMock.mock.calls[0][1]).toMatchObject({ is_authenticated: true });
    client.resetAnalyticsIdentity();
    client.trackEvent("app_opened", {});
    expect(captureMock.mock.calls[1][1]).toMatchObject({ is_authenticated: false });
  });

  it("login_completed / signup_completed are captured AFTER identify (attributable to the user)", () => {
    client.identifyAnalyticsUser("u1");
    client.trackEvent("signup_completed", { provider: "google", entry_point: "splash" });
    expect(identifyMock.mock.invocationCallOrder[0]).toBeLessThan(captureMock.mock.invocationCallOrder[0]);
  });

  it("is a total no-op when analytics is not configured", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    const off = await import("./client");
    off.identifyAnalyticsUser("u1");
    off.resetAnalyticsIdentity();
    expect(initMock).not.toHaveBeenCalled();
    expect(identifyMock).not.toHaveBeenCalled();
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("URL sanitisation (LOT 1) is still wired", () => {
    client.trackEvent("app_opened", {});
    const cfg = initMock.mock.calls[0][1] as { before_send: (cr: unknown) => { properties: Record<string, string> } };
    const out = cfg.before_send({ uuid: "u", event: "x", properties: { $current_url: "https://a.test/#access_token=AAA" } });
    expect(out.properties.$current_url).toBe("https://a.test/");
  });
});
