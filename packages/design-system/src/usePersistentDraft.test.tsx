import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readDraft, writeDraft, DRAFT_NAMESPACE } from "@toboggo/shared";
import { usePersistentDraft, useAdoptedDraftKey } from "./usePersistentDraft";

// Instrumentation for the "render must stay pure" proof below: `renderPhase`
// is flipped true only for the duration of the probe component's function
// body (single-threaded JS — nothing else can run while it's true), and every
// real `adoptGuestDraft` call records what it was at that instant.
const { renderPhase, adoptCalls } = vi.hoisted(() => ({
  renderPhase: { active: false },
  adoptCalls: [] as { duringRender: boolean }[],
}));
vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    adoptGuestDraft: (...args: Parameters<typeof actual.adoptGuestDraft>) => {
      adoptCalls.push({ duringRender: renderPhase.active });
      return actual.adoptGuestDraft(...args);
    },
  };
});

type Form = { name: string; note: string };
const INITIAL: Form = { name: "", note: "" };
const OPTS = { schemaVersion: 1, debounceMs: 400 } as const;
const READ = { schemaVersion: 1, ttlMs: 24 * 60 * 60 * 1000 };

const KEY_A = DRAFT_NAMESPACE + "bo:park.new:u=alice";
const KEY_B = DRAFT_NAMESPACE + "bo:park.new:u=bob";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  setHidden(false);
  adoptCalls.length = 0;
  renderPhase.active = false;
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("usePersistentDraft — persistence basics", () => {
  it("key === null: nothing is stored", () => {
    const { result } = renderHook(() => usePersistentDraft<Form>(null, INITIAL, OPTS));
    act(() => result.current.setValue({ name: "X", note: "" }));
    act(() => vi.advanceTimersByTime(1000));
    expect(localStorage.length).toBe(0);
    expect(result.current.persistenceStatus).toBe("idle");
  });

  it("debounces the write (~400ms) and reports idle → saving → saved", () => {
    const { result } = renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    expect(result.current.persistenceStatus).toBe("idle");

    act(() => result.current.setValue({ name: "Square", note: "" }));
    expect(result.current.persistenceStatus).toBe("saving");
    act(() => vi.advanceTimersByTime(399));
    expect(readDraft(KEY_A, READ)).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.persistenceStatus).toBe("saved");
    expect(readDraft<Form>(KEY_A, READ)).toEqual({ name: "Square", note: "" });
  });

  it("patch() shallow-merges object drafts", () => {
    const { result } = renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    act(() => result.current.patch({ name: "A" }));
    act(() => result.current.patch({ note: "B" }));
    act(() => vi.advanceTimersByTime(400));
    expect(readDraft<Form>(KEY_A, READ)).toEqual({ name: "A", note: "B" });
  });
});

describe("usePersistentDraft — hide / pagehide flush", () => {
  it("flushes synchronously on visibilitychange → hidden (before the debounce fires)", () => {
    const { result } = renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    act(() => result.current.setValue({ name: "Half typed", note: "" }));
    expect(readDraft(KEY_A, READ)).toBeNull(); // debounce not elapsed

    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(readDraft<Form>(KEY_A, READ)).toEqual({ name: "Half typed", note: "" });
  });

  it("flushes on pagehide", () => {
    const { result } = renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    act(() => result.current.setValue({ name: "Bye", note: "" }));
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(readDraft<Form>(KEY_A, READ)).toEqual({ name: "Bye", note: "" });
  });

  it("does not write on hide when nothing is dirty", () => {
    renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(localStorage.length).toBe(0);
  });

  it("removes its listeners on unmount", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const removeWin = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    unmount();
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(removeWin).toHaveBeenCalledWith("pagehide", expect.any(Function));
  });
});

describe("usePersistentDraft — restore modes", () => {
  it("restore: 'auto' applies a valid stored draft on mount", () => {
    writeDraft<Form>(KEY_A, { name: "Stored", note: "n" }, { schemaVersion: 1 });
    const { result } = renderHook(() =>
      usePersistentDraft<Form>(KEY_A, INITIAL, { ...OPTS, restore: "auto" }),
    );
    expect(result.current.value).toEqual({ name: "Stored", note: "n" });
    expect(result.current.restored).toBe(true);
    expect(result.current.pendingDraft).toBeNull();
  });

  it("restore: 'manual' exposes the stored draft as pending, value stays initial", () => {
    writeDraft<Form>(KEY_A, { name: "Stored", note: "n" }, { schemaVersion: 1 });
    const { result } = renderHook(() =>
      usePersistentDraft<Form>(KEY_A, INITIAL, { ...OPTS, restore: "manual" }),
    );
    expect(result.current.value).toEqual(INITIAL);
    expect(result.current.restored).toBe(false);
    expect(result.current.pendingDraft).toEqual({ name: "Stored", note: "n" });

    act(() => result.current.restore());
    expect(result.current.value).toEqual({ name: "Stored", note: "n" });
    expect(result.current.restored).toBe(true);
    expect(result.current.pendingDraft).toBeNull();
  });

  it("discardPending() drops the pending draft and erases storage", () => {
    writeDraft<Form>(KEY_A, { name: "Stored", note: "n" }, { schemaVersion: 1 });
    const { result } = renderHook(() =>
      usePersistentDraft<Form>(KEY_A, INITIAL, { ...OPTS, restore: "manual" }),
    );
    act(() => result.current.discardPending());
    expect(result.current.pendingDraft).toBeNull();
    expect(readDraft(KEY_A, READ)).toBeNull();
  });
});

describe("usePersistentDraft — clear must never resurrect", () => {
  it("clear() → unmount (default flushOnUnmount:false) does not rewrite the draft", () => {
    const { result, unmount } = renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    act(() => result.current.setValue({ name: "work in progress", note: "" }));
    act(() => vi.advanceTimersByTime(400));
    expect(readDraft(KEY_A, READ)).not.toBeNull();

    act(() => result.current.clear());
    expect(readDraft(KEY_A, READ)).toBeNull();
    expect(result.current.value).toEqual(INITIAL);

    unmount();
    act(() => vi.advanceTimersByTime(2000));
    expect(readDraft(KEY_A, READ)).toBeNull();
  });

  it("clear() → hide flush does not resurrect", () => {
    const { result } = renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    act(() => result.current.setValue({ name: "x", note: "" }));
    act(() => result.current.clear());
    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(readDraft(KEY_A, READ)).toBeNull();
  });

  it("clear() → unmount even with flushOnUnmount:true does not resurrect", () => {
    const { result, unmount } = renderHook(() =>
      usePersistentDraft<Form>(KEY_A, INITIAL, { ...OPTS, flushOnUnmount: true }),
    );
    act(() => result.current.setValue({ name: "x", note: "" }));
    act(() => result.current.clear());
    unmount();
    expect(readDraft(KEY_A, READ)).toBeNull();
  });

  it("a genuine new edit AFTER clear() persists again", () => {
    const { result } = renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    act(() => result.current.setValue({ name: "first", note: "" }));
    act(() => result.current.clear());
    act(() => result.current.setValue({ name: "second", note: "" }));
    act(() => vi.advanceTimersByTime(400));
    expect(readDraft<Form>(KEY_A, READ)).toEqual({ name: "second", note: "" });
  });

  it("flushOnUnmount:true writes a normal dirty draft on unmount", () => {
    const { result, unmount } = renderHook(() =>
      usePersistentDraft<Form>(KEY_A, INITIAL, { ...OPTS, flushOnUnmount: true }),
    );
    act(() => result.current.setValue({ name: "pending", note: "" }));
    // debounce not elapsed
    unmount();
    expect(readDraft<Form>(KEY_A, READ)).toEqual({ name: "pending", note: "" });
  });
});

describe("usePersistentDraft — key / principal change", () => {
  it("switching key never carries the previous scope's value or draft over", () => {
    writeDraft<Form>(KEY_B, { name: "bob draft", note: "" }, { schemaVersion: 1 });

    let key = KEY_A;
    const { result, rerender } = renderHook(() =>
      usePersistentDraft<Form>(key, INITIAL, { ...OPTS, restore: "auto" }),
    );
    act(() => result.current.setValue({ name: "alice typing", note: "" }));
    act(() => vi.advanceTimersByTime(400));

    // switch to bob
    key = KEY_B;
    rerender();

    expect(result.current.value).toEqual({ name: "bob draft", note: "" }); // bob's, not alice's
    expect(readDraft<Form>(KEY_A, READ)).toEqual({ name: "alice typing", note: "" }); // alice's kept where it was
  });

  it("a pending write is not flushed to the new key after a switch", () => {
    let key = KEY_A;
    const { result, rerender } = renderHook(() => usePersistentDraft<Form>(key, INITIAL, OPTS));
    act(() => result.current.setValue({ name: "alice", note: "" })); // debounce armed, not fired
    key = KEY_B;
    rerender();
    act(() => vi.advanceTimersByTime(1000));
    expect(readDraft(KEY_B, READ)).toBeNull();
  });
});

describe("usePersistentDraft — flush()", () => {
  it("writes synchronously and cancels the pending debounce", () => {
    const { result } = renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    act(() => result.current.setValue({ name: "avant redirect", note: "" }));
    expect(readDraft(KEY_A, READ)).toBeNull();

    act(() => result.current.flush());
    expect(readDraft<Form>(KEY_A, READ)).toEqual({ name: "avant redirect", note: "" });

    // the debounce that was pending must not fire a second stale write
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.persistenceStatus).toBe("saved");
  });

  it("is a no-op after clear()", () => {
    const { result } = renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    act(() => result.current.setValue({ name: "x", note: "" }));
    act(() => result.current.clear());
    act(() => result.current.flush());
    expect(readDraft(KEY_A, READ)).toBeNull();
  });
});

describe("useAdoptedDraftKey — render stays pure", () => {
  const GUEST = DRAFT_NAMESPACE + "mobile:park.report:parkId=p1:guest";
  const USER = DRAFT_NAMESPACE + "mobile:park.report:parkId=p1:u=alice";

  /** Marks `renderPhase.active` for exactly the synchronous extent of the
   * function body — the same window in which a call would be "during render". */
  function useProbe(guestKey: string | null, userKey: string | null) {
    renderPhase.active = true;
    const key = useAdoptedDraftKey(guestKey, userKey);
    const draft = usePersistentDraft<Form>(key, INITIAL, { ...OPTS, restore: "auto" });
    renderPhase.active = false;
    return { key, ...draft };
  }

  it("1. adoptGuestDraft is never called while the probe's render body is executing", () => {
    writeDraft(GUEST, { name: "guest wip", note: "" }, { schemaVersion: 1 });
    renderHook(() => useProbe(GUEST, USER));
    expect(adoptCalls.length).toBeGreaterThan(0); // it did run — just not during render
    expect(adoptCalls.every((c) => c.duringRender === false)).toBe(true);
  });

  it("1b. no localStorage.setItem / removeItem is reachable synchronously from the render call itself", () => {
    writeDraft(GUEST, { name: "guest wip", note: "" }, { schemaVersion: 1 });
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    let sawWriteDuringRender = false;

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k, v) {
      if (renderPhase.active) sawWriteDuringRender = true;
      return originalSetItem.call(this, k, v);
    });
    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, k) {
      if (renderPhase.active) sawWriteDuringRender = true;
      return originalRemoveItem.call(this, k);
    });

    renderHook(() => useProbe(GUEST, USER));

    expect(sawWriteDuringRender).toBe(false);
    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });

  it("2. userId already known at mount: adoption settles before the draft is exposed as final", () => {
    // A stale user draft must never win over a newer guest one — and the test
    // only asserts once, right after mount, with no waitFor: if adoption had
    // not settled by then, this would still be reading the stale value.
    writeDraft(USER, { name: "stale user draft", note: "" }, { schemaVersion: 1 });
    writeDraft(GUEST, { name: "guest wip", note: "" }, { schemaVersion: 1 });
    const { result } = renderHook(() => useProbe(GUEST, USER));

    expect(result.current.value).toEqual({ name: "guest wip", note: "" });
    expect(result.current.key).toBe(USER);
    expect(localStorage.getItem(GUEST)).toBeNull();
  });

  it("3. userId arrives a render after mount: adoption runs then, and the draft is restored correctly", () => {
    writeDraft(GUEST, { name: "guest wip", note: "" }, { schemaVersion: 1 });
    let userKey: string | null = null;
    const { result, rerender } = renderHook(() => useProbe(GUEST, userKey));

    expect(result.current.key).toBe(GUEST);
    expect(result.current.value).toEqual({ name: "guest wip", note: "" });
    expect(adoptCalls.length).toBe(0); // nothing to arbitrate yet — guest-only phase

    userKey = USER;
    rerender();

    expect(result.current.key).toBe(USER);
    expect(result.current.value).toEqual({ name: "guest wip", note: "" });
    expect(readDraft<Form>(USER, READ)).toEqual({ name: "guest wip", note: "" });
    expect(localStorage.getItem(GUEST)).toBeNull();
    expect(adoptCalls.every((c) => c.duringRender === false)).toBe(true);
  });

  it("4. collision — guest is newer: the guest content is restored", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    writeDraft(USER, { name: "old user", note: "" }, { schemaVersion: 1 });
    now.mockReturnValue(5_000);
    writeDraft(GUEST, { name: "newer guest", note: "" }, { schemaVersion: 1 });

    const { result } = renderHook(() => useProbe(GUEST, USER));
    expect(result.current.value).toEqual({ name: "newer guest", note: "" });
    expect(localStorage.getItem(GUEST)).toBeNull();
  });

  it("5. collision — user is newer: the user's own draft is kept, guest discarded", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    writeDraft(GUEST, { name: "old guest", note: "" }, { schemaVersion: 1 });
    now.mockReturnValue(5_000);
    writeDraft(USER, { name: "newer user", note: "" }, { schemaVersion: 1 });

    const { result } = renderHook(() => useProbe(GUEST, USER));
    expect(result.current.value).toEqual({ name: "newer user", note: "" });
    expect(localStorage.getItem(GUEST)).toBeNull();
  });

  it("does nothing when there is no guest draft", () => {
    const { result } = renderHook(() => useProbe(GUEST, USER));
    expect(result.current.value).toEqual(INITIAL);
    expect(result.current.key).toBe(USER);
  });

  it("guest phase (no userId yet): the guest key is used directly, no hold", () => {
    const { result } = renderHook(() => useProbe(GUEST, null));
    expect(result.current.key).toBe(GUEST);
  });
});

describe("usePersistentDraft — persistenceStatus", () => {
  it("reports 'quota' when the store is full and cannot be reclaimed", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const { result } = renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    act(() => result.current.setValue({ name: "x", note: "" }));
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.persistenceStatus).toBe("quota");
  });

  it("reports 'unavailable' when setItem throws a non-quota error", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("no", "SecurityError");
    });
    const { result } = renderHook(() => usePersistentDraft<Form>(KEY_A, INITIAL, OPTS));
    act(() => result.current.setValue({ name: "x", note: "" }));
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.persistenceStatus).toBe("unavailable");
  });
});
