import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import sceneSvg from "../assets/04-playground-scene.svg";
import scenePng from "../assets/04-playground-scene.png";
import styles from "./VisitRatingPrompt.module.css";

/** Matches the CSS exit animation duration. */
export const VISIT_PROMPT_EXIT_MS = 180;
/** Brief beat showing the selected stars before handing off to the form. */
export const VISIT_PROMPT_SELECT_MS = 160;

// Same geometry as the sprite's `ic-star` symbol — inlined because the symbol
// hard-codes `fill="currentColor"`, which rules out the outlined empty state.
const STAR_PATH = "M12 3.4 14.3 9 20.4 9.6 15.8 13.7 17.1 19.7 12 16.5 6.9 19.7 8.2 13.7 3.6 9.6 9.7 9z";
const STARS = [1, 2, 3, 4, 5];

/**
 * Centered, iOS-rating-dialog-style modal asking the user to rate a park they
 * just got directions to. The stars ARE the call to action: picking N opens
 * the existing review flow with N preselected (`onRate`). "Plus tard", the ✕
 * and Escape close it without opening anything (`onClose`).
 *
 * While open, the app behind (`#root`) is made `inert`: visible under the
 * backdrop but unreachable by pointer, keyboard or assistive tech.
 */
export function VisitRatingPrompt({
  open,
  onRate,
  onClose,
}: {
  open: boolean;
  onRate: (stars: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(0);
  const [imgSrc, setImgSrc] = useState(sceneSvg);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open → mount fresh. Closed from outside while mounted → play the exit.
  useEffect(() => {
    if (open) {
      if (timer.current) clearTimeout(timer.current);
      setMounted(true);
      setLeaving(false);
      setHovered(0);
      setSelected(0);
    } else if (mounted) {
      setLeaving(true);
      timer.current = setTimeout(() => setMounted(false), VISIT_PROMPT_EXIT_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Background inert + focus in / focus restore.
  useEffect(() => {
    if (!mounted) return;
    const root = document.getElementById("root");
    const previouslyFocused = document.activeElement as HTMLElement | null;
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-hidden", "true");
    dialogRef.current?.focus();
    return () => {
      root?.removeAttribute("inert");
      root?.removeAttribute("aria-hidden");
      previouslyFocused?.focus?.();
    };
  }, [mounted]);

  if (!mounted) return null;

  const busy = leaving || selected > 0;
  const lit = selected || hovered;

  function close() {
    if (busy) return;
    onClose();
  }

  function pick(n: number) {
    if (busy) return;
    setSelected(n);
    timer.current = setTimeout(() => onRate(n), VISIT_PROMPT_SELECT_MS);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    // Focus trap — the page behind is inert anyway, this keeps Tab cycling.
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className={styles.backdrop} data-state={leaving ? "closing" : "open"} data-testid="visit-prompt-backdrop">
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <button type="button" className={styles.close} aria-label={t("visitPrompt.close")} onClick={close}>
          <Icon name="ic-close" size={18} />
        </button>

        <div className={styles.body}>
          <img
            className={styles.illustration}
            src={imgSrc}
            alt=""
            width={475}
            height={305}
            onError={() => {
              if (imgSrc !== scenePng) setImgSrc(scenePng);
            }}
          />
          <h2 id={titleId} className={styles.title}>
            {t("visitPrompt.title")}
          </h2>
          <p id={descId} className={styles.description}>
            {t("visitPrompt.description")}
          </p>

          <div className={styles.stars} onPointerLeave={() => setHovered(0)}>
            {STARS.map((n) => (
              <button
                key={n}
                type="button"
                className={styles.star}
                aria-label={t("visitPrompt.starLabel", { count: n })}
                aria-pressed={selected === n}
                data-lit={n <= lit ? "1" : undefined}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") setHovered(n);
                }}
                onFocus={() => setHovered(n)}
                onBlur={() => setHovered(0)}
                onClick={() => pick(n)}
              >
                <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
                  <path d={STAR_PATH} />
                </svg>
              </button>
            ))}
          </div>
        </div>

        <button type="button" className={styles.later} onClick={close}>
          {t("visitPrompt.later")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
