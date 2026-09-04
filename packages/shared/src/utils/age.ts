/**
 * Park age-range display.
 *
 * During the V1/V2 coexistence the `park_public` projection can return
 * `age_min` / `age_max` as null even though the generated types say `number`.
 * Rendered naïvely this surfaced as "null–null ans" (template literals) or
 * "Adapté aux enfants – ans" (JSX children). These helpers never print a
 * missing bound, `null`, `undefined` or `NaN`.
 */

function ageBound(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Compact standalone label — chips, list meta rows, comparison table.
 * "3–6 ans" · "Dès 3 ans" · "Jusqu'à 10 ans" · "Âge non renseigné"
 */
export function formatAgeRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  const lo = ageBound(min);
  const hi = ageBound(max);
  if (lo === null && hi === null) return "Âge non renseigné";
  if (lo !== null && hi !== null) return lo === hi ? `${lo} ans` : `${lo}–${hi} ans`;
  if (lo !== null) return `Dès ${lo} ans`;
  return `Jusqu'à ${hi} ans`;
}

/**
 * Sentence fragment for "(Très) adapté aux enfants <clause>".
 * "de 3 à 6 ans" · "dès 3 ans" · "jusqu'à 10 ans".
 * Returns null when no age is known — the caller should fall back to a
 * standalone phrase (e.g. "Tranche d'âge non précisée").
 */
export function formatAgeClause(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  const lo = ageBound(min);
  const hi = ageBound(max);
  if (lo === null && hi === null) return null;
  if (lo !== null && hi !== null) return lo === hi ? `de ${lo} ans` : `de ${lo} à ${hi} ans`;
  if (lo !== null) return `dès ${lo} ans`;
  return `jusqu'à ${hi} ans`;
}
