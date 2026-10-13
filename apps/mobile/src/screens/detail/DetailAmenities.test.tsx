import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../../i18n/testInit";
import DetailAmenities from "./DetailAmenities";

const view = (status: string, extra: Record<string, unknown> = {}) => ({ status, value: null, quantity: null, category: "service", verified_at: null, ...extra });
const park = {
  id: "p1",
  name: "Parc",
  wc: false,
  fenced: null,
  features: {
    toilets: view("unavailable", { verified_at: "2026-09-01" }),
    benches: view("unknown"),
    parking: view("temporarily_unavailable"),
    slide: view("available", { category: "play" }),
  },
  play_equipment: [],
};
vi.mock("../../lib/parksQuery", () => ({ usePark: () => ({ data: park }) }));

function setup() {
  return render(
    <MemoryRouter initialEntries={["/park/p1/amenities"]}>
      <Routes>
        <Route path="/park/:id/amenities" element={<DetailAmenities />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DetailAmenities — grille en deux colonnes, quatre états", () => {
  it("groupe présents / absents / temporairement indisponibles / non renseignés dans des listes en grille", () => {
    const { container } = setup();
    const titles = [...container.querySelectorAll("section h2")].map((h) => h.textContent);
    expect(titles).toEqual(["Présents", "Absents", "Temporairement indisponibles", "Non renseigné"]);
    expect(container.querySelectorAll("ul")).toHaveLength(4);
    expect(container.querySelectorAll("li")[0]?.getAttribute("data-state")).toBe("present");
  });

  it("« Vérifié » seulement sur la cellule dont la ligne a un verified_at ; un false isolé reste à confirmer", () => {
    const { container } = setup();
    const cells = [...container.querySelectorAll("li")];
    const wc = cells.find((c) => c.textContent?.includes("WC"));
    expect(wc?.getAttribute("data-state")).toBe("absent");
    expect(wc?.textContent).toContain("Vérifié");
    const benches = cells.find((c) => c.textContent?.includes("Bancs"));
    expect(benches?.getAttribute("data-state")).toBe("unknown");
    expect(benches?.textContent).not.toContain("Vérifié");
    expect(cells.filter((c) => c.textContent?.includes("Vérifié"))).toHaveLength(1);
  });

  it("temporarily_unavailable : état distinct, jamais « Non renseigné »", () => {
    const { container } = setup();
    const parking = [...container.querySelectorAll("li")].find((c) => c.textContent?.includes("Parking"));
    expect(parking?.getAttribute("data-state")).toBe("temporary");
    expect(parking?.textContent).toContain("Temporairement indisponible");
    expect(container.textContent).not.toContain("À confirmer");
  });

  it("une cellule présente n'a pas de ligne de statut", () => {
    const { container } = setup();
    const present = container.querySelector('li[data-state="present"]')!;
    expect(present.querySelector('[class*="_meta_"]')).toBeNull();
  });
});
