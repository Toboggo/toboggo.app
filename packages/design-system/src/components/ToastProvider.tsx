import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import styles from "./ToastProvider.module.css";

export type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  /** Show a toast. Convenience: `toast.success("…")` / `toast.error("…")`. */
  show: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 4000;

/**
 * Back-office feedback primitive (Lot 1 — audit §6 bis / §20). Mount once near
 * the app root (`main.tsx`). Distinct from the mobile app's `Toast` (Misc.tsx) —
 * that component and its bottom-sheet-era CSS stay untouched, this is a new,
 * self-contained provider for a desktop-first, stacked, tone-aware toast.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  // Tracks each toast's auto-dismiss timer so a manual dismissal (the ✕
  // button) cancels it instead of leaving it to fire later on an id that's
  // already gone, and so the provider unmounting (in practice: only in tests
  // — it lives at the app root for the lifetime of the app) clears every
  // pending timer instead of leaking them.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer != null) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setItems((list) => [...list, { id, tone, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const trackedTimers = timers.current;
    return () => {
      trackedTimers.forEach((timer) => clearTimeout(timer));
      trackedTimers.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show(message, "success"),
      error: (message) => show(message, "error"),
      info: (message) => show(message, "info"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className={styles.stack} role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={clsx(styles.toast, styles[t.tone])}>
              <span>{t.message}</span>
              <button
                type="button"
                className={styles.close}
                aria-label="Fermer la notification"
                onClick={() => dismiss(t.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

/** Throws if used outside `ToastProvider` — a missing provider is a wiring bug,
 * not a state to silently degrade from. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be used within <ToastProvider>.");
  return ctx;
}
