/**
 * Child age, derived from birth month + year — never a stored/persisted age,
 * never a fabricated day of birth (Toboggo only ever asks for month + year).
 *
 * Convention (no day of birth is known): the age increments on the 1st of the
 * birth month. A child born in September turns N as soon as the calendar
 * reaches September of year (birth_year + N), not on a specific day within
 * that month. This matches the precision Toboggo actually needs for its
 * age-based park recommendations.
 */

export interface ChildBirth {
  /** 1–12. */
  birth_month: number;
  birth_year: number;
}

/**
 * Oldest age Toboggo's park recommendations are meaningful for — mirrors the
 * existing `parks.age_max` default (0001_init.sql) and the onboarding age
 * slider's own 0–12 range (Permissions.tsx). Used to bound the birth-year
 * picker; not a new product decision, just reusing the app's existing ceiling.
 */
export const MAX_CHILD_AGE_YEARS = 12;

function isValidBirth(birth: ChildBirth): boolean {
  const { birth_month, birth_year } = birth;
  return (
    Number.isInteger(birth_month) &&
    birth_month >= 1 &&
    birth_month <= 12 &&
    Number.isInteger(birth_year)
  );
}

function isFutureBirth(birth: ChildBirth, at: Date): boolean {
  const nowYear = at.getFullYear();
  const nowMonth = at.getMonth() + 1;
  return birth.birth_year > nowYear || (birth.birth_year === nowYear && birth.birth_month > nowMonth);
}

/**
 * Current age in whole years, or `null` for invalid or not-yet-possible
 * (future) birth data — callers should treat `null` as "unknown", the same
 * way `formatAgeRange` treats a missing park age bound.
 */
export function computeChildAge(birth: ChildBirth, at: Date = new Date()): number | null {
  if (!isValidBirth(birth) || isFutureBirth(birth, at)) return null;
  const nowYear = at.getFullYear();
  const nowMonth = at.getMonth() + 1;
  let age = nowYear - birth.birth_year;
  if (nowMonth < birth.birth_month) age -= 1;
  return age;
}
