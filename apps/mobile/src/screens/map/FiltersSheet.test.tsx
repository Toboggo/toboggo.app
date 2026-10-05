import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../../i18n/testInit";
import { FiltersSheet } from "./FiltersSheet";
import { useFilters } from "../../lib/filters";

describe("FiltersSheet", () => {
  beforeEach(() => {
    useFilters.getState().reset();
  });

  it("ne rend rien fermé", () => {
    render(<FiltersSheet open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("affiche les sections et les 7 équipements en boutons à bascule", () => {
    render(<FiltersSheet open onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Filtres" })).toBeTruthy();
    expect(screen.getByText("Âge des enfants")).toBeTruthy();
    expect(screen.getByText("Disponibilité")).toBeTruthy();
    expect(screen.getByText("Équipements et accès")).toBeTruthy();
    for (const label of ["Toilettes", "Ombragé", "Clôturé", "Accessibilité", "Bancs", "Point d’eau", "Parking"]) {
      expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("garde la logique : bascule d'un équipement et de « Ouvert maintenant »", () => {
    render(<FiltersSheet open onClose={() => {}} />);
    const wc = screen.getByRole("button", { name: "Toilettes" });
    fireEvent.click(wc);
    expect(useFilters.getState().amenities.wc).toBe(true);
    expect(wc.getAttribute("aria-pressed")).toBe("true");

    const sw = screen.getByRole("switch", { name: "Ouvert maintenant" });
    fireEvent.click(sw);
    expect(useFilters.getState().openNow).toBe(true);
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("Réinitialiser remet les filtres, « Voir les résultats » et la croix ferment", () => {
    const onClose = vi.fn();
    render(<FiltersSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Bancs" }));
    fireEvent.change(screen.getByLabelText("Âge minimum"), { target: { value: "3" } });
    expect(useFilters.getState().activeCount()).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expect(useFilters.getState().activeCount()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Voir les résultats" }));
    fireEvent.click(screen.getByRole("button", { name: "Fermer les filtres" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
