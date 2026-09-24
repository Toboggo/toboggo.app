// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reviewed = vi.hoisted(() => ({ set: new Set<string>(), calls: 0, fail: false }));
vi.mock("@toboggo/shared", () => ({
  hasUserReviewedPark: vi.fn(async (userId: string, parkId: string) => {
    reviewed.calls++;
    if (reviewed.fail) throw new Error("offline");
    return reviewed.set.has(`${userId}:${parkId}`);
  }),
}));

const sess = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("./session", () => ({
  useSession: { getState: () => ({ userId: sess.userId }) },
}));

import { queryClient } from "./queryClient";
import {
  GLOBAL_ANTI_SPAM_MS,
  PARK_REMINDER_COOLDOWN_MS,
  VISIT_PROMPT_STORAGE_KEY,
  useVisitPrompt,
} from "./visitPrompt";

const T0 = new Date("2026-09-24T10:00:00Z").getTime();
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const state = () => useVisitPrompt.getState();

/** Directions hand-off to `parkId` at `at`, timer fired and async check settled. */
async function handOff(parkId: string, at: number) {
  vi.setSystemTime(at);
  state().schedule(parkId, `Parc ${parkId}`, 0);
  await vi.advanceTimersByTimeAsync(0);
  const shown = state().visible && state().parkId === parkId;
  state().dismiss(); // "Plus tard" / ✕ / star tap all end the prompt the same way
  return shown;
}

beforeEach(() => {
  localStorage.clear();
  queryClient.clear();
  reviewed.set.clear();
  reviewed.calls = 0;
  reviewed.fail = false;
  sess.userId = "u1";
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  useVisitPrompt.setState({ parkId: null, parkName: "", visible: false });
});
afterEach(() => vi.useRealTimers());

describe("useVisitPrompt — per-park eligibility", () => {
  it("constants: 3 days per park, 30 min global anti-spam", () => {
    expect(PARK_REMINDER_COOLDOWN_MS).toBe(3 * DAY);
    expect(GLOBAL_ANTI_SPAM_MS).toBe(30 * MIN);
  });

  it("shows after the default 8 s delay", async () => {
    state().schedule("A", "Parc A");
    await vi.advanceTimersByTimeAsync(7999);
    expect(state().visible).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state()).toMatchObject({ visible: true, parkId: "A", parkName: "Parc A" });
  });

  it("1. park A, first time → shown", async () => {
    expect(await handOff("A", T0)).toBe(true);
  });

  it("2. park A again 10 min later → not shown", async () => {
    await handOff("A", T0);
    expect(await handOff("A", T0 + 10 * MIN)).toBe(false);
  });

  it("3. park A 2 days later → not shown", async () => {
    await handOff("A", T0);
    expect(await handOff("A", T0 + 2 * DAY)).toBe(false);
  });

  it("4. park A after 3 days, no review → shown", async () => {
    await handOff("A", T0);
    expect(await handOff("A", T0 + 3 * DAY)).toBe(true);
  });

  it("5. park A already reviewed (server) → never shown, nothing recorded", async () => {
    reviewed.set.add("u1:A");
    expect(await handOff("A", T0)).toBe(false);
    expect(await handOff("A", T0 + 10 * DAY)).toBe(false);
    expect(localStorage.getItem(VISIT_PROMPT_STORAGE_KEY)).toBeNull();
  });

  it("5b. a review already in the query cache answers without any request", async () => {
    queryClient.setQueryData(["park-reviews", "A"], [{ id: "r1", park_id: "A", user_id: "u1" }]);
    expect(await handOff("A", T0)).toBe(false);
    expect(reviewed.calls).toBe(0);
  });

  it("5c. someone else's cached review does not count; cache miss falls through to the server", async () => {
    queryClient.setQueryData(["park-reviews", "A"], [{ id: "r1", park_id: "A", user_id: "other" }]);
    expect(await handOff("A", T0)).toBe(true);
    expect(reviewed.calls).toBe(1);
  });

  it("6. park A then park B 10 min later → B blocked by the global anti-spam", async () => {
    await handOff("A", T0);
    expect(await handOff("B", T0 + 10 * MIN)).toBe(false);
  });

  it("7. park A then park B 31 min later → B shown (A's cooldown never blocks B)", async () => {
    await handOff("A", T0);
    expect(await handOff("B", T0 + 31 * MIN)).toBe(true);
  });

  it("10. star tap then abandoned form (no review on the server) → reminder possible after 3 days", async () => {
    await handOff("A", T0); // star tapped → RatePark opened, never published
    expect(await handOff("A", T0 + 3 * DAY - MIN)).toBe(false);
    expect(await handOff("A", T0 + 3 * DAY)).toBe(true);
  });

  it("11. star tap then review actually published → no more prompt for this park", async () => {
    await handOff("A", T0);
    reviewed.set.add("u1:A"); // createReview succeeded
    expect(await handOff("A", T0 + 3 * DAY)).toBe(false);
    expect(await handOff("A", T0 + 30 * DAY)).toBe(false);
  });

  it("12. log written by PR #49 (14 d / 24 h policy) is re-read with 3 d / 30 min — no artificial 14-day block", async () => {
    localStorage.setItem(VISIT_PROMPT_STORAGE_KEY, JSON.stringify({ last: T0, parks: { A: T0 } }));
    expect(await handOff("B", T0 + 31 * MIN)).toBe(true); // old 24 h global no longer applies
    expect(await handOff("A", T0 + 3 * DAY + MIN)).toBe(true); // old 14 d per park no longer applies
  });

  it("13. two rapid hand-offs → a single prompt, for the latest park", async () => {
    const setSpy = vi.fn();
    const unsub = useVisitPrompt.subscribe((s, prev) => {
      if (s.visible && !prev.visible) setSpy(s.parkId);
    });
    state().schedule("A", "Parc A", 1000);
    state().schedule("B", "Parc B", 1000);
    await vi.advanceTimersByTimeAsync(1000);
    unsub();
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith("B");
  });

  it("13b. a hand-off superseding one whose server check is still in flight → no double prompt", async () => {
    let release: (v: boolean) => void = () => {};
    const { hasUserReviewedPark } = await import("@toboggo/shared");
    vi.mocked(hasUserReviewedPark).mockImplementationOnce(() => new Promise<boolean>((r) => (release = r)));
    state().schedule("A", "Parc A", 0);
    await vi.advanceTimersByTimeAsync(0); // A's check pending
    state().schedule("B", "Parc B", 0);
    await vi.advanceTimersByTimeAsync(0); // B shown
    expect(state().parkId).toBe("B");
    state().dismiss();
    release(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(state().visible).toBe(false); // stale A never pops up
  });

  it("guest: no server check, local per-park cooldown still applies", async () => {
    sess.userId = null;
    expect(await handOff("A", T0)).toBe(true);
    expect(await handOff("A", T0 + 2 * DAY)).toBe(false);
    expect(await handOff("A", T0 + 3 * DAY)).toBe(true);
    expect(reviewed.calls).toBe(0);
  });

  it("signed-in, eligible, server check failing → not shown, no cooldown recorded, a later attempt re-checks", async () => {
    reviewed.fail = true;
    expect(await handOff("A", T0)).toBe(false);
    expect(reviewed.calls).toBe(1);
    expect(localStorage.getItem(VISIT_PROMPT_STORAGE_KEY)).toBeNull();

    // Neither the per-park cooldown nor the global anti-spam was started:
    // 1 min later (same park, then another park) the check simply runs again.
    reviewed.fail = false;
    expect(await handOff("A", T0 + MIN)).toBe(true);
    expect(reviewed.calls).toBe(2);
  });

  it("server check failing does not block another park either (no global anti-spam started)", async () => {
    reviewed.fail = true;
    await handOff("A", T0);
    reviewed.fail = false;
    expect(await handOff("B", T0 + MIN)).toBe(true);
  });

  it("guest: a failing server would not matter — no check is made", async () => {
    sess.userId = null;
    reviewed.fail = true;
    expect(await handOff("A", T0)).toBe(true);
    expect(reviewed.calls).toBe(0);
  });

  it("local cooldowns are checked before the network (no request while cooling down)", async () => {
    await handOff("A", T0);
    reviewed.calls = 0;
    await handOff("A", T0 + DAY);
    await handOff("B", T0 + 5 * MIN);
    expect(reviewed.calls).toBe(0);
  });

  it("corrupt storage never blocks the prompt", async () => {
    localStorage.setItem(VISIT_PROMPT_STORAGE_KEY, "{not json");
    expect(await handOff("A", T0)).toBe(true);
  });
});
