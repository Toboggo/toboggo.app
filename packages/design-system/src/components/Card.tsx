import type { HTMLAttributes } from "react";
import clsx from "clsx";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  flat?: boolean;
  padding?: "md" | "sm";
}

export function Card({ flat, padding = "md", className, ...rest }: CardProps) {
  return (
    <div
      className={clsx(styles.card, flat && styles.flat, padding === "sm" && styles["pad-sm"], className)}
      {...rest}
    />
  );
}
