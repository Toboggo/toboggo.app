import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { isAnalyticsConfigured as IsAnalyticsConfigured, trackEvent as TrackEvent } from "./client";

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

// `client.ts` memoizes its PostHog client in a module-level variable, so each
// test needs a fresh module instance — otherwise a `client` set by an earlier
// "configured" test would leak into a later one (e.g. an init-count
// assertion). `vi.resetModules()` + a fresh dynamic import gives every test
// its own isolated singleton, independent of declaration order.
let isAnalyticsConfigured: typeof IsAnalyticsConfigured;
let trackEvent: typeof TrackEvent;

beforeEach(async () => {
  vi.resetModules();
  ({ isAnalyticsConfigured, trackEvent } = await import("./client"));
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
    expect(sentProps).toEqual({
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
    expect(sentProps).toEqual({
      contribution_type: "review",
      had_just_in_time_auth: false,
    });
  });
});
