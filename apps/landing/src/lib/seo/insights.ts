/**
 * Regroupements calculés à partir des données réelles (jamais de texte
 * générique) : parcs par âge minimum, rues qui comptent plusieurs parcs.
 */
import { formatAddress, streetOf, type SeoPark } from "./parks";

export interface AgeGroup {
  minAge: number;
  parks: SeoPark[];
}

/** Parcs ayant une tranche d'âge complète, regroupés par âge minimum croissant. */
export function groupByMinAge(parks: SeoPark[]): AgeGroup[] {
  const map = new Map<number, SeoPark[]>();
  for (const park of parks) {
    if (park.minAge == null || park.maxAge == null) continue;
    map.set(park.minAge, [...(map.get(park.minAge) ?? []), park]);
  }
  return [...map.entries()].sort(([a], [b]) => a - b).map(([minAge, list]) => ({ minAge, parks: list }));
}

/** La section « par âge » n'a de sens que si elle distingue au moins 2 groupes. */
export function hasUsefulAgeSections(groups: AgeGroup[]): boolean {
  return groups.length >= 2;
}

export interface StreetCount {
  street: string;
  count: number;
}

/** Rues citées par au moins 2 parcs (adresse réelle, numéro retiré). */
export function repeatedStreets(parks: SeoPark[]): StreetCount[] {
  const counts = new Map<string, number>();
  for (const park of parks) {
    const street = streetOf(formatAddress(park));
    if (street) counts.set(street, (counts.get(street) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([street, count]) => ({ street, count }))
    .sort((a, b) => b.count - a.count || a.street.localeCompare(b.street, "fr"));
}
