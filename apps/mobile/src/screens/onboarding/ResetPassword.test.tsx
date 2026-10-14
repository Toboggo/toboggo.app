import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../../i18n/testInit";
import ResetPassword from "./ResetPassword";
import { useSession } from "../../lib/session";

const auth = vi.hoisted(() => ({ updatePassword: vi.fn(), signOut: vi.fn(), signOutLocal: vi.fn() }));
vi.mock("@toboggo/shared", async (importOriginal) => ({ ...(await importOriginal<object>()), ...auth }));
vi.mock("../../lib/analytics", () => ({ trackEvent: vi.fn(), registerIsAuthenticated: vi.fn() }));

function Where() {
  const l = useLocation();
  return (
    <p data-testid="where">
      {l.pathname + l.search}|{JSON.stringify(l.state)}
    </p>
  );
}

function setup(recovery = true) {
  useSession.setState({
    userId: "u1",
    profile: { id: "u1", email: "alice@parents.fr" } as never,
    loading: false,
    recovery,
  });
  render(
    <MemoryRouter initialEntries={["/reset-password"]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}
const fill = (a: string, b: string) => {
  fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), { target: { value: a } });
  fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: b } });
  fireEvent.submit(screen.getByLabelText("Nouveau mot de passe").closest("form")!);
};

beforeEach(() => {
  auth.updatePassword.mockReset().mockResolvedValue(undefined);
  auth.signOut.mockReset().mockResolvedValue(undefined);
  auth.signOutLocal.mockReset().mockResolvedValue(undefined);
});

describe("ResetPassword", () => {
  it("sans session de récupération → redirige vers une nouvelle demande", () => {
    setup(false);
    expect(screen.getByTestId("where").textContent).toMatch(/^\/forgot-password\?reason=invalid/);
  });

  it("confirmation différente → erreur, aucun appel", () => {
    setup();
    fill("secret123", "secret124");
    expect(screen.getByRole("alert").textContent).toBe("Les deux mots de passe ne sont pas identiques.");
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it("trop court (politique existante : 6) → erreur, aucun appel", () => {
    setup();
    fill("abc", "abc");
    expect(screen.getByRole("alert").textContent).toMatch(/au moins 6 caractères/);
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it("succès : enregistre, ferme la session, retourne à « Se connecter » avec le message", async () => {
    setup();
    expect(screen.getByText(/alice@parents.fr/)).toBeTruthy();
    fill("secret123", "secret123");
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe('/login?mode=login|{"passwordChanged":true}'));
    expect(auth.updatePassword).toHaveBeenCalledWith("secret123");
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(useSession.getState().recovery).toBe(false);
  });

  it("échec de déconnexion : message, Réessayer puis retour à la connexion", async () => {
    auth.signOut.mockRejectedValueOnce(new Error("network"));
    setup();
    fill("secret123", "secret123");
    expect((await screen.findByRole("alert")).textContent).toMatch(/mot de passe a été modifié, mais/);
    expect(useSession.getState().recovery).toBe(true); // reste verrouillé sur l'écran
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/^\/login\?mode=login/));
    expect(auth.updatePassword).toHaveBeenCalledTimes(1);
  });

  it("échec de déconnexion : « Aller à la connexion » purge la session locale", async () => {
    auth.signOut.mockRejectedValue(new Error("network"));
    setup();
    fill("secret123", "secret123");
    fireEvent.click(await screen.findByRole("button", { name: "Aller à la connexion" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/^\/login/));
    expect(auth.signOutLocal).toHaveBeenCalled();
  });

  it("même mot de passe que l'ancien → message dédié, reste sur le formulaire", async () => {
    auth.updatePassword.mockRejectedValue({ code: "same_password", status: 422 });
    setup();
    fill("secret123", "secret123");
    expect((await screen.findByRole("alert")).textContent).toMatch(/différent de l'ancien/);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("session de récupération perdue → nouvelle demande", async () => {
    auth.updatePassword.mockRejectedValue({ name: "AuthSessionMissingError", message: "Auth session missing!" });
    setup();
    fill("secret123", "secret123");
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/^\/forgot-password\?reason=invalid/));
  });

  it("erreur réseau à l'enregistrement → message réseau", async () => {
    auth.updatePassword.mockRejectedValue({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" });
    setup();
    fill("secret123", "secret123");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Connexion impossible/);
  });

  it("Annuler ferme la session de récupération", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/^\/login/));
    expect(auth.signOut).toHaveBeenCalled();
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });
});
