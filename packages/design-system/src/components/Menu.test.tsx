import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Button } from "./Button";
import { Menu, MenuItem, MenuLabel } from "./Menu";

function renderMenu(onSelect: () => void) {
  return render(
    <div>
      <button type="button">Ailleurs sur la page</button>
      <Menu label="Menu utilisateur" trigger={<Button>Ouvrir</Button>}>
        <MenuLabel>gestionnaire</MenuLabel>
        <MenuItem onSelect={onSelect}>Se déconnecter</MenuItem>
      </Menu>
    </div>,
  );
}

describe("Menu", () => {
  it("is closed by default and opens on trigger click", () => {
    renderMenu(() => {});
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));

    expect(screen.getByRole("menu", { name: "Menu utilisateur" })).toBeTruthy();
  });

  it("focuses the first menu item when it opens", async () => {
    renderMenu(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Se déconnecter" })));
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    renderMenu(() => {});
    const trigger = screen.getByRole("button", { name: "Ouvrir" });
    fireEvent.click(trigger);
    await screen.findByRole("menu");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("closes on an outside click and returns focus to the trigger", async () => {
    renderMenu(() => {});
    const trigger = screen.getByRole("button", { name: "Ouvrir" });
    fireEvent.click(trigger);
    await screen.findByRole("menu");

    fireEvent.mouseDown(screen.getByRole("button", { name: "Ailleurs sur la page" }));

    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("moves focus between items with ArrowDown/ArrowUp", async () => {
    render(
      <Menu label="Menu" trigger={<Button>Ouvrir</Button>}>
        <MenuItem onSelect={() => {}}>Un</MenuItem>
        <MenuItem onSelect={() => {}}>Deux</MenuItem>
      </Menu>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Un" })));

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Deux" }));

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Un" })); // wraps around

    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Deux" }));
  });

  it("activates an item, runs its handler, closes the menu and returns focus", async () => {
    const onSelect = vi.fn();
    renderMenu(onSelect);
    const trigger = screen.getByRole("button", { name: "Ouvrir" });
    fireEvent.click(trigger);
    await screen.findByRole("menu");

    fireEvent.click(screen.getByRole("menuitem", { name: "Se déconnecter" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("does not require MenuLabel content to be reachable by arrow navigation", async () => {
    renderMenu(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    await screen.findByRole("menu");
    // Only one menuitem exists ("Se déconnecter") even though MenuLabel
    // ("gestionnaire") is also rendered inside the panel.
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });
});
