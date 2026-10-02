import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterBar } from "./FilterBar";

describe("FilterBar — Admin-UI-7B (layout-only primitive)", () => {
  it("renders its filter children", () => {
    render(
      <FilterBar>
        <input aria-label="Recherche" />
      </FilterBar>,
    );
    expect(screen.getByLabelText("Recherche")).toBeTruthy();
  });

  it("renders actions only when provided", () => {
    const { rerender } = render(
      <FilterBar>
        <span>filtre</span>
      </FilterBar>,
    );
    expect(screen.queryByRole("button", { name: "Exporter" })).toBeNull();

    rerender(
      <FilterBar actions={<button type="button">Exporter</button>}>
        <span>filtre</span>
      </FilterBar>,
    );
    expect(screen.getByRole("button", { name: "Exporter" })).toBeTruthy();
  });
});
