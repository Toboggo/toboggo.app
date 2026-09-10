/**
 * Formatage international — helpers `Intl.*` purs.
 *
 * PRÉPARATION (audit i18n §E / §I). Chaque fonction reçoit explicitement une
 * `locale` BCP-47 (côté app : `useLocale().intlLocale`). Aucune locale « fr-FR »
 * codée en dur, aucun `.replace(".", ",")`.
 *
 * L'existant (`utils/distance.ts`, `utils/age.ts`) n'est pas retiré dans cette
 * phase : la migration des écrans vers ces helpers se fera lot par lot. Les noms
 * sont volontairement distincts de `utils/distance.ts` (`formatDistance`) pour
 * éviter toute collision de ré-export dans `packages/shared/src/index.ts`.
 */

export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Entier localisé (séparateurs de milliers) — nombres de parcs, d'avis, etc. */
export function formatCount(value: number, locale: string): string {
  return formatNumber(Math.round(value), locale, { maximumFractionDigits: 0 });
}

/** Note sur 5 : « 4,2 » en fr / es, « 4.2 » en en. */
export function formatRating(value: number, locale: string, fractionDigits = 1): string {
  return formatNumber(value, locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Distance lisible à partir de mètres : « 420 m » / « 1,2 km » selon la locale. */
export function formatMeters(meters: number, locale: string): string {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1000) {
    return `${formatNumber(Math.round(meters / 10) * 10, locale)} m`;
  }
  return `${formatNumber(meters / 1000, locale, { maximumFractionDigits: 1 })} km`;
}

/** Durée courte en minutes : « 5 min » — unité localisée via Intl. */
export function formatMinutes(minutes: number, locale: string): string {
  if (!Number.isFinite(minutes)) return "";
  const rounded = Math.max(0, Math.round(minutes));
  try {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "minute",
      unitDisplay: "short",
    }).format(rounded);
  } catch {
    return `${formatNumber(rounded, locale)} min`;
  }
}

/** Pourcentage entier : « 80 % » (fr/es) / « 80% » (en). */
export function formatPercent(value0to100: number, locale: string): string {
  if (!Number.isFinite(value0to100)) return "";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value0to100 / 100);
}

export function formatDate(
  value: Date | string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatDateTime(
  value: Date | string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  return formatDate(value, locale, options);
}
