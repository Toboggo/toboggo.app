import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Tabs, TabPanel } from "./Tabs";

const items = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
  { value: "c", label: "Charlie" },
];

function setup(initial: string, spy = vi.fn()) {
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <>
        <Tabs
          items={items}
          value={value}
          onValueChange={(v) => {
            spy(v);
            setValue(v);
          }}
          label="Sections"
          idBase="t"
        />
        {items.map((it) => (
          <TabPanel key={it.value} idBase="t" value={it.value} active={it.value === value}>
            Contenu {it.label}
          </TabPanel>
        ))}
      </>
    );
  }
  const utils = render(<Harness />);
  return { ...utils, onValueChange: spy };
}

describe("Tabs", () => {
  it("exposes a labelled tablist with one tab per item", () => {
    setup("a");
    const list = screen.getByRole("tablist", { name: "Sections" });
    expect(list).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("marks only the active tab selected and keeps it in the tab order (roving tabindex)", () => {
    setup("b");
    const [a, b, c] = screen.getAllByRole("tab");
    expect(a.getAttribute("aria-selected")).toBe("false");
    expect(b.getAttribute("aria-selected")).toBe("true");
    expect(a.getAttribute("tabindex")).toBe("-1");
    expect(b.getAttribute("tabindex")).toBe("0");
    expect(c.getAttribute("tabindex")).toBe("-1");
  });

  it("ties each tab to its panel and hides inactive panels", () => {
    setup("a");
    const tab = screen.getAllByRole("tab")[0];
    const panel = screen.getByRole("tabpanel");
    expect(tab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
    // only the active panel is exposed
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByText("Contenu Alpha")).toBeTruthy();
  });

  it("calls onValueChange on click of an unselected tab, not the selected one", () => {
    const { onValueChange } = setup("a");
    fireEvent.click(screen.getByRole("tab", { name: "Bravo" }));
    expect(onValueChange).toHaveBeenCalledWith("b");
    onValueChange.mockClear();
    fireEvent.click(screen.getByRole("tab", { name: "Bravo" })); // now the selected one
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("moves selection with ArrowRight / ArrowLeft (wrapping) and Home / End", () => {
    const { onValueChange } = setup("a");
    const list = screen.getByRole("tablist");
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onValueChange).toHaveBeenLastCalledWith("b");
    fireEvent.keyDown(list, { key: "ArrowRight" });
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onValueChange).toHaveBeenLastCalledWith("a"); // wraps c -> a
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(onValueChange).toHaveBeenLastCalledWith("c"); // wraps a -> c
    fireEvent.keyDown(list, { key: "Home" });
    expect(onValueChange).toHaveBeenLastCalledWith("a");
    fireEvent.keyDown(list, { key: "End" });
    expect(onValueChange).toHaveBeenLastCalledWith("c");
  });
});
