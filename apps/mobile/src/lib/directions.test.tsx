import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import "../i18n/testInit";
import { useDirections } from "./directions";

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

describe("useDirections", () => {
  // `Location.assign` is spec-"unforgeable" (own, non-configurable) in jsdom —
  // `vi.spyOn` can't touch it, so the whole `window.location` is swapped for a
  // plain mock object instead.
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

  it("valid coordinates: opens the sheet, no toast, no navigation yet", () => {
    const { result } = renderHook(() => useDirections());
    act(() => {
      result.current.openDirections({ id: "p1", latitude: 45.764, longitude: 4.8357 }, "Square Voltaire");
    });

    expect(result.current.directionsSheetProps.open).toBe(true);
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(visits.calls).toEqual([]);
    expect(toasts.list).toEqual([]);
  });

  it("choosing a provider: schedules the visit prompt, navigates the current tab, closes the sheet", () => {
    const { result } = renderHook(() => useDirections());
    act(() => {
      result.current.openDirections({ id: "p1", latitude: 45.764, longitude: 4.8357 }, "Square Voltaire");
    });
    act(() => {
      result.current.directionsSheetProps.onChoose("waze");
    });

    expect(window.location.assign).toHaveBeenCalledTimes(1);
    const [url] = (window.location.assign as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://waze.com/ul?ll=45.764%2C4.8357&navigate=yes");
    expect(visits.calls).toEqual([["p1", "Square Voltaire"]]);
    expect(result.current.directionsSheetProps.open).toBe(false);
  });

  it("choosing Apple Maps builds the right URL", () => {
    const { result } = renderHook(() => useDirections());
    act(() => {
      result.current.openDirections({ id: "p1", latitude: 45.764, longitude: 4.8357 }, "Square Voltaire");
    });
    act(() => {
      result.current.directionsSheetProps.onChoose("apple");
    });

    expect(window.location.assign).toHaveBeenCalledWith("https://maps.apple.com/?daddr=45.764%2C4.8357");
  });

  it("closing the sheet without choosing: no navigation, no visit prompt", () => {
    const { result } = renderHook(() => useDirections());
    act(() => {
      result.current.openDirections({ id: "p1", latitude: 45.764, longitude: 4.8357 }, "Square Voltaire");
    });
    act(() => {
      result.current.directionsSheetProps.onClose();
    });

    expect(window.location.assign).not.toHaveBeenCalled();
    expect(visits.calls).toEqual([]);
    expect(result.current.directionsSheetProps.open).toBe(false);
  });

  it("missing coordinates: shows a toast, sheet never opens, never crashes", () => {
    const { result } = renderHook(() => useDirections());
    expect(() =>
      act(() => {
        result.current.openDirections({ id: "p1", latitude: null, longitude: null }, "Square Voltaire");
      }),
    ).not.toThrow();

    expect(result.current.directionsSheetProps.open).toBe(false);
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(visits.calls).toEqual([]);
    expect(toasts.list).toEqual(["Itinéraire indisponible : coordonnées du parc manquantes."]);
  });

  it("(0, 0) coordinates: treated as invalid, same as missing", () => {
    const { result } = renderHook(() => useDirections());
    act(() => {
      result.current.openDirections({ id: "p1", latitude: 0, longitude: 0 }, "Square Voltaire");
    });

    expect(result.current.directionsSheetProps.open).toBe(false);
    expect(toasts.list).toEqual(["Itinéraire indisponible : coordonnées du parc manquantes."]);
  });
});
