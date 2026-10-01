import { useEffect } from "react";
import type { ReactNode, TableHTMLAttributes } from "react";
import clsx from "clsx";
import { Icon, type IconName } from "../icons/Icon";
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

/**
 * Compact metric tile — used both for simple counters (`Maintenance`) and, with
 * `icon`/`tone`, as the Dashboard KPI strip's building block (COLL-02). `icon`
 * and `tone` are optional and additive: every existing call site (no icon, no
 * tone) renders exactly as before.
 */
export function StatCard({
  value,
  label,
  icon,
  tone = "neutral",
  emphasized,
  onClick,
  secondary,
}: {
  value: ReactNode;
  label: string;
  /** Sprite icon shown in a small tinted badge — omit rather than inventing
   * one (see `NAV_ICON_GAPS` in the back office `Shell`). */
  icon?: IconName;
  /** Tints the icon badge and the value. `warning` is reserved for a real
   * count that needs attention (> 0) — it also colours the value. `primary`
   * / `accent` are static category tints (brand green / amber) for a
   * healthy, non-alert metric — icon only, the value stays plain text so it
   * remains the dominant element (COLL-02D §1). */
  tone?: "neutral" | "warning" | "primary" | "accent";
  /** Opt-in "headline KPI" treatment (larger value, a discreet neutral-bordered
   * frame) — off by default so existing callers (e.g. `Maintenance`'s 3 plain
   * counters) render exactly as before. */
  emphasized?: boolean;
  onClick?: () => void;
  /** Extra line under the label — a real derived figure only (e.g. an average
   * rating), never a placeholder. Omitted entirely when there is nothing real
   * to show (COLL-02C). */
  secondary?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={clsx(styles.statCard, tone !== "neutral" && styles[`tone-${tone}`], emphasized && styles.emphasized)}
      onClick={onClick}
      disabled={!onClick}
    >
      {icon && (
        <span className={styles.statIcon}>
          <Icon name={icon} size={emphasized ? 20 : 18} />
        </span>
      )}
      <span className={styles.statBody}>
        <span className={styles.statValue}>{value}</span>
        <span className={styles.statLabel}>{label}</span>
        {secondary && <span className={styles.statSecondary}>{secondary}</span>}
      </span>
    </button>
  );
}

export function Table({ className, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={clsx(styles.table, className)} {...rest} />;
}
