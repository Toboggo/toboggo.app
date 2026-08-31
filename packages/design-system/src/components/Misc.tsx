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

export function StatCard({
  value,
  label,
  onClick,
}: {
  value: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" className={styles.statCard} onClick={onClick} disabled={!onClick}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </button>
  );
}

export function Table({ className, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={clsx(styles.table, className)} {...rest} />;
}
