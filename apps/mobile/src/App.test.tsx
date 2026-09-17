import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "./i18n/testInit";
import App from "./App";

const trackEventMock = vi.hoisted(() => vi.fn());
vi.mock("./lib/analytics", () => ({
  trackEvent: trackEventMock,
  registerIsAuthenticated: vi.fn(),
}));

// `App.tsx` imports every screen statically (no route-based code-splitting),
// so simply importing `App` — regardless of which route is rendered — pulls
// in `MapExplore` → `MapCanvas` → `maplibre-gl`, which touches
// `window.URL.createObjectURL` at its own module top level. jsdom doesn't
// implement it; stub the whole library out (this test never renders the map).
vi.mock("maplibre-gl", () => ({
  default: {
    Map: vi.fn(),
    NavigationControl: vi.fn(),
    Marker: vi.fn(),
    setWorkerUrl: vi.fn(),
  },
}));

// Node's built-in `fetch` rejects a relative URL like `/icons-sprite.svg`
// (`useIconSprite()`, packages/design-system, calls it on mount) — jsdom
// provides no base URL for it to resolve against. Harmless to this test
// (the effect catches the failure), stubbed only to keep output clean.
vi.spyOn(globalThis, "fetch").mockResolvedValue({ text: () => Promise.resolve("") } as Response);

/**
 * Revalidation explicite (pas une hypothèse) : `React.StrictMode` en dev
 * double-invoque les effets (mount → cleanup → mount) sur la MÊME instance
 * de composant — les refs ne sont PAS réinitialisées entre les deux passes
 * (contrairement à un vrai démontage/remontage). Le garde `useRef` de
 * `app_opened` dans `App.tsx` doit donc survivre ce double-invoke et ne
 * tracker qu'une seule fois, même sous StrictMode.
 */
describe("App — app_opened semantics under React.StrictMode", () => {
  it("tracks app_opened exactly once, even with StrictMode's dev-only double effect invocation", () => {
    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
      </React.StrictMode>,
    );

    const appOpenedCalls = trackEventMock.mock.calls.filter((c) => c[0] === "app_opened");
    expect(appOpenedCalls).toHaveLength(1);
    expect(appOpenedCalls[0]).toEqual(["app_opened", {}]);
  });

  it("does NOT track a second app_opened if the app re-renders for an unrelated reason", () => {
    const { rerender } = render(
      <React.StrictMode>
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
      </React.StrictMode>,
    );
    trackEventMock.mockClear();

    // An unrelated re-render (e.g. a parent re-rendering) must not remount
    // App nor re-run its mount-only effects.
    rerender(
      <React.StrictMode>
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
      </React.StrictMode>,
    );

    expect(trackEventMock.mock.calls.filter((c) => c[0] === "app_opened")).toHaveLength(0);
  });
});
