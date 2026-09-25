import { useEffect } from "react";
import type { ReactNode, TableHTMLAttributes } from "react";
import clsx from "clsx";
import { Icon, type IconName } from "../icons/Icon";
import { Button } from "./Button";
import styles from "./Misc.module.css";

export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className={styles.stepDots}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={clsx(styles.dot, i === current && styles.active, i < current && styles.done)}
        />
      ))}
    </div>
  );
}

export function Toast({ message, onDone, duration = 2200 }: { message: string | null; onDone: () => void; duration?: number }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [message, onDone, duration]);
  if (!message) return null;
  return <div className={styles.toastWrap}>{message}</div>;
}

export function EmptyState({
  icon,
  iconName,
  title,
  description,
}: {
  /** Sprite icon — preferred. */
  iconName?: IconName;
  /** Emoji fallback, for concepts without a validated sprite icon yet. */
  icon?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className={styles.empty}>
      {iconName ? (
        <div className={styles.emptyIcon}>
          <Icon name={iconName} size={40} />
        </div>
      ) : (
        icon && <div className={styles.emptyIcon}>{icon}</div>
      )}
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 15, color: "var(--color-text)" }}>
        {title}
      </div>
      {description && <div style={{ marginTop: 4, fontSize: 13 }}>{description}</div>}
    </div>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}

export interface StatCardTrend {
  /** Already-formatted, caller-supplied display text (e.g. "+12 %", "-3").
   * Never computed here — Admin-UI-7B: no fabricated/fictional trend. */
  label: string;
  /** Purely cosmetic direction (color) — not derived from `label`. */
  direction?: "up" | "down" | "neutral";
}

export interface StatCardProps {
  value: ReactNode;
  label: string;
  /** Sprite icon shown above the value (Admin-UI-7B — KPI cards). Optional:
   * omitted, the card renders exactly as before. */
  icon?: IconName;
  /** Secondary/contextual line (e.g. "dont 2 critiques"). */
  hint?: ReactNode;
  /** Optional delta/tendency, real data only — see `StatCardTrend`. */
  trend?: StatCardTrend;
  tone?: "primary" | "warning" | "error" | "info" | "neutral";
  onClick?: () => void;
  /** Admin-UI-7D-D: renders the tinted icon circle even when `icon` is
   * omitted, so a row of StatCards stays visually aligned (same circle,
   * same diameter) while a real pictogram is still missing for some of
   * them. Default false — existing icon-less callers (e.g. Maintenance.tsx)
   * keep rendering with no circle at all. */
  alwaysShowIcon?: boolean;
}

/**
 * Common stat/KPI tile primitive (Admin-UI-7B — Visual Foundation). Existing
 * calls (`<StatCard value label onClick? />`, e.g. Maintenance.tsx) keep
 * rendering identically: `icon`/`hint`/`trend`/`tone` are all optional and
 * additive. Not yet wired into Dashboard.tsx (7D will migrate it there).
 */
export function StatCard({ value, label, icon, hint, trend, tone = "neutral", onClick, alwaysShowIcon }: StatCardProps) {
  return (
    <button
      type="button"
      className={clsx(styles.statCard, tone !== "neutral" && styles[`tone-${tone}`])}
      onClick={onClick}
      disabled={!onClick}
    >
      {(icon || alwaysShowIcon) && (
        <span className={styles.statIcon}>{icon && <Icon name={icon} size={14} />}</span>
      )}
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
      {(hint || trend) && (
        <div className={styles.statMeta}>
          {trend && (
            <span className={clsx(styles.statTrend, trend.direction && styles[`trend-${trend.direction}`])}>
              {trend.label}
            </span>
          )}
          {hint && <span className={styles.statHint}>{hint}</span>}
        </div>
      )}
    </button>
  );
}

/**
 * Compact inline error pattern (Admin-UI-7B), extracted from the one that
 * already lived privately inside Dashboard.tsx (`ErrorInline`) so it can be
 * reused elsewhere. Dashboard's own copy is deliberately left as-is for now
 * (7D will consolidate it onto this one) — this lot only prepares the shared
 * primitive, it does not migrate any screen.
 */
export function ErrorState({ message = "Impossible de charger ces données.", onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className={styles.errorState}>
      <span>{message}</span>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Réessayer
      </Button>
    </div>
  );
}

export function Table({ className, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={clsx(styles.table, className)} {...rest} />;
}

/** Generic loading placeholder bar — same discreet pulse as `DataTable`'s
 * built-in skeleton rows, factored out so any screen can shape its own
 * loading state (dashboard tiles, stat strips, …) without duplicating the
 * animation. Not a layout primitive: callers size it via `width`/`height`. */
export function Skeleton({ width = "100%", height = 12 }: { width?: number | string; height?: number | string }) {
  return <span className={styles.skeleton} style={{ width, height }} aria-hidden="true" />;
}
