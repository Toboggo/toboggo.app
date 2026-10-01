import styles from "./FilterSelect.module.css";

export interface FilterSelectOption {
  value: string;
  label: string;
}

/**
 * One compact filter chip ("Tous types ▾"). Backed by a real `<select>`
 * (invisible, stretched over the whole chip) rather than a custom JS
 * dropdown: a native select's popup is never clipped by the filter row's
 * horizontal scroll, needs no positioning code, and is keyboard/
 * screen-reader accessible for free. `value === options[0].value` (the
 * "all …" option) is treated as the inactive/default state.
 */
export function FilterSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const active = options.length > 0 && value !== options[0]?.value;
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <span className={styles.chip} data-active={active ? "1" : undefined}>
      <span aria-hidden>{current?.label}</span>
      <svg className={styles.chevron} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select className={styles.select} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
