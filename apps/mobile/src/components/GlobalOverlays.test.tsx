import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../i18n/testInit";
import { PARK_REMINDER_COOLDOWN_MS, useVisitPrompt } from "../lib/visitPrompt";

vi.mock("@toboggo/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@toboggo/shared")>()),
  hasUserReviewedPark: vi.fn().mockResolvedValue(false),
}));
vi.mock("../lib/session", () => ({
  useSession: { getState: () => ({ userId: "u1" }) },
}));
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
  localStorage.clear();
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

  it.each([
    ["9. « Plus tard »", "Plus tard"],
    ["10. the close button (X)", "Fermer"],
  ])("%s → dismissed for this park, reminder possible after 3 days", async (_label, button) => {
    const T0 = new Date("2026-09-24T10:00:00Z").getTime();
    vi.setSystemTime(T0);
    useVisitPrompt.setState({ parkId: null, parkName: "", visible: false });
    renderOverlays();

    const handOff = async (at: number) => {
      vi.setSystemTime(at);
      act(() => useVisitPrompt.getState().schedule("p1", "Square Voltaire", 0));
      await act(() => vi.advanceTimersByTimeAsync(0));
      return useVisitPrompt.getState().visible;
    };

    expect(await handOff(T0)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(useVisitPrompt.getState().visible).toBe(false);
    expect(screen.getByTestId("loc").textContent).toBe("/park/p1");

    expect(await handOff(T0 + PARK_REMINDER_COOLDOWN_MS - 60_000)).toBe(false);
    expect(await handOff(T0 + PARK_REMINDER_COOLDOWN_MS)).toBe(true);
  });
});
