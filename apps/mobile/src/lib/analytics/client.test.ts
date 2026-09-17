import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { isAnalyticsConfigured as IsAnalyticsConfigured, trackEvent as TrackEvent } from "./client";
import type { registerIsAuthenticated as RegisterIsAuthenticated } from "./commonProperties";

const { initMock, captureMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  captureMock: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: {
    init: initMock,
    capture: captureMock,
  },
}));

// `client.ts` memoizes its PostHog client in a module-level variable (and
// `commonProperties.ts` its `is_authenticated` source), so each test needs a
// fresh module instance — otherwise state set by an earlier test would leak
// into a later one. `vi.resetModules()` + a fresh dynamic import gives every
// test its own isolated singletons, independent of declaration order.
let isAnalyticsConfigured: typeof IsAnalyticsConfigured;
let trackEvent: typeof TrackEvent;
let registerIsAuthenticated: typeof RegisterIsAuthenticated;

beforeEach(async () => {
  vi.resetModules();
  ({ isAnalyticsConfigured, trackEvent } = await import("./client"));
  ({ registerIsAuthenticated } = await import("./commonProperties"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  initMock.mockClear();
  captureMock.mockClear();
});

describe("isAnalyticsConfigured", () => {
  it("is false with no env vars — the default for local dev, CI, Simulator and Claude Code sessions", () => {
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it("is false if only VITE_POSTHOG_KEY is set", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it("is false if only VITE_POSTHOG_HOST is set", () => {
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it("is true once both vars are set and non-blank", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
    expect(isAnalyticsConfigured()).toBe(true);
  });

  it("treats a blank/whitespace-only value as not configured", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "   ");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
    expect(isAnalyticsConfigured()).toBe(false);
  });
});

describe("trackEvent — no-op without configuration", () => {
  it("never initializes nor calls posthog.capture when unconfigured", () => {
    trackEvent("app_opened", {});
    expect(initMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("stays a no-op across multiple calls and event types", () => {
    trackEvent("park_viewed", {
      park_id: "p1",
      discovery_source: "map_marker",
      has_photos: true,
      has_reviews: false,
      distance_bucket: "<1km",
    });
    trackEvent("contribution_completed", {
      contribution_type: "add_park",
      had_just_in_time_auth: true,
    });
    expect(initMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("route_requested is never called from anywhere in a no-op environment (sanity check on the abstraction itself)", () => {
    // route_requested is intentionally NOT instrumented in any screen at this
    // phase (Directions.tsx is still a mock) — this only asserts the
    // abstraction itself stays a no-op if it ever were called, it does not
    // scan the codebase (see the repo-wide grep in the final report instead).
    trackEvent("route_requested", { park_id: "p1", transport_mode: "walk" });
    expect(captureMock).not.toHaveBeenCalled();
  });
});

describe("trackEvent — allowlist filtering once configured", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
  });

  it("initializes the client exactly once even across several trackEvent calls", () => {
    trackEvent("app_opened", {});
    trackEvent("app_opened", {});
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it("forwards only the declared allowlist keys for the event, dropping anything else", () => {
    trackEvent("park_viewed", {
      park_id: "p1",
      discovery_source: "map_marker",
      has_photos: true,
      has_reviews: false,
      distance_bucket: "<1km",
      // Simule un spread accidentel d'un objet plus large (ex. `...profile`) :
      // TypeScript ne bloque pas toujours ce cas (le spread contourne la
      // vérification des propriétés en excès) — c'est exactement ce que le
      // filtrage runtime de `client.ts` doit intercepter.
      ...({ email: "not-allowed@example.com", child_name: "Léo" } as Record<string, unknown>),
    });

    expect(captureMock).toHaveBeenCalledTimes(1);
    const [eventName, sentProps] = captureMock.mock.calls[0];
    expect(eventName).toBe("park_viewed");
    expect(sentProps).toMatchObject({
      park_id: "p1",
      discovery_source: "map_marker",
      has_photos: true,
      has_reviews: false,
      distance_bucket: "<1km",
    });
    expect(sentProps).not.toHaveProperty("email");
    expect(sentProps).not.toHaveProperty("child_name");
  });

  it("omits optional properties the caller didn't provide, rather than sending them as undefined", () => {
    trackEvent("contribution_completed", {
      contribution_type: "review",
      had_just_in_time_auth: false,
    });

    const [, sentProps] = captureMock.mock.calls[0];
    expect(sentProps).not.toHaveProperty("park_id");
    expect(sentProps).not.toHaveProperty("has_photo");
    expect(sentProps).toMatchObject({
      contribution_type: "review",
      had_just_in_time_auth: false,
    });
  });
});

describe("trackEvent — common properties (is_authenticated / app_version / locale)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
  });

  it("attaches is_authenticated: false when registerIsAuthenticated was never called (safe default)", () => {
    trackEvent("app_opened", {});
    const [, sentProps] = captureMock.mock.calls[0];
    expect(sentProps).toMatchObject({ is_authenticated: false });
  });

  it("attaches is_authenticated: false when the registered getter reports no session", () => {
    registerIsAuthenticated(() => false);
    trackEvent("app_opened", {});
    const [, sentProps] = captureMock.mock.calls[0];
    expect(sentProps).toMatchObject({ is_authenticated: false });
  });

  it("attaches is_authenticated: true (a plain boolean, never the userId itself) when a session exists", () => {
    // Simule ce que `session.ts` enregistre réellement : une closure qui
    // relit l'état courant, jamais une valeur figée au moment de l'inscription.
    registerIsAuthenticated(() => true);
    trackEvent("app_opened", {});
    const [, sentProps] = captureMock.mock.calls[0];
    expect(sentProps).toMatchObject({ is_authenticated: true });
    expect(sentProps).not.toHaveProperty("userId");
    expect(JSON.stringify(sentProps)).not.toContain("user-123");
  });

  it("attaches app_version and locale as plain strings, never PII", () => {
    trackEvent("app_opened", {});
    const [, sentProps] = captureMock.mock.calls[0];
    expect(typeof sentProps.app_version).toBe("string");
    expect(typeof sentProps.locale).toBe("string");
    expect(sentProps).not.toHaveProperty("email");
    expect(sentProps).not.toHaveProperty("name");
  });

  it("never lets a common property be overridden by a spread of arbitrary caller data", () => {
    registerIsAuthenticated(() => true);
    trackEvent(
      "app_opened",
      // @ts-expect-error — same "excess via spread" scenario as the allowlist test above.
      { ...({ is_authenticated: "not-a-boolean", email: "leak@example.com" } as Record<string, unknown>) },
    );
    const [, sentProps] = captureMock.mock.calls[0];
    expect(sentProps.is_authenticated).toBe(true);
    expect(sentProps).not.toHaveProperty("email");
  });

  it("re-invokes the registered getter on every trackEvent call — never caches the value at registration time", () => {
    let mutableFlag = false;
    registerIsAuthenticated(() => mutableFlag);

    trackEvent("app_opened", {});
    expect(captureMock.mock.calls[0][1]).toMatchObject({ is_authenticated: false });

    mutableFlag = true; // e.g. session.ts's userId just changed
    trackEvent("app_opened", {});
    expect(captureMock.mock.calls[1][1]).toMatchObject({ is_authenticated: true });
  });
});
