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

describe("useVisitPrompt — strictly per-park eligibility", () => {
  it("constant: 3 days per park; no global cooldown exported any more", async () => {
    expect(PARK_REMINDER_COOLDOWN_MS).toBe(3 * DAY);
    expect(Object.keys(await import("./visitPrompt"))).not.toContain("GLOBAL_ANTI_SPAM_MS");
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

  it("4. park A after ≥ 3 days, no review → shown", async () => {
    await handOff("A", T0);
    expect(await handOff("A", T0 + 3 * DAY - MIN)).toBe(false);
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

  it("6. park A then park B 1 min later → B shown", async () => {
    await handOff("A", T0);
    expect(await handOff("B", T0 + MIN)).toBe(true);
  });

  it("7. park A then park B immediately after → B still eligible", async () => {
    await handOff("A", T0);
    expect(await handOff("B", T0)).toBe(true);
  });

  it("8. parks A, B, C in a row (5 min, then 2 min) → each prompted independently", async () => {
    expect(await handOff("A", T0)).toBe(true);
    expect(await handOff("B", T0 + 5 * MIN)).toBe(true);
    expect(await handOff("C", T0 + 7 * MIN)).toBe(true);
    // …and each keeps its own cooldown.
    expect(await handOff("A", T0 + 8 * MIN)).toBe(false);
    expect(await handOff("B", T0 + 8 * MIN)).toBe(false);
    expect(await handOff("D", T0 + 8 * MIN)).toBe(true);
  });

  // 9 (« Plus tard ») and 10 (✕) go through the real dialog: GlobalOverlays.test.tsx.

  it("11. star tap then abandoned form (no review on the server) → A blocked 3 days, then possible again", async () => {
    await handOff("A", T0); // star tapped → RatePark opened, never published
    expect(await handOff("A", T0 + DAY)).toBe(false);
    expect(await handOff("A", T0 + 3 * DAY - MIN)).toBe(false);
    expect(await handOff("A", T0 + 3 * DAY)).toBe(true);
  });

  it("12. star tap then review actually published → A never prompted again", async () => {
    await handOff("A", T0);
    reviewed.set.add("u1:A"); // createReview succeeded
    expect(await handOff("A", T0 + 3 * DAY)).toBe(false);
    expect(await handOff("A", T0 + 30 * DAY)).toBe(false);
  });

  it("13. signed-in, eligible, server check failing → not shown, no cooldown recorded", async () => {
    reviewed.fail = true;
    expect(await handOff("A", T0)).toBe(false);
    expect(reviewed.calls).toBe(1);
    expect(localStorage.getItem(VISIT_PROMPT_STORAGE_KEY)).toBeNull();
  });

  it("14. after that failure, a new attempt re-checks normally (same park, 1 min later)", async () => {
    reviewed.fail = true;
    await handOff("A", T0);
    reviewed.fail = false;
    expect(await handOff("A", T0 + MIN)).toBe(true);
    expect(reviewed.calls).toBe(2);
  });

  it("15. guest: no server check (even if it would fail), local per-park cooldown only", async () => {
    sess.userId = null;
    reviewed.fail = true;
    expect(await handOff("A", T0)).toBe(true);
    expect(await handOff("A", T0 + 2 * DAY)).toBe(false);
    expect(await handOff("B", T0 + 2 * DAY)).toBe(true);
    expect(await handOff("A", T0 + 3 * DAY)).toBe(true);
    expect(reviewed.calls).toBe(0);
  });

  it("16. two concurrent hand-offs for the SAME park → a single prompt", async () => {
    const shown = vi.fn();
    const unsub = useVisitPrompt.subscribe((s, prev) => {
      if (s.visible && !prev.visible) shown(s.parkId);
    });
    state().schedule("A", "Parc A", 1000);
    state().schedule("A", "Parc A", 1000);
    await vi.advanceTimersByTimeAsync(1000);
    state().dismiss();
    state().schedule("A", "Parc A", 0); // and then cooling down
    await vi.advanceTimersByTimeAsync(0);
    unsub();
    expect(shown).toHaveBeenCalledTimes(1);
    expect(shown).toHaveBeenCalledWith("A");
  });

  it("16b. a hand-off superseding one whose server check is still in flight → no double prompt", async () => {
    let release: (v: boolean) => void = () => {};
    const { hasUserReviewedPark } = await import("@toboggo/shared");
    vi.mocked(hasUserReviewedPark).mockImplementationOnce(() => new Promise<boolean>((r) => (release = r)));
    state().schedule("A", "Parc A", 0);
    await vi.advanceTimersByTimeAsync(0); // first check pending
    state().schedule("A", "Parc A", 0);
    await vi.advanceTimersByTimeAsync(0); // second one shows
    expect(state()).toMatchObject({ visible: true, parkId: "A" });
    state().dismiss();
    release(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(state().visible).toBe(false); // the stale check never pops a second one
  });

  it("17. legacy global timestamp in storage (24 h / 30 min versions) never blocks an eligible park, and is dropped on write", async () => {
    localStorage.setItem(VISIT_PROMPT_STORAGE_KEY, JSON.stringify({ last: T0, parks: { A: T0 } }));
    expect(await handOff("B", T0 + MIN)).toBe(true);
    expect(JSON.parse(localStorage.getItem(VISIT_PROMPT_STORAGE_KEY) ?? "{}")).toEqual({
      parks: { A: T0, B: T0 + MIN },
    });
    // Per-park entries from older versions (14-day policy) are re-read with 3 days.
    expect(await handOff("A", T0 + 3 * DAY)).toBe(true);
  });

  it("local cooldown is checked before the network (no request while cooling down)", async () => {
    await handOff("A", T0);
    reviewed.calls = 0;
    await handOff("A", T0 + DAY);
    expect(reviewed.calls).toBe(0);
  });

  it("corrupt storage never blocks the prompt", async () => {
    localStorage.setItem(VISIT_PROMPT_STORAGE_KEY, "{not json");
    expect(await handOff("A", T0)).toBe(true);
  });
});
