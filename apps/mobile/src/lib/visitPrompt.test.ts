// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GLOBAL_COOLDOWN_MS,
  PARK_COOLDOWN_MS,
  VISIT_PROMPT_STORAGE_KEY,
  isVisitPromptCoolingDown,
  useVisitPrompt,
} from "./visitPrompt";

const T0 = new Date("2026-09-23T10:00:00Z").getTime();

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  useVisitPrompt.setState({ parkId: null, parkName: "", visible: false });
});
afterEach(() => vi.useRealTimers());

const state = () => useVisitPrompt.getState();

describe("useVisitPrompt", () => {
  it("shows the prompt for the park after the delay (8 s by default)", () => {
    state().schedule("p1", "Square Voltaire");
    vi.advanceTimersByTime(7999);
    expect(state().visible).toBe(false);
    vi.advanceTimersByTime(1);
    expect(state()).toMatchObject({ visible: true, parkId: "p1", parkName: "Square Voltaire" });
  });

  it("dismiss hides it", () => {
    state().schedule("p1", "A", 0);
    vi.advanceTimersByTime(0);
    state().dismiss();
    expect(state().visible).toBe(false);
  });

  it("a newer schedule supersedes one still pending (no double prompt)", () => {
    state().schedule("p1", "A", 1000);
    state().schedule("p2", "B", 1000);
    vi.advanceTimersByTime(1000);
    expect(state().parkId).toBe("p2");
  });

  it("does not re-prompt within 24 h, even for another park", () => {
    state().schedule("p1", "A", 0);
    vi.advanceTimersByTime(0);
    state().dismiss();
    vi.setSystemTime(T0 + GLOBAL_COOLDOWN_MS - 1000);
    state().schedule("p2", "B", 0);
    vi.advanceTimersByTime(0);
    expect(state().visible).toBe(false);

    vi.setSystemTime(T0 + GLOBAL_COOLDOWN_MS + 1);
    state().schedule("p2", "B", 0);
    vi.advanceTimersByTime(0);
    expect(state()).toMatchObject({ visible: true, parkId: "p2" });
  });

  it("does not re-prompt for the same park within 14 days", () => {
    state().schedule("p1", "A", 0);
    vi.advanceTimersByTime(0);
    state().dismiss();
    expect(isVisitPromptCoolingDown("p1", T0 + 2 * GLOBAL_COOLDOWN_MS)).toBe(true);
    expect(isVisitPromptCoolingDown("p1", T0 + PARK_COOLDOWN_MS + 1)).toBe(false);
  });

  it("corrupt storage never blocks the prompt", () => {
    localStorage.setItem(VISIT_PROMPT_STORAGE_KEY, "{not json");
    state().schedule("p1", "A", 0);
    vi.advanceTimersByTime(0);
    expect(state().visible).toBe(true);
  });
});
