import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../../i18n/testInit";
import EditProfile from "./EditProfile";
import { useToastStore } from "../../lib/toast";

const store = vi.hoisted(() => ({ saveUsername: vi.fn(), name: "Camille" }));
vi.mock("../../lib/session", () => ({
  useSession: (sel: (s: unknown) => unknown) =>
    sel({ saveUsername: store.saveUsername, profile: { name: store.name, email: "c@x.fr" } }),
}));

function Probe() {
  return <div data-testid="loc">{useLocation().pathname}</div>;
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/profile", "/profile/edit"]} initialIndex={1}>
      <Probe />
      <Routes>
        <Route path="/profile/edit" element={<EditProfile />} />
        <Route path="/profile" element={<div>PROFIL</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EditProfile — modification du pseudo", () => {
  beforeEach(() => {
    store.saveUsername.mockReset().mockResolvedValue(undefined);
    store.name = "Camille";
    useToastStore.getState().clear();
  });

  it("préremplit le pseudo actuel et enregistre la nouvelle valeur avec confirmation", async () => {
    renderScreen();
    const input = screen.getByLabelText(/^Votre pseudo/) as HTMLInputElement;
    expect(input.value).toBe("Camille");
    fireEvent.change(input, { target: { value: "Camille & Léo" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/profile"));
    expect(store.saveUsername).toHaveBeenCalledWith("Camille & Léo");
    expect(useToastStore.getState().message).toBe("Pseudo mis à jour");
  });

  it("Annuler revient sans rien enregistrer", () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText(/^Votre pseudo/), { target: { value: "Autre" } });
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.getByTestId("loc").textContent).toBe("/profile");
    expect(store.saveUsername).not.toHaveBeenCalled();
  });

  it("affiche l'erreur de validation et reste sur l'écran", () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText(/^Votre pseudo/), { target: { value: "x@y" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.getByText(/@, < et >/)).toBeTruthy();
    expect(store.saveUsername).not.toHaveBeenCalled();
    expect(screen.getByTestId("loc").textContent).toBe("/profile/edit");
  });

  it("un compte existant garde son pseudo hérité tel quel dans le champ", () => {
    store.name = "fabien.test";
    renderScreen();
    expect((screen.getByLabelText(/^Votre pseudo/) as HTMLInputElement).value).toBe("fabien.test");
  });
});
