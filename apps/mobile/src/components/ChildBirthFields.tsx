import { Select } from "@toboggo/design-system";
import { MAX_CHILD_AGE_YEARS } from "@toboggo/shared";
import { useLocale } from "../i18n/useLocale";

/**
 * Month + year of birth — two native selects (the iOS/Android wheel picker
 * beats any custom widget for "few taps, no typing"). Years are capped at
 * `MAX_CHILD_AGE_YEARS` (Toboggo's existing park-recommendation ceiling) and
 * future months are simply not offered once the current year is selected —
 * there's no need for a "not in the future" error state.
 */
export function ChildBirthFields({
  birthMonth,
  birthYear,
  onChangeMonth,
  onChangeYear,
  monthLabel,
  yearLabel,
  monthPlaceholder,
  yearPlaceholder,
}: {
  birthMonth: number | null;
  birthYear: number | null;
  onChangeMonth: (month: number | null) => void;
  onChangeYear: (year: number | null) => void;
  monthLabel: string;
  yearLabel: string;
  monthPlaceholder: string;
  yearPlaceholder: string;
}) {
  const { intlLocale } = useLocale();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // The 0–MAX_CHILD_AGE_YEARS window is a *creation* convenience, not a data
  // limit (see childAge.ts) — a child created years ago can be older than
  // that by now. Editing one must still show and let the parent keep their
  // real birth year, so it's added back in if it has aged out of the window.
  const baseYears = Array.from({ length: MAX_CHILD_AGE_YEARS + 1 }, (_, i) => currentYear - i);
  const years =
    birthYear != null && !baseYears.includes(birthYear)
      ? [...baseYears, birthYear].sort((a, b) => b - a)
      : baseYears;
  const maxMonth = birthYear === currentYear ? currentMonth : 12;
  const months = Array.from({ length: maxMonth }, (_, i) => i + 1);
  const monthFormatter = new Intl.DateTimeFormat(intlLocale, { month: "long" });

  return (
    <div style={{ display: "flex", gap: 12 }}>
      <Select
        label={monthLabel}
        value={birthMonth ?? ""}
        onChange={(e) => onChangeMonth(e.target.value ? Number(e.target.value) : null)}
        style={{ flex: 1 }}
      >
        <option value="">{monthPlaceholder}</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {monthFormatter.format(new Date(2000, m - 1, 1))}
          </option>
        ))}
      </Select>
      <Select
        label={yearLabel}
        value={birthYear ?? ""}
        onChange={(e) => {
          const y = e.target.value ? Number(e.target.value) : null;
          onChangeYear(y);
          // A month picked while a younger year was selected can become a
          // future month under the new (older) year's cap — clear it rather
          // than silently keep an impossible combination.
          if (y === currentYear && birthMonth != null && birthMonth > currentMonth) onChangeMonth(null);
        }}
        style={{ flex: 1 }}
      >
        <option value="">{yearPlaceholder}</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  );
}
