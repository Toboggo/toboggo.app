import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { initMock } = vi.hoisted(() => ({ initMock: vi.fn() }));
vi.mock("posthog-js", () => ({
  default: { init: initMock, capture: vi.fn() },
}));

// @posthog/react's PostHogProvider needs a real PostHog context — if it ever
// gets mounted unexpectedly (i.e. the no-op path is broken), fail loudly and
// visibly rather than silently rendering something that happens to work.
vi.mock("@posthog/react", () => ({
  PostHogProvider: () => {
    throw new Error("PostHogProvider must not be mounted when PostHog isn't configured");
  },
}));

import { AnalyticsProvider } from "./AnalyticsProvider";

afterEach(() => {
  vi.unstubAllEnvs();
  initMock.mockClear();
});

describe("AnalyticsProvider — no-op without configuration", () => {
  it("renders children directly, without mounting PostHogProvider or calling posthog.init", () => {
    render(
      <AnalyticsProvider>
        <div data-testid="child">hello</div>
      </AnalyticsProvider>,
    );
    expect(screen.getByTestId("child").textContent).toBe("hello");
    expect(initMock).not.toHaveBeenCalled();
  });
});
