/** Regroupement des villes publiées par département pour le hub (prêt pour plusieurs départements). */
import type { PlaceData } from "./seoSite";

export interface DepartmentGroup {
  name: string;
  places: PlaceData[];
}

const UNKNOWN_DEPARTMENT = "Autres villes";

/** Départements triés par nom ; villes triées par nom ; « Autres villes » en dernier. */
export function groupByDepartment(places: readonly PlaceData[]): DepartmentGroup[] {
  const map = new Map<string, PlaceData[]>();
  for (const data of places) {
    const name = data.place.department ?? UNKNOWN_DEPARTMENT;
    map.set(name, [...(map.get(name) ?? []), data]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === UNKNOWN_DEPARTMENT ? 1 : b === UNKNOWN_DEPARTMENT ? -1 : a.localeCompare(b, "fr")))
    .map(([name, list]) => ({ name, places: [...list].sort((a, b) => a.place.name.localeCompare(b.place.name, "fr")) }));
}
