import { useRef, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";
import styles from "./Tabs.module.css";

export interface TabItem {
  value: string;
  label: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  /** Called when the user picks a tab (click or keyboard). The parent owns the
   * state, so it can veto the change — e.g. to confirm unsaved edits first. */
  onValueChange: (value: string) => void;
  /** Accessible name for the tablist (required). */
  label: string;
  /** Prefix for the generated `id`s tying each tab to its panel. */
  idBase: string;
  className?: string;
}

function tabId(idBase: string, value: string) {
  return `${idBase}-tab-${value}`;
}
export function tabPanelId(idBase: string, value: string) {
  return `${idBase}-panel-${value}`;
}

/**
 * Accessible tab strip (WAI-ARIA Tabs pattern, automatic activation):
 * `role="tablist"` / `role="tab"`, roving `tabindex`, Arrow/Home/End move and
 * select, each tab `aria-controls` its panel. Purpose-built rather than
 * reusing `Segmented` (which borrows `role="tablist"` for filter chips — the
 * a11y debt flagged in the audit).
 */
export function Tabs({ items, value, onValueChange, label, idBase, className }: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = items.findIndex((it) => it.value === value);
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = items.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    const next = items[nextIndex];
    refs.current[nextIndex]?.focus();
    if (next.value !== value) onValueChange(next.value);
  }

  return (
    <div role="tablist" aria-label={label} className={clsx(styles.tablist, className)} onKeyDown={onKeyDown}>
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={tabId(idBase, item.value)}
            aria-selected={selected}
            aria-controls={tabPanelId(idBase, item.value)}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={() => {
              if (!selected) onValueChange(item.value);
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  idBase: string;
  value: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ idBase, value, active, children, className }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(idBase, value)}
      aria-labelledby={tabId(idBase, value)}
      tabIndex={0}
      hidden={!active}
      className={clsx(styles.panel, className)}
    >
      {active ? children : null}
    </div>
  );
}
