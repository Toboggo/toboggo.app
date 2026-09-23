import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../i18n/testInit";
import { useVisitPrompt } from "../lib/visitPrompt";
import { GlobalOverlays } from "./GlobalOverlays";
import { VISIT_PROMPT_SELECT_MS } from "./VisitRatingPrompt";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderOverlays() {
  return render(
    <MemoryRouter initialEntries={["/park/p1"]}>
      <GlobalOverlays />
      <LocationProbe />
      <Routes>
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  useVisitPrompt.setState({ parkId: "p1", parkName: "Square Voltaire", visible: true });
});
afterEach(() => {
  vi.useRealTimers();
  useVisitPrompt.setState({ parkId: null, parkName: "", visible: false });
});

describe("GlobalOverlays — visit rating prompt", () => {
  it("4th star → opens the review flow with stars=4 and an explicit source=visit_prompt", () => {
    renderOverlays();
    fireEvent.click(screen.getByRole("button", { name: "4 étoiles" }));
    act(() => vi.advanceTimersByTime(VISIT_PROMPT_SELECT_MS));
    expect(screen.getByTestId("loc").textContent).toBe("/rate?park=p1&stars=4&source=visit_prompt");
    expect(useVisitPrompt.getState().visible).toBe(false);
  });

  it("Plus tard → closes without navigating", () => {
    renderOverlays();
    fireEvent.click(screen.getByRole("button", { name: "Plus tard" }));
    expect(useVisitPrompt.getState().visible).toBe(false);
    expect(screen.getByTestId("loc").textContent).toBe("/park/p1");
  });
});
