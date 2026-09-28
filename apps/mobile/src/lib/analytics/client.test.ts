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

// Un seul projet PostHog (Staging + Production) — les 3 variables (clé,
// host, environnement) doivent toutes être valides ensemble, jamais
// seulement 2 sur 3.
function stubFullyConfigured(environment: "staging" | "production" = "staging") {
  vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
  vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
  vi.stubEnv("VITE_APP_ENV", environment);
}

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

  it("is false if VITE_POSTHOG_KEY and VITE_POSTHOG_HOST are set but VITE_APP_ENV is absent", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it("is false if VITE_APP_ENV is set to an invalid/misspelled value (never falls back to a default environment)", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
    vi.stubEnv("VITE_APP_ENV", "prod"); // typo/short form — must NOT be accepted
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it("is true once all three vars are set and valid, with VITE_APP_ENV=staging", () => {
    stubFullyConfigured("staging");
    expect(isAnalyticsConfigured()).toBe(true);
  });

  it("is true once all three vars are set and valid, with VITE_APP_ENV=production", () => {
    stubFullyConfigured("production");
    expect(isAnalyticsConfigured()).toBe(true);
  });

  it("treats a blank/whitespace-only value as not configured", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "   ");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
    vi.stubEnv("VITE_APP_ENV", "staging");
    expect(isAnalyticsConfigured()).toBe(false);
  });
});

describe("trackEvent — no-op without configuration", () => {
  it("never initializes nor calls posthog.capture when unconfigured", () => {
    trackEvent("app_opened", {});
    expect(initMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("stays a no-op when the key/host are valid but VITE_APP_ENV is absent", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
    trackEvent("app_opened", {});
    expect(initMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("stays a no-op when VITE_APP_ENV is set but invalid", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com");
    vi.stubEnv("VITE_APP_ENV", "not-a-real-environment");
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

  it("route_requested (real provider choice, lib/directions.ts) stays a no-op when unconfigured", () => {
    trackEvent("route_requested", { park_id: "p1", provider: "google_maps" });
    expect(captureMock).not.toHaveBeenCalled();
  });
});

describe("trackEvent — allowlist filtering once configured", () => {
  beforeEach(() => stubFullyConfigured());

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

describe("trackEvent — common properties (is_authenticated / app_version / locale / environment)", () => {
  beforeEach(() => stubFullyConfigured());

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

  it("attaches environment: 'staging' when VITE_APP_ENV=staging", () => {
    trackEvent("app_opened", {}); // stubFullyConfigured() default is "staging"
    const [, sentProps] = captureMock.mock.calls[0];
    expect(sentProps).toMatchObject({ environment: "staging" });
  });

  it("attaches environment: 'production' when VITE_APP_ENV=production", () => {
    vi.unstubAllEnvs();
    stubFullyConfigured("production");
    trackEvent("app_opened", {});
    const [, sentProps] = captureMock.mock.calls[0];
    expect(sentProps).toMatchObject({ environment: "production" });
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

  it("never lets a caller override environment, even via a spread of arbitrary data", () => {
    trackEvent(
      "app_opened",
      // @ts-expect-error — same "excess via spread" scenario as above: no event
      // in the taxonomy declares `environment` as one of its own properties,
      // so this can only reach the payload if the allowlist filter failed to
      // drop it.
      { ...({ environment: "production" } as Record<string, unknown>) },
    );
    const [, sentProps] = captureMock.mock.calls[0];
    // stubFullyConfigured() default is "staging" — if the caller's bogus
    // "production" leaked through, this would read "production" instead.
    expect(sentProps.environment).toBe("staging");
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
