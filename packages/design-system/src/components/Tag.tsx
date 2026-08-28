import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import clsx from "clsx";
import styles from "./Tag.module.css";

type Tone = "neutral" | "primary" | "accent" | "info" | "error" | "warning";

export function Tag({
  tone = "neutral",
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={clsx(styles.tag, tone !== "neutral" && styles[tone], className)} {...rest} />;
}

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function Chip({ active, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      className={clsx(styles.tag, styles.selectable, active && styles.active, className)}
      {...rest}
    />
  );
}
