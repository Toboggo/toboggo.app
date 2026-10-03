import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { InvalidUsernameError } from "@toboggo/shared";
import "../../i18n/testInit";
import ChooseUsername from "./ChooseUsername";

const store = vi.hoisted(() => ({ saveUsername: vi.fn(), takeResume: vi.fn<() => string | null>(() => null) }));
vi.mock("../../lib/session", () => ({
  useSession: (sel: (s: unknown) => unknown) => sel({ saveUsername: store.saveUsername }),
}));
vi.mock("../../lib/resumeRoute", () => ({ takeResumeRoute: () => store.takeResume() }));

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderScreen(next?: string) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/choose-username", state: next ? { next } : undefined }]}>
      <Probe />
      <Routes>
        <Route path="/choose-username" element={<ChooseUsername />} />
        <Route path="*" element={<div>ailleurs</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ChooseUsername", () => {
  beforeEach(() => {
    store.saveUsername.mockReset().mockResolvedValue(undefined);
    store.takeResume.mockReset().mockReturnValue(null);
  });

  it("affiche les textes attendus, champ vide avec exemple en placeholder", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Choisissez votre pseudo" })).toBeTruthy();
    expect(screen.getByText("C'est le nom que les autres verront sur Toboggo.")).toBeTruthy();
    const input = screen.getByLabelText("Votre pseudo") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("ex. Camille");
    expect(screen.getByText(/Visible sur vos avis et contributions\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "C'est parti !" })).toBeTruthy();
    expect(screen.getByText("Modifiable à tout moment depuis votre profil.")).toBeTruthy();
  });

  it("refuse un pseudo trop court sans appeler le serveur (erreur annoncée)", () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText("Votre pseudo"), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: "C'est parti !" }));
    expect(screen.getByRole("alert").textContent).toMatch(/au moins 3 caractères/);
    expect(store.saveUsername).not.toHaveBeenCalled();
  });

  it("enregistre le pseudo normalisé puis revient à la page interrompue", async () => {
    renderScreen("/permissions");
    fireEvent.change(screen.getByLabelText("Votre pseudo"), { target: { value: "  Camille  " } });
    fireEvent.click(screen.getByRole("button", { name: "C'est parti !" }));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/permissions"));
    expect(store.saveUsername).toHaveBeenCalledWith("Camille");
  });

  it("reprend d'abord une contribution en attente (retour après connexion juste-à-temps)", async () => {
    store.takeResume.mockReturnValue("/rate?park=p1");
    renderScreen("/permissions");
    fireEvent.change(screen.getByLabelText("Votre pseudo"), { target: { value: "Camille" } });
    fireEvent.click(screen.getByRole("button", { name: "C'est parti !" }));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/rate"));
  });

  it("retombe sur la carte quand la page interrompue était l'accueil ou /login", async () => {
    renderScreen("/login");
    fireEvent.change(screen.getByLabelText("Votre pseudo"), { target: { value: "Camille" } });
    fireEvent.click(screen.getByRole("button", { name: "C'est parti !" }));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/map"));
  });

  it("affiche le chargement puis une erreur de rejet serveur, sans quitter l'écran", async () => {
    let reject!: (e: unknown) => void;
    store.saveUsername.mockReturnValue(new Promise((_, r) => (reject = r)));
    renderScreen();
    fireEvent.change(screen.getByLabelText("Votre pseudo"), { target: { value: "Camille" } });
    fireEvent.click(screen.getByRole("button", { name: "C'est parti !" }));
    const busy = await screen.findByRole("button", { name: "Enregistrement…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    reject(new InvalidUsernameError());
    expect((await screen.findByRole("alert")).textContent).toMatch(/@, < et >/);
    expect(screen.getByTestId("loc").textContent).toBe("/choose-username");
  });

  it("affiche une erreur générique si l'enregistrement échoue (réseau)", async () => {
    store.saveUsername.mockRejectedValue(new Error("network"));
    renderScreen();
    fireEvent.change(screen.getByLabelText("Votre pseudo"), { target: { value: "Camille" } });
    fireEvent.click(screen.getByRole("button", { name: "C'est parti !" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Réessayez/);
  });
});
