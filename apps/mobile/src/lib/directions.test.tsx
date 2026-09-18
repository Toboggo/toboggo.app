import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import "../i18n/testInit";
import { useOpenDirections } from "./directions";

const toasts = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock("./toast", () => ({
  useToastStore: (sel?: (s: unknown) => unknown) => {
    const s = { show: (m: string) => toasts.list.push(m) };
    return sel ? sel(s) : s;
  },
}));

const visits = vi.hoisted(() => ({ calls: [] as Array<[string, string]> }));
vi.mock("./visitPrompt", () => ({
  useVisitPrompt: (sel?: (s: unknown) => unknown) => {
    const s = { schedule: (parkId: string, parkName: string) => visits.calls.push([parkId, parkName]) };
    return sel ? sel(s) : s;
  },
}));

describe("useOpenDirections", () => {
  // `Location.assign` is spec-"unforgeable" (own, non-configurable) in jsdom —
  // `vi.spyOn` can't touch it, so the whole `window.location` is swapped for a
  // plain mock object instead, same pattern in all 3 test files below.
  let originalLocation: Location;

  beforeEach(() => {
    toasts.list = [];
    visits.calls = [];
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  it("valid coordinates: navigates the current tab to the external maps URL and schedules the visit prompt, no toast", () => {
    const { result } = renderHook(() => useOpenDirections());
    result.current({ id: "p1", latitude: 45.764, longitude: 4.8357 }, "Square Voltaire");

    // Same-tab navigation (`location.assign`), never `window.open(..., "_blank")` —
    // a new tab is exactly what left a blank tab behind on iOS after the
    // maps.apple.com universal link handed off to the Apple Maps app.
    expect(window.location.assign).toHaveBeenCalledTimes(1);
    const [url] = (window.location.assign as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/^https:\/\/(maps\.apple\.com|www\.google\.com\/maps\/dir)\//);
    expect(visits.calls).toEqual([["p1", "Square Voltaire"]]);
    expect(toasts.list).toEqual([]);
  });

  it("missing coordinates: shows a toast, never navigates, never crashes", () => {
    const { result } = renderHook(() => useOpenDirections());
    expect(() => result.current({ id: "p1", latitude: null, longitude: null }, "Square Voltaire")).not.toThrow();

    expect(window.location.assign).not.toHaveBeenCalled();
    expect(visits.calls).toEqual([]);
    expect(toasts.list).toEqual(["Itinéraire indisponible : coordonnées du parc manquantes."]);
  });

  it("(0, 0) coordinates: treated as invalid, same as missing", () => {
    const { result } = renderHook(() => useOpenDirections());
    result.current({ id: "p1", latitude: 0, longitude: 0 }, "Square Voltaire");

    expect(window.location.assign).not.toHaveBeenCalled();
    expect(toasts.list).toEqual(["Itinéraire indisponible : coordonnées du parc manquantes."]);
  });

  it("out-of-range coordinates: treated as invalid", () => {
    const { result } = renderHook(() => useOpenDirections());
    result.current({ id: "p1", latitude: 91, longitude: 4.8357 }, "Square Voltaire");

    expect(window.location.assign).not.toHaveBeenCalled();
    expect(toasts.list).toEqual(["Itinéraire indisponible : coordonnées du parc manquantes."]);
  });
});
