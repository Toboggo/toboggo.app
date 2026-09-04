import { useCallback, useRef, useState } from "react";
import { useToast } from "@toboggo/design-system";

interface AsyncActionOptions {
  /** Shown as a success toast once the action resolves. Omit for actions that
   * already give their own feedback (e.g. opening a modal). */
  successMessage?: string;
  /** Overrides the generic error toast message. */
  errorMessage?: (error: unknown) => string;
}

const DEFAULT_ERROR_MESSAGE = "Une erreur est survenue. Veuillez réessayer.";

/**
 * Wraps an async action (a mutation) so that: (1) a second call is ignored
 * while the first is still in flight — no double submission — and (2) any
 * error is caught and surfaced as a toast instead of an unhandled rejection
 * silently swallowed by a React event handler (Lot 1 — audit §6 bis / §20,
 * objectifs 5 et 6).
 */
export function useAsyncAction<Args extends unknown[]>(
  fn: (...args: Args) => Promise<unknown>,
  options: AsyncActionOptions = {},
) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const toast = useToast();
  const { successMessage, errorMessage } = options;

  const run = useCallback(
    async (...args: Args) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      try {
        await fn(...args);
        if (successMessage) toast.success(successMessage);
      } catch (error) {
        toast.error(errorMessage ? errorMessage(error) : DEFAULT_ERROR_MESSAGE);
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [fn, successMessage, errorMessage, toast],
  );

  return { run, pending };
}
