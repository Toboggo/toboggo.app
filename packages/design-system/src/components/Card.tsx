import type { HTMLAttributes } from "react";
import clsx from "clsx";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  flat?: boolean;
  padding?: "md" | "sm";
  /**
   * Admin-UI-7B — Visual Foundation: opt-in dense surface matching the target
   * design (tighter radius, subtle neutral border, no shadow by default)
   * instead of the current default (`--radius-lg`, warm-tinted border on
   * `flat`). Existing callers are unaffected — `variant` defaults to
   * `"default"`, which renders exactly as before.
   */
  variant?: "default" | "admin";
  /** Only meaningful with `variant="admin"`: adds a very light `--shadow-sm`.
   * Off by default — the admin variant is a flat, bordered surface. */
  shadow?: boolean;
}

export function Card({ flat, padding = "md", variant = "default", shadow = false, className, ...rest }: CardProps) {
  return (
    <div
      className={clsx(
        styles.card,
        flat && styles.flat,
        padding === "sm" && styles["pad-sm"],
        variant === "admin" && styles.admin,
        variant === "admin" && shadow && styles.adminShadow,
        className,
      )}
      {...rest}
    />
  );
}
