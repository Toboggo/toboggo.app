import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import "../../i18n/testInit";
import { FaceChoice } from "./FaceChoice";

afterEach(cleanup);

function Harness({ onValue }: { onValue: (v: number) => void }) {
  const [v, setV] = useState(2);
  return (
    <FaceChoice
      id="clean"
      label="Propreté"
      value={v}
      onChange={(n) => {
        setV(n);
        onValue(n);
      }}
    />
  );
}

describe("FaceChoice", () => {
  it("trois choix libellés « Mauvais / Moyen / Bon », groupe nommé par le critère, aucun emoji", () => {
    const { container } = render(<Harness onValue={() => undefined} />);
    const group = screen.getByRole("radiogroup", { name: "Propreté" });
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Mauvais", "Moyen", "Bon"]);
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    // Pictos décoratifs.
    container.querySelectorAll("svg").forEach((svg) => expect(svg.getAttribute("aria-hidden")).toBe("true"));
  });

  it("valeur par défaut 2 annoncée ; les choix émettent exactement 1, 2, 3", () => {
    const seen: number[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    expect(screen.getByRole("radio", { name: "Moyen" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Mauvais" }));
    fireEvent.click(screen.getByRole("radio", { name: "Bon" }));
    fireEvent.click(screen.getByRole("radio", { name: "Moyen" }));
    expect(seen).toEqual([1, 3, 2]);
  });

  it("la sélection se voit aussi par une coche (pas seulement la couleur) — une seule", () => {
    const { container } = render(<Harness onValue={() => undefined} />);
    const checks = () => container.querySelectorAll('[class*="check"]').length;
    expect(checks()).toBe(1);
    fireEvent.click(screen.getByRole("radio", { name: "Bon" }));
    expect(checks()).toBe(1);
    expect(within(screen.getByRole("radio", { name: "Bon" })).queryByText("", { selector: '[class*="check"]' })).toBeTruthy();
  });

  it("clavier : tabulation sur le choix actif, flèches déplacent choix et focus", () => {
    const seen = vi.fn();
    render(<Harness onValue={seen} />);
    const [bad, mid, good] = screen.getAllByRole("radio");
    expect([bad.tabIndex, mid.tabIndex, good.tabIndex]).toEqual([-1, 0, -1]);
    mid.focus();
    fireEvent.keyDown(mid, { key: "ArrowRight" });
    expect(seen).toHaveBeenLastCalledWith(3);
    expect(document.activeElement).toBe(good);
    fireEvent.keyDown(good, { key: "ArrowRight" }); // boucle
    expect(seen).toHaveBeenLastCalledWith(1);
    expect(document.activeElement).toBe(bad);
    fireEvent.keyDown(bad, { key: "ArrowLeft" });
    expect(seen).toHaveBeenLastCalledWith(3);
  });
});
