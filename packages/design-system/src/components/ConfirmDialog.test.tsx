import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmDialogProvider, useConfirm } from "./ConfirmDialog";

function Harness() {
  const confirm = useConfirm();
  const [result, setResult] = useState("");
  return (
    <div>
      <button
        onClick={async () => {
          const ok = await confirm({ title: "Titre", message: "Message", confirmLabel: "Oui", cancelLabel: "Non" });
          setResult(ok ? "confirmed" : "cancelled");
        }}
      >
        Ouvrir
      </button>
      <div data-testid="result">{result}</div>
    </div>
  );
}

function renderHarness() {
  return render(
    <ConfirmDialogProvider>
      <Harness />
    </ConfirmDialogProvider>,
  );
}

describe("ConfirmDialog", () => {
  it("focuses Cancel by default (never the possibly-destructive Confirm)", async () => {
    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    await screen.findByText("Message");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Non" })));
  });

  it("closes and resolves false on Escape", async () => {
    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    await screen.findByText("Message");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByText("Message")).toBeNull());
    expect(screen.getByTestId("result").textContent).toBe("cancelled");
  });

  it("restores focus to the element that opened the dialog once it closes", async () => {
    renderHarness();
    const openButton = screen.getByRole("button", { name: "Ouvrir" });
    openButton.focus();
    fireEvent.click(openButton);
    await screen.findByText("Message");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(document.activeElement).toBe(openButton));
  });

  it("resolves true when Confirm is clicked", async () => {
    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    await screen.findByText("Message");

    fireEvent.click(screen.getByRole("button", { name: "Oui" }));

    await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("confirmed"));
  });
});
