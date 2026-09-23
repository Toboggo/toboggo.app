import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "../i18n/testInit";
import { VISIT_PROMPT_EXIT_MS, VISIT_PROMPT_SELECT_MS, VisitRatingPrompt } from "./VisitRatingPrompt";

function setup(open = true) {
  const onRate = vi.fn();
  const onClose = vi.fn();
  const root = document.createElement("div");
  root.id = "root";
  root.innerHTML = `<button>Itinéraire</button>`;
  document.body.appendChild(root);
  const utils = render(<VisitRatingPrompt open={open} onRate={onRate} onClose={onClose} />);
  return { onRate, onClose, root, ...utils };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.getElementById("root")?.remove();
});

describe("VisitRatingPrompt", () => {
  it("renders nothing while closed", () => {
    setup(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the centered dialog: illustration, title, description, 5 labelled stars, Plus tard, close", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Vous êtes allé à ce parc ?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Votre avis aide les autres parents à trouver les meilleurs lieux pour leurs enfants.")).toBeTruthy();
    const img = dialog.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/04-playground-scene\.svg/);
    for (const label of ["1 étoile", "2 étoiles", "3 étoiles", "4 étoiles", "5 étoiles"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Plus tard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fermer" })).toBeTruthy();
    // No big "Donner mon avis" CTA anymore — the stars are the CTA.
    expect(screen.queryByRole("button", { name: "Donner mon avis" })).toBeNull();
  });

  it("makes the page behind inert and moves focus into the dialog; restores both on unmount", () => {
    const { root, unmount } = setup();
    expect(root.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    unmount();
    expect(root.hasAttribute("inert")).toBe(false);
  });

  it("clicking the 4th star selects it then calls onRate(4), never onClose", () => {
    const { onRate, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "4 étoiles" }));
    expect(screen.getByRole("button", { name: "4 étoiles" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "3 étoiles" }).hasAttribute("data-lit")).toBe(true);
    expect(screen.getByRole("button", { name: "5 étoiles" }).hasAttribute("data-lit")).toBe(false);
    expect(onRate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(VISIT_PROMPT_SELECT_MS));
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith(4);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores further taps once a rating is picked", () => {
    const { onRate } = setup();
    fireEvent.click(screen.getByRole("button", { name: "2 étoiles" }));
    fireEvent.click(screen.getByRole("button", { name: "5 étoiles" }));
    act(() => vi.advanceTimersByTime(VISIT_PROMPT_SELECT_MS));
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith(2);
  });

  it.each([
    ["Plus tard", (/* */) => fireEvent.click(screen.getByRole("button", { name: "Plus tard" }))],
    ["the close button", () => fireEvent.click(screen.getByRole("button", { name: "Fermer" }))],
    ["Escape", () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })],
  ])("%s closes without rating", (_label, act_) => {
    const { onRate, onClose } = setup();
    act_();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRate).not.toHaveBeenCalled();
  });

  it("plays the exit animation, then unmounts, when closed from outside", () => {
    const { rerender, onRate, onClose, root } = setup();
    rerender(<VisitRatingPrompt open={false} onRate={onRate} onClose={onClose} />);
    expect(screen.getByTestId("visit-prompt-backdrop").getAttribute("data-state")).toBe("closing");
    act(() => vi.advanceTimersByTime(VISIT_PROMPT_EXIT_MS));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(root.hasAttribute("inert")).toBe(false);
  });

  it("traps Tab inside the dialog", () => {
    setup();
    const later = screen.getByRole("button", { name: "Plus tard" });
    later.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Fermer" }));
  });
});
