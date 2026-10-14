import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../../i18n/testInit";
import ForgotPassword from "./ForgotPassword";

const auth = vi.hoisted(() => ({ sendPasswordReset: vi.fn() }));
vi.mock("@toboggo/shared", async (importOriginal) => ({ ...(await importOriginal<object>()), ...auth }));

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function renderAt(entry: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry as never]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}
const typeEmail = (v: string) => fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: v } });
const send = () => fireEvent.submit(screen.getByLabelText("E-mail").closest("form")!);

beforeEach(() => {
  auth.sendPasswordReset.mockReset().mockResolvedValue(undefined);
});

describe("ForgotPassword", () => {
  it("affiche le message neutre (sans l'adresse) + Corriger / Créer un compte", async () => {
    renderAt("/forgot-password");
    typeEmail("alice@parents.fr");
    send();
    const msg = await screen.findByRole("status");
    expect(msg.textContent).toBe(
      "Si un compte Toboggo est associé à cette adresse, vous recevrez un email pour réinitialiser votre mot de passe. Vérifiez aussi vos spams.",
    );
    expect(msg.textContent).not.toContain("alice");
    expect(auth.sendPasswordReset).toHaveBeenCalledWith("alice@parents.fr");

    fireEvent.click(screen.getByRole("button", { name: "Corriger mon adresse" }));
    expect((screen.getByLabelText("E-mail") as HTMLInputElement).value).toBe("alice@parents.fr");
  });

  it("« Créer un compte » ouvre l'inscription", async () => {
    renderAt("/forgot-password");
    typeEmail("alice@parents.fr");
    send();
    fireEvent.click(await screen.findByRole("button", { name: "Créer un compte" }));
    expect(screen.getByTestId("where").textContent).toBe("/login?mode=signup");
  });

  it("préremplit l'adresse transmise par l'état de navigation", () => {
    renderAt({ pathname: "/forgot-password", state: { email: "bob@x.fr" } });
    expect((screen.getByLabelText("E-mail") as HTMLInputElement).value).toBe("bob@x.fr");
  });

  it("adresse invalide : erreur locale, aucun envoi", () => {
    renderAt("/forgot-password");
    typeEmail("pas-un-email");
    send();
    expect(screen.getByRole("alert").textContent).toBe("Entrez une adresse e-mail valide.");
    expect(auth.sendPasswordReset).not.toHaveBeenCalled();
  });

  it("limite de fréquence → message dédié, pas de confirmation", async () => {
    auth.sendPasswordReset.mockRejectedValue(
      Object.assign(new Error("Email rate limit exceeded"), { status: 429, code: "over_email_send_rate_limit" }),
    );
    renderAt("/forgot-password");
    typeEmail("alice@parents.fr");
    send();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Trop de demandes/));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("erreur réseau → message réseau, pas de confirmation", async () => {
    auth.sendPasswordReset.mockRejectedValue(
      Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError", status: 0 }),
    );
    renderAt("/forgot-password");
    typeEmail("alice@parents.fr");
    send();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Connexion impossible/));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lien refusé : explique et propose un nouvel e-mail", () => {
    renderAt("/forgot-password?reason=expired");
    expect(screen.getByRole("alert").textContent).toMatch(/invalide, expiré ou a déjà été utilisé/);
    expect(screen.getByRole("button", { name: "Envoyer le lien" })).toBeTruthy();
  });
});
