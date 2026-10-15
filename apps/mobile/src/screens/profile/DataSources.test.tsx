import { describe, expect, it } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../../i18n/testInit";
import DataSources from "./DataSources";
import About from "./About";
import LegalIndex from "./LegalIndex";
import { MAP_CREDIT, ODBL_URL, OSM_COPYRIGHT_URL, OSM_CREDIT } from "../../lib/dataAttribution";
import fr from "../../i18n/locales/fr/profile.json";
import en from "../../i18n/locales/en/profile.json";
import es from "../../i18n/locales/es/profile.json";

function Probe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

describe("Sources des données (attribution OSM)", () => {
  it("affiche le crédit OSM et les deux liens, ouverts sans fuite d'opener", () => {
    render(
      <MemoryRouter>
        <DataSources />
      </MemoryRouter>,
    );
    expect(screen.getByText(OSM_CREDIT)).toBeTruthy();
    const copyright = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === OSM_COPYRIGHT_URL);
    const odbl = screen.getByRole("link", { name: /ODbL/ });
    expect(copyright.length).toBeGreaterThanOrEqual(1);
    expect(odbl.getAttribute("href")).toBe(ODBL_URL);
    for (const a of screen.getAllByRole("link")) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
      expect(a.getAttribute("href")).toMatch(/^https:\/\//);
    }
  });

  it("sépare les données de parcs du fond de carte", () => {
    render(
      <MemoryRouter>
        <DataSources />
      </MemoryRouter>,
    );
    const parks = screen.getByRole("region", { name: "Données des parcs" });
    const map = screen.getByRole("region", { name: "Fond de carte" });
    expect(within(parks).getByText(OSM_CREDIT)).toBeTruthy();
    expect(within(map).queryByText(OSM_CREDIT)).toBeNull();
    expect(within(map).getByText(MAP_CREDIT)).toBeTruthy();
    expect(within(parks).queryByText(MAP_CREDIT)).toBeNull();
    expect(within(map).getByRole("link", { name: "OpenFreeMap" })).toBeTruthy();
    expect(within(parks).queryByRole("link", { name: "OpenFreeMap" })).toBeNull();
  });

  it("n'affirme aucune conformité juridique", () => {
    const { container } = render(
      <MemoryRouter>
        <DataSources />
      </MemoryRouter>,
    );
    expect(container.textContent ?? "").not.toMatch(/conform|compliant|share-?alike|partage à l/i);
  });

  it("À propos : crédit visible + accès à l'écran dédié", () => {
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <Probe />
        <Routes>
          <Route path="/about" element={<About />} />
          <Route path="/about/data-sources" element={<DataSources />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: OSM_CREDIT }).getAttribute("href")).toBe(OSM_COPYRIGHT_URL);
    fireEvent.click(screen.getByRole("button", { name: /Sources des données/ }));
    expect(screen.getByTestId("path").textContent).toBe("/about/data-sources");
  });

  it("Confidentialité et conditions : ligne « Sources des données » en dernier", () => {
    render(
      <MemoryRouter initialEntries={["/legal"]}>
        <Probe />
        <Routes>
          <Route path="/legal" element={<LegalIndex />} />
          <Route path="/about/data-sources" element={<DataSources />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Sources des données/ }));
    expect(screen.getByTestId("path").textContent).toBe("/about/data-sources");
  });
});

describe("Parité des traductions — attribution des données", () => {
  const leaves = (o: unknown, p = ""): Record<string, string> =>
    typeof o === "string" ? { [p]: o } : Object.entries(o as object).reduce((a, [k, v]) => ({ ...a, ...leaves(v, p ? `${p}.${k}` : k) }), {});
  const pick = (d: typeof fr): Record<string, string> => ({ ...leaves(d.dataSources, "dataSources"), "about.dataSources": d.about.dataSources, "about.dataCreditLabel": d.about.dataCreditLabel });
  const F = pick(fr);

  for (const [lang, cat] of [["en", en], ["es", es]] as const) {
    it(`${lang} : mêmes clés, aucune valeur vide, aucune copie du français`, () => {
      const L = pick(cat as typeof fr);
      expect(Object.keys(L).sort()).toEqual(Object.keys(F).sort());
      for (const [k, v] of Object.entries(L)) {
        expect(v.trim(), k).not.toBe("");
        expect(v, k).not.toBe(F[k]);
      }
    });
  }
});
