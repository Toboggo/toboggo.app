import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearDraft,
  DEFAULT_DRAFT_TTL_MS,
  readDraft,
  writeDraft,
  type WriteResult,
} from "@toboggo/shared";

/**
 * React binding for the shared draft socle (LOT 3D.B).
 *
 * Small and generic — it holds the form value, debounces writes, flushes
 * synchronously when the tab is hidden / unloading, and exposes a stored draft
 * for the screen to adopt or discard. It has NO product policy: it never
 * inspects navigation type, `pageshow.persisted` or history to decide whether
 * to restore. That call is made flow by flow via the `restore` option.
 *
 * `key === null` disables persistence entirely (use it until the scoping ids —
 * userId, parkId — are known). `options` and `initialValue` are expected to be
 * stable between renders.
 */

const DEFAULT_DEBOUNCE_MS = 400;

export type DraftRestoreMode = "auto" | "manual";

export type DraftPersistenceStatus = "idle" | "saving" | "saved" | "quota" | "unavailable";

export interface UsePersistentDraftOptions<T> {
  /** Schema version of the stored `data`, owned by this flow. */
  schemaVersion: number;
  /** Draft lifetime. Defaults to the socle's 24 h. */
  ttlMs?: number;
  /**
   * `"auto"`   — a valid stored draft replaces `initialValue` on mount.
   * `"manual"` — a valid stored draft is exposed as `pendingDraft`; the screen
   *              calls `restore()` (Reprendre) or `discardPending()` (Recommencer).
   * Defaults to `"manual"`.
   */
  restore?: DraftRestoreMode;
  debounceMs?: number;
  migrate?: (data: unknown, fromVersion: number) => T | null;
  /** `JSON.stringify` replacer, e.g. to serialise `Set` / `Map`. */
  serialize?: (key: string, value: unknown) => unknown;
  /** `JSON.parse` reviver, e.g. to rebuild `Set` / `Map`. */
  deserialize?: (key: string, value: unknown) => unknown;
  /** Flush to storage on `visibilitychange → hidden` and `pagehide`. Default `true`. */
  flushOnHide?: boolean;
  /**
   * Flush to storage on unmount. Default `false` — a clean unmount right after
   * `clear()` (successful submit, explicit abandon) must never resurrect the
   * draft, and the hide flush already covers "the app is going away".
   */
  flushOnUnmount?: boolean;
}

export interface UsePersistentDraftResult<T> {
  value: T;
  setValue: (next: T | ((prev: T) => T)) => void;
  /** Convenience for object drafts: shallow-merges `partial` into `value`. */
  patch: (partial: Partial<T>) => void;
  /** A valid stored draft awaiting a decision (`restore` mode `"manual"`), else `null`. */
  pendingDraft: T | null;
  /** `true` once a stored draft has been applied (auto on mount, or via `restore()`). */
  restored: boolean;
  /** Adopt `pendingDraft` as the current value. No-op when there is none. */
  restore: () => void;
  /** Drop `pendingDraft` and erase it from storage. */
  discardPending: () => void;
  /** Erase the stored draft and reset `value` to `initialValue`. */
  clear: () => void;
  persistenceStatus: DraftPersistenceStatus;
}

interface DraftState<T> {
  value: T;
  pending: T | null;
  restored: boolean;
}

export function usePersistentDraft<T>(
  key: string | null,
  initialValue: T,
  options: UsePersistentDraftOptions<T>,
): UsePersistentDraftResult<T> {
  // ── Latest props via refs (options/initialValue assumed stable, but the
  //    debounced + lifecycle paths must never read a stale closure). ──────────
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;
  const schemaVersionRef = useRef(options.schemaVersion);
  schemaVersionRef.current = options.schemaVersion;
  const ttlMsRef = useRef(options.ttlMs ?? DEFAULT_DRAFT_TTL_MS);
  ttlMsRef.current = options.ttlMs ?? DEFAULT_DRAFT_TTL_MS;
  const restoreModeRef = useRef<DraftRestoreMode>(options.restore ?? "manual");
  restoreModeRef.current = options.restore ?? "manual";
  const debounceMsRef = useRef(options.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  debounceMsRef.current = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const migrateRef = useRef(options.migrate);
  migrateRef.current = options.migrate;
  const serializeRef = useRef(options.serialize);
  serializeRef.current = options.serialize;
  const deserializeRef = useRef(options.deserialize);
  deserializeRef.current = options.deserialize;
  const flushOnHideRef = useRef(options.flushOnHide !== false);
  flushOnHideRef.current = options.flushOnHide !== false;
  const flushOnUnmountRef = useRef(options.flushOnUnmount === true);
  flushOnUnmountRef.current = options.flushOnUnmount === true;

  const load = useCallback((k: string | null): DraftState<T> => {
    if (k == null) return { value: initialValueRef.current, pending: null, restored: false };
    const stored = readDraft<T>(k, {
      schemaVersion: schemaVersionRef.current,
      ttlMs: ttlMsRef.current,
      migrate: migrateRef.current,
      reviver: deserializeRef.current,
    });
    if (stored == null) return { value: initialValueRef.current, pending: null, restored: false };
    if (restoreModeRef.current === "auto") return { value: stored, pending: null, restored: true };
    return { value: initialValueRef.current, pending: stored, restored: false };
  }, []);

  const [state, setState] = useState<DraftState<T>>(() => load(key));
  const [status, setStatus] = useState<DraftPersistenceStatus>("idle");

  const valueRef = useRef(state.value);
  valueRef.current = state.value;
  const keyRef = useRef(key);
  const dirtyRef = useRef(false);
  /** Set by `clear()` / `discardPending()`; blocks any write until the next `setValue`. */
  const suppressWriteRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDebounce = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flushWrite = useCallback(() => {
    const k = keyRef.current;
    if (k == null || suppressWriteRef.current || !dirtyRef.current) return;
    const result: WriteResult = writeDraft(k, valueRef.current, {
      schemaVersion: schemaVersionRef.current,
      replacer: serializeRef.current,
    });
    if (result === "ok") {
      dirtyRef.current = false;
      setStatus("saved");
    } else {
      setStatus(result); // "quota" | "unavailable"
    }
  }, []);

  const scheduleWrite = useCallback(() => {
    if (keyRef.current == null || suppressWriteRef.current) return;
    setStatus("saving");
    cancelDebounce();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushWrite();
    }, debounceMsRef.current);
  }, [cancelDebounce, flushWrite]);

  // ── Key / principal change: never carry the previous scope's draft over. ────
  useEffect(() => {
    if (keyRef.current === key) return;
    cancelDebounce();
    keyRef.current = key;
    dirtyRef.current = false;
    suppressWriteRef.current = false;
    setStatus("idle");
    const next = load(key);
    valueRef.current = next.value;
    setState(next);
  }, [key, load, cancelDebounce]);

  // ── Flush when the tab goes away (synchronous, no async work). ──────────────
  useEffect(() => {
    const onVisibility = () => {
      if (flushOnHideRef.current && document.visibilityState === "hidden") {
        cancelDebounce();
        flushWrite();
      }
    };
    const onPageHide = () => {
      if (flushOnHideRef.current) {
        cancelDebounce();
        flushWrite();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [cancelDebounce, flushWrite]);

  // ── Unmount: cancel pending work; optionally flush. ────────────────────────
  useEffect(() => {
    return () => {
      cancelDebounce();
      if (flushOnUnmountRef.current) flushWrite();
    };
  }, [cancelDebounce, flushWrite]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      suppressWriteRef.current = false;
      setState((s) => {
        const value = typeof next === "function" ? (next as (prev: T) => T)(s.value) : next;
        valueRef.current = value;
        return { ...s, value };
      });
      dirtyRef.current = true;
      scheduleWrite();
    },
    [scheduleWrite],
  );

  const patch = useCallback(
    (partial: Partial<T>) => {
      setValue((prev) => ({ ...prev, ...partial }));
    },
    [setValue],
  );

  const restore = useCallback(() => {
    setState((s) => {
      if (s.pending == null) return s;
      valueRef.current = s.pending;
      return { value: s.pending, pending: null, restored: true };
    });
    suppressWriteRef.current = false;
    dirtyRef.current = true;
    scheduleWrite();
  }, [scheduleWrite]);

  const discardPending = useCallback(() => {
    cancelDebounce();
    if (keyRef.current != null) clearDraft(keyRef.current);
    setState((s) => (s.pending == null ? s : { ...s, pending: null }));
  }, [cancelDebounce]);

  const clear = useCallback(() => {
    cancelDebounce();
    suppressWriteRef.current = true;
    dirtyRef.current = false;
    if (keyRef.current != null) clearDraft(keyRef.current);
    setStatus("idle");
    setState(() => {
      valueRef.current = initialValueRef.current;
      return { value: initialValueRef.current, pending: null, restored: false };
    });
  }, [cancelDebounce]);

  return {
    value: state.value,
    setValue,
    patch,
    pendingDraft: state.pending,
    restored: state.restored,
    restore,
    discardPending,
    clear,
    persistenceStatus: status,
  };
}
