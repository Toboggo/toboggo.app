import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import "../i18n/testInit";
import { FitBadgeRow } from "./FitBadgeRow";
import { ParkBadge } from "./ParkBadge";

const items = ["age", "Clôturé", "Ombragé", "WC"].map((k) => ({
  key: k,
  node: <ParkBadge variant={k === "age" ? "age" : "present"} label={k === "age" ? "1–12 ans" : k} />,
}));

function mockLayout(avail: number, itemW: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width: itemW, height: 20, top: 0, left: 0, right: itemW, bottom: 20, x: 0, y: 0, toJSON() {} }) as DOMRect,
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(avail);
}
afterEach(() => vi.restoreAllMocks());

describe("FitBadgeRow", () => {
  it("tout tient → aucun « +N »", () => {
    mockLayout(400, 50);
    const { container } = render(<FitBadgeRow pinned={1} items={items} />);
    expect(container.textContent).toBe("1–12 ansClôturéOmbragéWC");
  });

  it("rien d'autre ne tient → l'âge reste, « +N » compte les caractéristiques masquées (pas l'âge)", () => {
    mockLayout(140, 50);
    const { container, getByRole } = render(<FitBadgeRow pinned={1} items={items} />);
    expect(container.textContent).toBe("1–12 ans+3");
    expect(getByRole("img", { name: /3 caractéristiques supplémentaires dans la fiche/ })).toBeTruthy();
  });

  it("une partie tient → badges visibles puis « +N » du reste", () => {
    mockLayout(190, 50); // âge + 1 badge (100) + « +2 » (50) = 150 ≤ 190 ; 3 badges + « +1 » = 200 > 190
    const { container } = render(<FitBadgeRow pinned={1} items={items} />);
    expect(container.textContent).toBe("1–12 ansClôturé+2");
  });

  it("un seul badge masqué → libellé au singulier", () => {
    mockLayout(90, 50);
    const { container, getByRole } = render(<FitBadgeRow pinned={1} items={items.slice(0, 2)} />);
    expect(container.textContent).toBe("1–12 ans+1");
    expect(getByRole("img", { name: /^1 caractéristique supplémentaire dans la fiche$/ })).toBeTruthy();
  });
});
