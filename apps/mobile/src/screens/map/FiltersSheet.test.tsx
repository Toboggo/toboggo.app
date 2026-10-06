import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../i18n/testInit";
import { FiltersSheet } from "./FiltersSheet";
import { useFilters, searchByLabel } from "../../lib/filters";
import { trackEvent } from "../../lib/analytics";

vi.mock("../../lib/analytics", () => ({ trackEvent: vi.fn() }));

const feat = (code: string, sort_order: number) => ({
  id: code,
  code,
  category: "play",
  label_key: `feature.${code}`,
  icon_key: null,
  value_set: null,
  sort_order,
  is_active: true,
  created_at: "",
});
vi.mock("@toboggo/shared", async (orig) => ({
  ...(await orig<typeof import("@toboggo/shared")>()),
  listFeatures: vi.fn(async () => [feat("slide", 1), feat("zipline", 7), feat("trampoline", 8), feat("hopscotch", 9)]),
}));

function renderSheet(onClose = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FiltersSheet open onClose={onClose} />
    </QueryClientProvider>,
  );
}

describe("FiltersSheet", () => {
  beforeEach(() => {
    useFilters.getState().reset();
  });

  it("ne rend rien fermé", () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <FiltersSheet open={false} onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("affiche sections, 6 jeux courants et 7 services (aucun « type de parc » inventé)", () => {
    renderSheet();
    expect(screen.getByRole("dialog", { name: "Filtres" })).toBeTruthy();
    for (const h of ["Âge des enfants", "Jeux", "Équipements et services"]) expect(screen.getByText(h)).toBeTruthy();
    expect(screen.queryByText("Type de parc")).toBeNull();
    for (const l of ["Toboggan", "Balançoire", "Escalade", "Jeux à ressort", "Bac à sable", "Tourniquet"]) {
      expect(screen.getByRole("button", { name: l }).getAttribute("aria-pressed")).toBe("false");
    }
    for (const l of ["Toilettes", "Ombragé", "Clôturé", "Accessibilité", "Bancs", "Point d’eau", "Parking"]) {
      expect(screen.getByRole("button", { name: l })).toBeTruthy();
    }
  });

  it("services et jeux basculent dans le store", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Toilettes" }));
    expect(useFilters.getState().amenities.wc).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Balançoire" }));
    expect(useFilters.getState().games).toEqual(["swing"]);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("émet filter_applied { game } à chaque bascule d'un jeu (vue principale et puce)", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Toboggan" }));
    expect(trackEvent).toHaveBeenLastCalledWith("filter_applied", { filter_type: "game", filter_value: "slide" });
    fireEvent.click(screen.getByRole("button", { name: "Voir tous les jeux" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tyrolienne" }));
    fireEvent.click(screen.getByRole("button", { name: "Valider mes choix" }));
    fireEvent.click(screen.getByRole("button", { name: "Retirer Tyrolienne" }));
    expect(trackEvent).toHaveBeenLastCalledWith("filter_applied", { filter_type: "game", filter_value: "zipline" });
  });

  it("« Voir tous les jeux » : vue secondaire dans le même dialogue, recherche, validation", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Voir tous les jeux" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Tous les jeux" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Tyrolienne" })).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Rechercher un jeu" }), { target: { value: "TYROLIENNE" } });
    expect(screen.queryByRole("button", { name: "Trampoline" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tyrolienne" }));
    // Rien n'est appliqué avant la validation.
    expect(useFilters.getState().games).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Valider mes choix" }));
    expect(useFilters.getState().games).toEqual(["zipline"]);

    // Retour sur la vue principale : le jeu hors des 6 courants est affiché et retirable.
    const remove = screen.getByRole("button", { name: "Retirer Tyrolienne" });
    fireEvent.click(remove);
    expect(useFilters.getState().games).toEqual([]);
  });

  it("Retour depuis « Tous les jeux » annule le brouillon", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Voir tous les jeux" }));
    fireEvent.click(await screen.findByRole("button", { name: "Trampoline" }));
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(useFilters.getState().games).toEqual([]);
    expect(screen.getByRole("heading", { name: "Filtres" })).toBeTruthy();
  });

  it("Réinitialiser efface tout, y compris les jeux hors courants ; les boutons ferment", async () => {
    const onClose = vi.fn();
    useFilters.getState().setGames(["zipline", "swing"]);
    renderSheet(onClose);
    fireEvent.click(screen.getByRole("button", { name: "Bancs" }));
    fireEvent.change(screen.getByLabelText("Âge minimum"), { target: { value: "3" } });
    expect(useFilters.getState().activeCount()).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expect(useFilters.getState().activeCount()).toBe(0);
    expect(useFilters.getState().games).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Voir les résultats" }));
    fireEvent.click(screen.getByRole("button", { name: "Fermer les filtres" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("searchByLabel", () => {
  const items = [{ label: "Balançoire" }, { label: "Jeux d’eau" }, { label: "Tyrolienne" }];
  it("insensible à la casse et aux accents", () => {
    expect(searchByLabel(items, "balancoire")).toEqual([items[0]]);
    expect(searchByLabel(items, "  EAU ")).toEqual([items[1]]);
  });
  it("requête vide = tout, sans résultat = vide", () => {
    expect(searchByLabel(items, "")).toHaveLength(3);
    expect(searchByLabel(items, "zzz")).toEqual([]);
  });
});
