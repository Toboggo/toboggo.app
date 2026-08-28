import clsx from "clsx";
import styles from "./Segmented.module.css";

export interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Segmented<T extends string>({ options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={clsx(styles.wrap, className)} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          className={clsx(styles.opt, opt.value === value && styles.active)}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
}) {
  const body = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={clsx(styles.switch, checked && styles.on)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  );
  if (!label) return body;
  return (
    <div className={styles.toggleWrap}>
      <div>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14 }}>{label}</div>
        {description && (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{description}</div>
        )}
      </div>
      {body}
    </div>
  );
}
