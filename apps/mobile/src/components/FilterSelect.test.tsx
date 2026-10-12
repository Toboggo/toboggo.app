import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { FilterSelect } from "./FilterSelect";

const options = [
  { value: "all", label: "Tous types" },
  { value: "review", label: "Avis" },
];

describe("FilterSelect", () => {
  it("la valeur par défaut est neutre, une autre valeur est active", () => {
    const { container, rerender } = render(<FilterSelect value="all" options={options} onChange={() => {}} ariaLabel="Type" />);
    expect(container.firstElementChild!.hasAttribute("data-active")).toBe(false);
    rerender(<FilterSelect value="review" options={options} onChange={() => {}} ariaLabel="Type" />);
    expect(container.firstElementChild!.getAttribute("data-active")).toBe("1");
  });

  it("l'anneau de focus est coupé après un appui et rendu dès qu'une touche est utilisée", () => {
    const { container, getByLabelText } = render(<FilterSelect value="all" options={options} onChange={() => {}} ariaLabel="Type" />);
    const chip = container.firstElementChild!;
    const select = getByLabelText("Type");
    fireEvent.pointerDown(select);
    expect(chip.getAttribute("data-pointer")).toBe("1");
    fireEvent.keyDown(select, { key: "Tab" });
    expect(chip.hasAttribute("data-pointer")).toBe(false);
    fireEvent.pointerDown(select);
    fireEvent.blur(select);
    expect(chip.hasAttribute("data-pointer")).toBe(false);
  });
});
