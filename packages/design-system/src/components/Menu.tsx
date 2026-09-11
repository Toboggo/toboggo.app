import { cloneElement, useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import clsx from "clsx";
import styles from "./Menu.module.css";

export interface MenuProps {
  /** A single focusable element (typically a `Button`) — cloned with the
   * `onClick`/`aria-haspopup`/`aria-expanded` props it needs to act as the
   * menu's trigger. Must accept a `ref` (design-system `Button` does, since
   * Lot 1's `forwardRef`). */
  trigger: ReactElement;
  /** `MenuItem`s (and optionally plain, non-interactive content, e.g. a
   * label line) rendered inside the panel. */
  children: ReactNode;
  /** Accessible name for the menu itself (`aria-label` on the listbox). */
  label: string;
  align?: "start" | "end";
  className?: string;
}

/**
 * Accessible dropdown menu (back-office Lot 2 — audit §6 bis / §20). Used by
 * `AppHeader`'s user menu. Deliberately minimal: one open/closed panel, no
 * submenus, no positioning library — `position: absolute` under the trigger
 * is enough for a header menu at any of the viewport widths this app targets.
 */
export function Menu({ trigger, children, label, align = "end", className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Focus the first menu item when the panel opens.
  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  // Escape, click-outside, and focus-return to the trigger — all close the
  // menu the same way (one effect, one code path) so they can't drift apart.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        if (!items.length) return;
        const current = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    }
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      // Focus-return: whatever the reason the panel closes (Escape, outside
      // click, or an item activating), send focus back to the trigger.
      triggerRef.current?.focus();
    };
  }, [open, close]);

  const clonedTrigger = cloneElement(trigger, {
    ref: triggerRef,
    onClick: () => setOpen((o) => !o),
    "aria-haspopup": "menu",
    "aria-expanded": open,
  });

  return (
    <div className={clsx(styles.wrap, className)}>
      {clonedTrigger}
      {open && (
        // A menuitem's own onClick (the caller's onSelect) always runs
        // before this one bubbles up (DOM event order), so closing here
        // never races the item's action.
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          className={clsx(styles.panel, align === "start" ? styles.alignStart : styles.alignEnd)}
          onClick={close}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onSelect,
  children,
  danger,
}: {
  onSelect: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button type="button" role="menuitem" className={clsx(styles.item, danger && styles.danger)} onClick={onSelect}>
      {children}
    </button>
  );
}

/** Non-interactive descriptive line inside a menu panel (e.g. the current
 * role) — not a `menuitem`, so keyboard arrow navigation skips it. */
export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className={styles.label}>{children}</div>;
}
