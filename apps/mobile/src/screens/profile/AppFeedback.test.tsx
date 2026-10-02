import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { getMyAppFeedback, saveAppFeedback } from "@toboggo/shared";
import "../../i18n/testInit";
import AppFeedback from "./AppFeedback";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, getMyAppFeedback: vi.fn(), saveAppFeedback: vi.fn() };
});

const sess = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("../../lib/session", () => ({
  useSession: (sel: (s: unknown) => unknown) => sel({ userId: sess.userId }),
}));

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/profile/feedback"]}>
        <Routes>
          <Route path="/profile/feedback" element={<AppFeedback />} />
          <Route path="/profile" element={<div>PROFILE</div>} />
          <Route path="/login-method" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sendBtn = () => screen.getByRole("button", { name: /Envoyer mon avis|Mettre à jour mon avis|…/ }) as HTMLButtonElement;

beforeEach(() => {
  sess.userId = "u1";
  vi.mocked(getMyAppFeedback).mockReset().mockResolvedValue(null);
  vi.mocked(saveAppFeedback).mockReset();
});

describe("AppFeedback — « Évaluer Toboggo »", () => {
  it("starts with no star selected and the send button disabled", async () => {
    renderScreen();
    await screen.findByLabelText("Titre");
    expect(sendBtn().disabled).toBe(true);
    // The star buttons expose no pressed/selected rating at first.
    expect(screen.getAllByRole("button", { name: /étoile/ })).toHaveLength(5);
  });

  it("stays disabled until rating, title and text are all filled, then saves and confirms", async () => {
    vi.mocked(saveAppFeedback).mockResolvedValue({ id: "f1", user_id: "u1", rating: 4, title: "Top", body: "Très bien", created_at: "", updated_at: "" });
    renderScreen();
    await screen.findByLabelText("Titre");

    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Top" } });
    fireEvent.change(screen.getByLabelText("Votre avis"), { target: { value: "Très bien" } });
    expect(sendBtn().disabled).toBe(true); // no rating yet
    fireEvent.click(screen.getByRole("button", { name: "4 étoiles" }));
    expect(sendBtn().disabled).toBe(false);

    fireEvent.click(sendBtn());
    await waitFor(() => expect(saveAppFeedback).toHaveBeenCalledWith("u1", { rating: 4, title: "Top", body: "Très bien" }));
    expect(await screen.findByText("Merci pour votre avis !")).toBeTruthy();
  });

  it("shows a generic error (no raw message) and lets the user retry", async () => {
    vi.mocked(saveAppFeedback).mockRejectedValueOnce(new Error('new row violates row-level security policy for table "app_feedback"'));
    renderScreen();
    await screen.findByLabelText("Titre");
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Votre avis"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "5 étoiles" }));
    fireEvent.click(sendBtn());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Votre avis n’a pas pu être enregistré. Réessayez dans quelques instants.");
    expect(screen.queryByText(/row-level|app_feedback/)).toBeNull();
    expect(sendBtn().disabled).toBe(false);
  });

  it("prefills an existing evaluation and offers to update it", async () => {
    vi.mocked(getMyAppFeedback).mockResolvedValue({ id: "f1", user_id: "u1", rating: 3, title: "Bof", body: "Moyen", created_at: "", updated_at: "" });
    renderScreen();
    expect(((await screen.findByLabelText("Titre")) as HTMLInputElement).value).toBe("Bof");
    expect((screen.getByLabelText("Votre avis") as HTMLTextAreaElement).value).toBe("Moyen");
    expect(screen.getByRole("button", { name: "Mettre à jour mon avis" })).toBeTruthy();
  });

  it("asks a guest to sign in instead of showing a form that cannot save", () => {
    sess.userId = null;
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(screen.getByText("LOGIN")).toBeTruthy();
    expect(screen.queryByLabelText("Titre")).toBeNull();
  });
});
