/**
 * i18n — formatage localisé prêt à l'emploi dans les composants.
 *
 *   const f = useFormat();
 *   f.distance(1240)      → "1,2 km" / "1.2 km"
 *   f.rating(4.25)        → "4,3" / "4.3"
 *   f.walk(12)            → "12 min"
 *   f.count(37)           → "37"
 *   f.percent(80)         → "80 %" / "80%"
 *   f.ageRange(3, 6)      → "3–6 ans" / "3–6 años" / "3–6 yrs"
 *   f.ageRangeOrNull(...) → même chose, mais null quand l'âge est inconnu
 *   f.ageClause(3, 6)     → "de 3 à 6 ans" (fragment) | null
 *   f.ageBand(0, 12)      → "Tout âge" | null
 *
 * S'appuie sur les helpers `Intl` de `@toboggo/shared` (locale active) et sur le
 * namespace `common` pour les âges (pluriels an/ans gérés par i18next).
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  formatCount,
  formatDate,
  formatMeters,
  formatMinutes,
  formatPercent,
  formatRating,
} from "@toboggo/shared";
import { useLocale } from "./useLocale";

type AgeBandKey = "all" | "under3" | "3-6" | "6-12";

function ageBound(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function useFormat() {
  const { intlLocale } = useLocale();
  const { t } = useTranslation("common");

  return useMemo(() => {
    const ageRangeInner = (
      min: number | null | undefined,
      max: number | null | undefined,
    ): string | null => {
      const lo = ageBound(min);
      const hi = ageBound(max);
      if (lo === null && hi === null) return null;
      if (lo !== null && hi !== null) {
        return lo === hi
          ? t("age.single", { age: lo, count: lo })
          : t("age.range", { min: lo, max: hi, count: hi });
      }
      if (lo !== null) return t("age.from", { age: lo, count: lo });
      return t("age.upTo", { age: hi as number, count: hi as number });
    };

    return {
      locale: intlLocale,
      number: (n: number) => formatCount(n, intlLocale),
      count: (n: number) => formatCount(n, intlLocale),
      rating: (n: number) => formatRating(n, intlLocale),
      distance: (meters: number) => formatMeters(meters, intlLocale),
      walk: (minutes: number) => formatMinutes(minutes, intlLocale),
      percent: (v: number) => formatPercent(v, intlLocale),
      date: (value: Date | string | number) => formatDate(value, intlLocale),

      ageRange: (min: number | null | undefined, max: number | null | undefined): string =>
        ageRangeInner(min, max) ?? t("age.notSpecified"),

      ageRangeOrNull: (min: number | null | undefined, max: number | null | undefined): string | null =>
        ageRangeInner(min, max),

      ageClause(min: number | null | undefined, max: number | null | undefined): string | null {
        const lo = ageBound(min);
        const hi = ageBound(max);
        if (lo === null && hi === null) return null;
        if (lo !== null && hi !== null) {
          return lo === hi
            ? t("age.clauseSingle", { age: lo, count: lo })
            : t("age.clauseRange", { min: lo, max: hi, count: hi });
        }
        if (lo !== null) return t("age.clauseFrom", { age: lo, count: lo });
        return t("age.clauseUpTo", { age: hi as number, count: hi as number });
      },

      ageBand(min: number | null | undefined, max: number | null | undefined): string | null {
        const lo = ageBound(min);
        const hi = ageBound(max);
        if (lo === null || hi === null) return null;
        let key: AgeBandKey;
        if (lo === 0 && hi >= 12) key = "all";
        else if (hi <= 3) key = "under3";
        else if (lo >= 6) key = "6-12";
        else key = "3-6";
        return t(`age.band.${key}`);
      },
    };
  }, [intlLocale, t]);
}
