import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { deleteOwnAccount } from "@toboggo/shared";
import "../../i18n/testInit";
import Account from "./Account";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, deleteOwnAccount: vi.fn() };
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderAccount() {
  return render(
    <MemoryRouter initialEntries={["/profile/account"]}>
      <LocationProbe />
      <Routes>
        <Route path="/profile/account" element={<Account />} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function openConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "Supprimer mon compte" }));
  return screen.getByRole("dialog");
}

beforeEach(() => {
  vi.mocked(deleteOwnAccount).mockReset();
});

describe("Account — account deletion", () => {
  it("on success, deletes the account and navigates home", async () => {
    vi.mocked(deleteOwnAccount).mockResolvedValue(undefined);
    renderAccount();

    const dialog = openConfirm();
    fireEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/"));
    expect(deleteOwnAccount).toHaveBeenCalledTimes(1);
  });

  it("shows a loading state while the deletion is in flight", async () => {
    let resolve!: () => void;
    vi.mocked(deleteOwnAccount).mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    renderAccount();

    const dialog = openConfirm();
    fireEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));

    // Button in loading state: label replaced and disabled (no double submit).
    await waitFor(() =>
      expect((within(dialog).getByRole("button", { name: "…" }) as HTMLButtonElement).disabled).toBe(true),
    );
    resolve();
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/"));
  });

  it("on failure, keeps the dialog open with a clear message, no navigation, and allows a retry", async () => {
    vi.mocked(deleteOwnAccount).mockRejectedValueOnce(
      Object.assign(new Error('insert or update on table "audit_log" violates foreign key constraint "audit_log_actor_id_fkey"'), { code: "23503" }),
    );
    renderAccount();

    const dialog = openConfirm();
    fireEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("La suppression de votre compte n’a pas abouti. Réessayez dans quelques instants.");
    // No technical detail leaks to the user.
    expect(screen.queryByText(/audit_log|foreign key|23503/)).toBeNull();

    // No navigation, dialog still open, loading reset → button usable again.
    expect(screen.getByTestId("loc").textContent).toBe("/profile/account");
    expect(screen.getByRole("dialog")).toBe(dialog);
    const retry = within(dialog).getByRole("button", { name: "Supprimer" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);

    // Retry succeeds → error cleared, navigates home.
    vi.mocked(deleteOwnAccount).mockResolvedValueOnce(undefined);
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/"));
    expect(deleteOwnAccount).toHaveBeenCalledTimes(2);
  });

  it("clears a previous error when the dialog is reopened", async () => {
    vi.mocked(deleteOwnAccount).mockRejectedValueOnce(new Error("boom"));
    renderAccount();

    const dialog = openConfirm();
    fireEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));
    await within(dialog).findByRole("alert");

    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    const reopened = openConfirm();
    expect(within(reopened).queryByRole("alert")).toBeNull();
  });
});
