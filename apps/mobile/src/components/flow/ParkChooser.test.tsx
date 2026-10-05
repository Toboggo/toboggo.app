import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { searchParks } from "@toboggo/shared";
import "../../i18n/testInit";
import { ParkChooser } from "./ParkChooser";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, searchParks: vi.fn() };
});
vi.mock("../../lib/geo", () => ({ useGeo: () => ({ hasFix: false, lat: 0, lng: 0 }) }));

const PARK = { id: "p1", name: "Parc de la Victoire", formatted_address: "Avenue Charles-de-Gaulle, Millau", latitude: 1, longitude: 1 };

function setup(over: { selected?: typeof PARK | null } = {}) {
  const onSelect = vi.fn();
  const onAddPark = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ParkChooser selected={(over.selected ?? null) as never} onSelect={onSelect} onAddPark={onAddPark} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onSelect, onAddPark };
}
const search = (v: string) => fireEvent.change(screen.getByLabelText("Rechercher un parc"), { target: { value: v } });
const card = () => screen.getByRole("button", { name: /Parc introuvable/ });

afterEach(() => {
  cleanup();
  vi.mocked(searchParks).mockReset();
});

describe("ParkChooser — carte « Parc introuvable ? »", () => {
  it("vient APRÈS les résultats ; toute la carte est le bouton ; aide « Sélectionnez un parc » tant que rien n'est choisi", async () => {
    vi.mocked(searchParks).mockResolvedValue([PARK] as never);
    setup();
    search("Victoire");
    const result = await screen.findByText("Parc de la Victoire");
    expect(result.compareDocumentPosition(card()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card().textContent).toContain("Vous pouvez proposer son ajout.");
    expect(screen.getByText("Sélectionnez un parc pour continuer")).toBeTruthy();
  });

  it("l'aide disparaît une fois un parc choisi", () => {
    setup({ selected: PARK });
    expect(screen.queryByText("Sélectionnez un parc pour continuer")).toBeNull();
  });

  it("recherche sans résultat : message « aucun résultat » ET carte toujours accessible", async () => {
    vi.mocked(searchParks).mockResolvedValue([]);
    setup();
    search("zzzz");
    expect(await screen.findByText("Aucun parc trouvé pour cette recherche.")).toBeTruthy();
    expect(card()).toBeTruthy();
  });

  it("erreur réseau ≠ « aucun parc » : erreur + Réessayer, jamais présentée comme une absence", async () => {
    vi.mocked(searchParks).mockRejectedValueOnce(new Error("network")).mockResolvedValue([PARK] as never);
    setup();
    search("Victoire");
    expect(await screen.findByText(/La recherche a échoué/)).toBeTruthy();
    expect(screen.queryByText("Aucun parc trouvé pour cette recherche.")).toBeNull();
    expect(card()).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Parc de la Victoire")).toBeTruthy();
  });

  it("le panneau explique sans rien déclencher ; croix, Échap et « Continuer à chercher » le ferment, recherche conservée, focus rendu", async () => {
    vi.mocked(searchParks).mockResolvedValue([PARK] as never);
    const { onAddPark, onSelect } = setup();
    search("Victoire");
    await screen.findByText("Parc de la Victoire");
    card().focus();
    fireEvent.click(card());
    let dialog = screen.getByRole("dialog", { name: "Votre parc n’est pas encore ici ?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(onAddPark).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(card()));

    fireEvent.click(card());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(card());
    dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuer à chercher" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByLabelText("Rechercher un parc") as HTMLInputElement).value).toBe("Victoire");
    expect(onAddPark).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("« Ajouter ce parc » referme le panneau et appelle onAddPark une seule fois", async () => {
    const { onAddPark } = setup();
    fireEvent.click(card());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ajouter ce parc" }));
    expect(onAddPark).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
