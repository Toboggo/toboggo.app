import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("kaboom");
  return <div>Contenu OK</div>;
}

describe("ErrorBoundary — E. a render error falls back to a recoverable screen, never a blank one", () => {
  it("renders the fallback instead of leaving a blank screen", () => {
    // React (and our own componentDidCatch) log the error to the console —
    // expected noise for this test, silenced so it doesn't look like a failure.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );

    screen.getByText(/une erreur est survenue/i);
    screen.getByRole("button", { name: /réessayer/i });
    spy.mockRestore();
  });

  it('recovers when "Réessayer" is clicked once the underlying problem is gone', () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    function Harness() {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <div>
          <button onClick={() => setShouldThrow(false)}>Corriger</button>
          <ErrorBoundary>
            <Bomb shouldThrow={shouldThrow} />
          </ErrorBoundary>
        </div>
      );
    }

    render(<Harness />);
    screen.getByText(/une erreur est survenue/i);

    // The rest of the app (outside the boundary) keeps working: clicking
    // "Corriger" fixes the underlying state, but the boundary still shows its
    // fallback until the user explicitly retries.
    fireEvent.click(screen.getByRole("button", { name: /corriger/i }));
    screen.getByText(/une erreur est survenue/i);

    fireEvent.click(screen.getByRole("button", { name: /réessayer/i }));
    screen.getByText("Contenu OK");
    expect(screen.queryByText(/une erreur est survenue/i)).toBeNull();

    spy.mockRestore();
  });
});
