import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  size?: "md" | "sm";
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  block,
  size = "md",
  loading,
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(styles.btn, styles[variant], block && styles.block, size === "sm" && styles.sm, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? "…" : children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  filled?: boolean;
  "aria-label": string;
}

export function IconButton({ filled, className, children, ...rest }: IconButtonProps) {
  return (
    <button className={clsx(styles.icon, filled && styles.filled, className)} {...rest}>
      {children}
    </button>
  );
}
