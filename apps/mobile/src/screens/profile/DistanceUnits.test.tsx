import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../../i18n/testInit";
import { renderHook } from "@testing-library/react";
import { DISTANCE_UNIT_STORAGE_KEY, useDistanceUnitStore } from "../../lib/distanceUnit";
import { useFormat } from "../../i18n/useFormat";
import DistanceUnits from "./DistanceUnits";

beforeEach(() => {
  localStorage.clear();
  useDistanceUnitStore.setState({ preference: "auto" });
});

describe("Unités de distance", () => {
  it("offers Automatique / Kilomètres / Miles, Automatique selected by default", () => {
    render(<MemoryRouter><DistanceUnits /></MemoryRouter>);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Automatique"),
      "Kilomètres",
      "Miles",
    ]);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
  });

  it("choosing Miles persists, converts every formatted distance, and Kilomètres restores it", () => {
    render(<MemoryRouter><DistanceUnits /></MemoryRouter>);
    const { result } = renderHook(() => useFormat());
    expect(result.current.distance(2000)).toBe("2 km");

    fireEvent.click(screen.getByRole("radio", { name: "Miles" }));
    expect(localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY)).toBe("mi");
    expect(screen.getByRole("radio", { name: "Miles" }).getAttribute("aria-checked")).toBe("true");
    const miles = renderHook(() => useFormat());
    expect(miles.result.current.distance(2000)).toBe("1,2 mi");
    expect(miles.result.current.distance(5000)).toBe("3,1 mi");

    fireEvent.click(screen.getByRole("radio", { name: "Kilomètres" }));
    expect(renderHook(() => useFormat()).result.current.distance(2000)).toBe("2 km");
  });
});
