import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { Park } from "@toboggo/shared";
import "../../i18n/testInit";
import { FakeMap } from "./FakeMap";

function park(id: string, name: string): Park & { distance_m?: number } {
  return { id, name, latitude: 45.764, longitude: 4.8357, rating: 0 } as Park & { distance_m?: number };
}

const PARKS = [park("p1", "Square Voltaire"), park("p2", "Parc de la Tête d'Or")];

describe("FakeMap — background tap vs. pin tap", () => {
  it("a tap on the backdrop fires onBackgroundTap, not onSelect", () => {
    const onSelect = vi.fn();
    const onBackgroundTap = vi.fn();
    const { container } = render(
      <FakeMap parks={PARKS} selectedId={null} onSelect={onSelect} onBackgroundTap={onBackgroundTap} />,
    );

    fireEvent.click(container.querySelector('[class*="map"]') as Element);

    expect(onBackgroundTap).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("a tap on a pin fires onSelect, not onBackgroundTap", () => {
    const onSelect = vi.fn();
    const onBackgroundTap = vi.fn();
    const { getByLabelText } = render(
      <FakeMap parks={PARKS} selectedId={null} onSelect={onSelect} onBackgroundTap={onBackgroundTap} />,
    );

    fireEvent.click(getByLabelText("Square Voltaire"));

    expect(onSelect).toHaveBeenCalledWith("p1");
    expect(onBackgroundTap).not.toHaveBeenCalled();
  });

  it("switching from one pin to another never fires onBackgroundTap", () => {
    const onSelect = vi.fn();
    const onBackgroundTap = vi.fn();
    const { getByLabelText } = render(
      <FakeMap parks={PARKS} selectedId="p1" onSelect={onSelect} onBackgroundTap={onBackgroundTap} />,
    );

    fireEvent.click(getByLabelText("Parc de la Tête d'Or"));

    expect(onSelect).toHaveBeenCalledWith("p2");
    expect(onBackgroundTap).not.toHaveBeenCalled();
  });

  it("with no onBackgroundTap handler, a backdrop tap does not throw", () => {
    const { container } = render(<FakeMap parks={PARKS} selectedId={null} onSelect={vi.fn()} />);
    expect(() => fireEvent.click(container.querySelector('[class*="map"]') as Element)).not.toThrow();
  });
});
