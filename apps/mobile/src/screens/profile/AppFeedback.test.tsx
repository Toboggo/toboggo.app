import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  AppFeedbackNotEditableError,
  AppFeedbackTooSoonError,
  createAppFeedback,
  listMyAppFeedback,
  updateAppFeedback,
  type AppFeedbackEntry as Row,
} from "@toboggo/shared";
import "../../i18n/testInit";
import AppFeedback from "./AppFeedback";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, listMyAppFeedback: vi.fn(), createAppFeedback: vi.fn(), updateAppFeedback: vi.fn() };
});

const sess = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("../../lib/session", () => ({
  useSession: (sel: (s: unknown) => unknown) => sel({ userId: sess.userId }),
}));

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const row = (o: Partial<Row>): Row => ({
  id: "f1", user_id: "u1", rating: 4, title: null, body: "Très bien", created_at: daysAgo(5), edited_at: null, is_current: true, ...o,
});

function renderScreen(path = "/profile/feedback") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profile/feedback/*" element={<AppFeedback />} />
          <Route path="/profile" element={<div>PROFILE</div>} />
          <Route path="/login-method" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sendBtn = () => screen.getByRole("button", { name: /Envoyer mon avis|Enregistrer les modifications/ }) as HTMLButtonElement;

beforeEach(() => {
  sess.userId = "u1";
  vi.mocked(listMyAppFeedback).mockReset().mockResolvedValue([]);
  vi.mocked(createAppFeedback).mockReset();
  vi.mocked(updateAppFeedback).mockReset();
});
afterEach(() => vi.useRealTimers());

describe("Avis sur Toboggo — premier avis", () => {
  it("shows a form with no title field, rating required, comment optional", async () => {
    renderScreen();
    await screen.findByLabelText("Commentaire (facultatif)");
    expect(screen.queryByLabelText("Titre")).toBeNull();
    expect(sendBtn().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "4 étoiles" }));
    expect(sendBtn().disabled).toBe(false); // no comment needed
  });

  it("saves, then shows the thank-you screen and returns to the settings", async () => {
    // Once saved, the server history is no longer empty: the confirmation must survive any refetch.
    vi.mocked(createAppFeedback).mockImplementation(async () => {
      vi.mocked(listMyAppFeedback).mockResolvedValue([row({ rating: 5, body: "Top" })]);
      return row({ rating: 5, body: "Top" });
    });
    renderScreen();
    await screen.findByLabelText("Commentaire (facultatif)");
    fireEvent.change(screen.getByLabelText("Commentaire (facultatif)"), { target: { value: "Top" } });
    fireEvent.click(screen.getByRole("button", { name: "5 étoiles" }));
    fireEvent.click(sendBtn());
    await waitFor(() => expect(createAppFeedback).toHaveBeenCalledWith("u1", { rating: 5, body: "Top" }));
    expect(await screen.findByText("Merci pour votre retour 💚")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("Merci pour votre retour 💚")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retour aux réglages" }));
    expect(screen.getByText("PROFILE")).toBeTruthy();
  });

  it("sends only once on a double tap", async () => {
    let resolve!: (r: Row) => void;
    vi.mocked(createAppFeedback).mockReturnValue(new Promise<Row>((r) => (resolve = r)));
    renderScreen();
    await screen.findByLabelText("Commentaire (facultatif)");
    fireEvent.click(screen.getByRole("button", { name: "3 étoiles" }));
    const form = sendBtn().closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(createAppFeedback).toHaveBeenCalledTimes(1);
    resolve(row({ rating: 3 }));
    await screen.findByText("Merci pour votre retour 💚");
  });

  it("shows a generic error (no raw message) and lets the user retry", async () => {
    vi.mocked(createAppFeedback).mockRejectedValueOnce(new Error('new row violates row-level security policy for table "app_feedback"'));
    renderScreen();
    await screen.findByLabelText("Commentaire (facultatif)");
    fireEvent.click(screen.getByRole("button", { name: "5 étoiles" }));
    fireEvent.click(sendBtn());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Votre avis n’a pas pu être enregistré. Réessayez dans quelques instants.");
    expect(screen.queryByText(/row-level|app_feedback/)).toBeNull();
    expect(sendBtn().disabled).toBe(false);
  });

  it("shows an error state with retry — never an empty form — when the history cannot load", async () => {
    vi.mocked(listMyAppFeedback).mockRejectedValueOnce(new Error("boom")).mockResolvedValue([]);
    renderScreen();
    expect((await screen.findByRole("alert")).textContent).toBe("Vos avis n’ont pas pu être chargés.");
    expect(screen.queryByLabelText("Commentaire (facultatif)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findByLabelText("Commentaire (facultatif)");
  });

  it("asks a guest to sign in", () => {
    sess.userId = null;
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(screen.getByText("LOGIN")).toBeTruthy();
  });
});

describe("Avis sur Toboggo — lecture, modification, nouvel avis", () => {
  it("shows the latest review, rating, date and the previous history", async () => {
    vi.mocked(listMyAppFeedback).mockResolvedValue([
      row({ id: "f2", rating: 5, body: "Génial", created_at: daysAgo(5) }),
      row({ id: "f1", rating: 2, title: "Ancien titre", body: "Bof", created_at: daysAgo(80) }),
    ]);
    renderScreen();
    expect(await screen.findByText("Génial")).toBeTruthy();
    expect(screen.getByText(/^Donné le/)).toBeTruthy();
    expect(screen.getByText("Avis précédents")).toBeTruthy();
    expect(screen.getByText("Bof")).toBeTruthy();
    expect(screen.getByText("Ancien titre")).toBeTruthy(); // existing titles are preserved
    expect(screen.getByRole("button", { name: "Modifier cet avis" })).toBeTruthy();
  });

  it("before 30 days: no new-review button, shows the date it becomes possible", async () => {
    vi.mocked(listMyAppFeedback).mockResolvedValue([row({ created_at: daysAgo(5) })]);
    renderScreen();
    await screen.findByText("Très bien");
    expect(screen.queryByRole("button", { name: "Donner un nouvel avis" })).toBeNull();
    expect(screen.getByText(/^Vous pourrez donner un nouvel avis le /)).toBeTruthy();
  });

  it("an edit does not restart the delay: it is based on created_at only", async () => {
    vi.mocked(listMyAppFeedback).mockResolvedValue([row({ created_at: daysAgo(31), edited_at: daysAgo(1) })]);
    renderScreen();
    expect(await screen.findByRole("button", { name: "Donner un nouvel avis" })).toBeTruthy();
    expect(screen.getByText(/modifié le/)).toBeTruthy();
  });

  it("edit: prefills the latest review and updates it in place", async () => {
    vi.mocked(listMyAppFeedback).mockResolvedValue([row({ id: "f2", rating: 3, body: "Moyen" }), row({ id: "f1", rating: 1, body: "Vieux" })]);
    vi.mocked(updateAppFeedback).mockResolvedValue(row({ id: "f2", rating: 3 }));
    renderScreen("/profile/feedback/edit");
    const box = (await screen.findByLabelText("Commentaire (facultatif)")) as HTMLTextAreaElement;
    expect(box.value).toBe("Moyen");
    fireEvent.change(box, { target: { value: "Moyen+" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(updateAppFeedback).toHaveBeenCalledWith("u1", "f2", { rating: 3, body: "Moyen+" }));
    expect(createAppFeedback).not.toHaveBeenCalled();
    await screen.findByText("Merci pour votre retour 💚");
  });

  it("new review: blank form, creates a new row after 30 days", async () => {
    vi.mocked(listMyAppFeedback).mockResolvedValue([row({ rating: 2, body: "Ancien", created_at: daysAgo(40) })]);
    vi.mocked(createAppFeedback).mockResolvedValue(row({ id: "f9", rating: 5 }));
    renderScreen("/profile/feedback/new");
    const box = (await screen.findByLabelText("Commentaire (facultatif)")) as HTMLTextAreaElement;
    expect(box.value).toBe("");
    expect(sendBtn().disabled).toBe(true); // blank, no star preselected
    fireEvent.click(screen.getByRole("button", { name: "5 étoiles" }));
    fireEvent.click(sendBtn());
    await waitFor(() => expect(createAppFeedback).toHaveBeenCalledWith("u1", { rating: 5, body: "" }));
  });

  it("new review before the delay is blocked in the UI and, if forced, by the server error", async () => {
    vi.mocked(listMyAppFeedback).mockResolvedValue([row({ created_at: daysAgo(5) })]);
    renderScreen("/profile/feedback/new");
    await screen.findByText(/^Vous pourrez donner un nouvel avis le /);
    fireEvent.click(screen.getByRole("button", { name: "5 étoiles" }));
    expect(sendBtn().disabled).toBe(true);
    expect(createAppFeedback).not.toHaveBeenCalled();
  });

  it("server refusal (too soon, e.g. another device) shows the allowed date", async () => {
    vi.mocked(listMyAppFeedback).mockResolvedValue([row({ created_at: daysAgo(40) })]);
    vi.mocked(createAppFeedback).mockRejectedValue(new AppFeedbackTooSoonError(new Date(Date.now() + 3 * DAY)));
    renderScreen("/profile/feedback/new");
    await screen.findByLabelText("Commentaire (facultatif)");
    fireEvent.click(screen.getByRole("button", { name: "5 étoiles" }));
    fireEvent.click(sendBtn());
    expect((await screen.findByRole("alert")).textContent).toMatch(/^Vous pourrez donner un nouvel avis le /);
  });

  it("editing an outdated review explains it is no longer editable", async () => {
    vi.mocked(listMyAppFeedback).mockResolvedValue([row({ id: "f2" })]);
    vi.mocked(updateAppFeedback).mockRejectedValue(new AppFeedbackNotEditableError());
    renderScreen("/profile/feedback/edit");
    await screen.findByLabelText("Commentaire (facultatif)");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/plus modifiable/);
  });
});
