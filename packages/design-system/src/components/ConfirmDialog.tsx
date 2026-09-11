import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

export interface ConfirmOptions {
  title?: string;
  /** Plain text or short markup describing what will happen. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button as `danger` (destructive action). */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Non-native replacement for `window.confirm()` (back-office Lot 1 — audit
 * §6 bis / §20). Mount once near the app root. `useConfirm()` returns a
 * function resolving to `true`/`false`, so existing `if (!confirm(...)) return;`
 * call sites become `if (!(await confirm({...}))) return;`.
 */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const settle = useCallback(
    (value: boolean) => {
      pending?.resolve(value);
      setPending(null);
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    // Focus the non-destructive action by default (Escape / focus land on
    // Cancel, not on a possibly-destructive Confirm) — the Dialog primitive
    // itself doesn't manage focus, so this is scoped to this component only.
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") settle(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to whatever triggered the dialog (e.g. the "Supprimer"
      // button) once it closes, for any reason (confirm, cancel, Escape,
      // backdrop click).
      previouslyFocused.current?.focus();
    };
  }, [pending, settle]);

  const api = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <Dialog open={!!pending} onClose={() => settle(false)} title={pending?.title ?? "Confirmer"}>
        {pending && (
          <>
            <div style={{ fontSize: 13.5, color: "var(--color-text)", marginBottom: 4 }}>{pending.message}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Button ref={cancelRef} type="button" variant="secondary" block onClick={() => settle(false)}>
                {pending.cancelLabel ?? "Annuler"}
              </Button>
              <Button type="button" variant={pending.danger ? "danger" : "primary"} block onClick={() => settle(true)}>
                {pending.confirmLabel ?? "Confirmer"}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm() must be used within <ConfirmDialogProvider>.");
  return ctx;
}
