import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readDraft, writeDraft, DRAFT_NAMESPACE } from "@toboggo/shared";
import { usePersistentDraft } from "./usePersistentDraft";

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
