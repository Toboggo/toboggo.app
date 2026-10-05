import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import type { StatusVisual } from "../lib/contributionPresentation";
import styles from "./StatusPill.module.css";

/** Compact status pictogram of a contribution. It is a real button: touch or
 * keyboard (Enter / Space) reveals the full status label next to it, and its
 * accessible name states the status. It sits outside the row's own button, so
 * using it never opens the row. */
export function StatusPill({ label, visual }: { label: string; visual: StatusVisual }) {
  const { t } = useTranslation("contribute");
  const [open, setOpen] = useState(false);
  const bubbleId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointer = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const timer = window.setTimeout(close, 4000);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.pill}
        data-tone={visual.tone}
        aria-label={t("hub.statusAria", { status: label })}
        aria-expanded={open}
        aria-describedby={open ? bubbleId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={visual.icon} size={15} />
      </button>
      {open && (
        <span id={bubbleId} role="status" className={styles.bubble}>
          {label}
        </span>
      )}
    </span>
  );
}
