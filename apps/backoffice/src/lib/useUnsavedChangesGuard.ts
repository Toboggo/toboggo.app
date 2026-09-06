import { useCallback, useEffect } from "react";
import { useConfirm } from "@toboggo/design-system";

/**
 * Minimal guard against losing unsaved form edits (AR-9).
 *
 * The app mounts a classic `<BrowserRouter>` (not a data router), so
 * react-router's `useBlocker` is unavailable and a full navigation block would
 * mean migrating the whole routing tree — out of scope for this lot. Instead:
 *
 *  - `beforeunload` covers tab close / reload / external navigation (the
 *    browser's own prompt — never `window.confirm`).
 *  - `confirmIfDirty()` is called explicitly at the in-app exits the page
 *    controls (tab switch, "back to list" link).
 *
 * Known limit: a sidebar link or the browser Back button while dirty is NOT
 * intercepted. Acceptable here — edit mode is an explicit toggle with a
 * visible Save/Cancel bar.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const confirm = useConfirm();

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    return confirm({
      title: "Modifications non enregistrées",
      message: "Vous avez des modifications non enregistrées. Les abandonner ?",
      confirmLabel: "Abandonner",
      danger: true,
    });
  }, [dirty, confirm]);
}
