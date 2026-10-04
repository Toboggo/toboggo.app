import type { Park } from "@toboggo/shared";

/**
 * Modèle pur du parcours « Ajouter un parc » (aucune dépendance React).
 *
 * Règle centrale : on n'envoie que ce que le parent a réellement indiqué.
 * « Je ne sais pas » / « ? » ne devient JAMAIS un `false` ni une plage d'âge
 * inventée — la clé est simplement absente du payload de `createPark`.
 */

// ── Tranches d'âge ──────────────────────────────────────────────────────
// Le stockage (`parks.min_age` / `max_age`) ne porte qu'UNE plage continue.
// Les tranches sont donc contiguës par construction : on refuse de composer
// des tranches disjointes (ex. 0–3 + 6–12) plutôt que de les convertir
// silencieusement en 0–12, qui prétendrait couvrir 3–6 ans.
export const AGE_BANDS = [
  { id: "0-3", min: 0, max: 3 },
  { id: "3-6", min: 3, max: 6 },
  { id: "6-12", min: 6, max: 12 },
  // 12 est le plafond d'âge de l'app (curseur d'origine, `MAX_CHILD_AGE_YEARS`).
  { id: "12+", min: 12, max: 12 },
] as const;

export type AgeBandId = (typeof AGE_BANDS)[number]["id"];

const bandIndex = (id: string) => AGE_BANDS.findIndex((b) => b.id === id);

/** Indices triés des tranches sélectionnées (ids inconnus ignorés). */
function sortedIndexes(selected: readonly string[]): number[] {
  return selected.map(bandIndex).filter((i) => i >= 0).sort((a, b) => a - b);
}

/**
 * Bascule une tranche. Reste contiguë : on ne peut ajouter qu'une tranche
 * voisine du bloc existant, et ne retirer qu'une extrémité du bloc.
 * `rejected` = le geste aurait produit des tranches disjointes (rien ne change).
 */
export function toggleAgeBand(
  selected: readonly string[],
  id: AgeBandId,
): { next: AgeBandId[]; rejected: boolean } {
  const idx = sortedIndexes(selected);
  const current = idx.map((i) => AGE_BANDS[i].id);
  const target = bandIndex(id);
  if (target < 0) return { next: current, rejected: false };

  if (idx.includes(target)) {
    const isEnd = target === idx[0] || target === idx[idx.length - 1];
    if (!isEnd) return { next: current, rejected: true };
    return { next: current.filter((b) => b !== id), rejected: false };
  }
  if (idx.length === 0) return { next: [id], rejected: false };
  const adjacent = target === idx[0] - 1 || target === idx[idx.length - 1] + 1;
  if (!adjacent) return { next: current, rejected: true };
  const merged = [...idx, target].sort((a, b) => a - b).map((i) => AGE_BANDS[i].id);
  return { next: merged, rejected: false };
}

/** Plage `[min, max]` couverte par les tranches, ou `null` si aucune (= inconnu). */
export function ageRangeFromBands(selected: readonly string[]): { min: number; max: number } | null {
  const idx = sortedIndexes(selected);
  if (idx.length === 0) return null;
  return { min: AGE_BANDS[idx[0]].min, max: AGE_BANDS[idx[idx.length - 1]].max };
}

// ── Services / accès : Oui / Non / ? ────────────────────────────────────
export type ServiceKey = "wc" | "benches" | "water" | "parking" | "shade" | "fenced" | "pmr";
export type Answer = "yes" | "no";
/** Une clé absente = inconnu (état par défaut). */
export type Answers = Partial<Record<ServiceKey, Answer>>;

export const SERVICE_GROUPS: { titleKey: string; keys: ServiceKey[] }[] = [
  { titleKey: "addPark.details.services", keys: ["wc", "benches", "water", "parking"] },
  { titleKey: "addPark.details.comfort", keys: ["shade", "fenced", "pmr"] },
];

export const SERVICE_KEYS: ServiceKey[] = SERVICE_GROUPS.flatMap((g) => g.keys);

/** Pose / retire (`null` = « ? ») une réponse sans muter l'objet d'origine. */
export function setAnswer(answers: Answers, key: ServiceKey, value: Answer | null): Answers {
  const next = { ...answers };
  if (value === null) delete next[key];
  else next[key] = value;
  return next;
}

/** Oui → true, Non → false, inconnu → clé absente (jamais `false`). */
export function applyAnswers(input: Partial<Park>, answers: Answers): void {
  for (const key of SERVICE_KEYS) {
    const a = answers[key];
    if (a === "yes") input[key] = true;
    else if (a === "no") input[key] = false;
  }
}

// ── Jeux ────────────────────────────────────────────────────────────────
/** Premiers jeux proposés (codes du catalogue `features`, catégorie `play`). */
export const PRIMARY_GAME_CODES = ["slide", "swing", "climbing", "springer", "sandbox", "carousel"] as const;

/**
 * `parks.name` est NOT NULL : un parc sans nom reçoit le libellé générique
 * que les imports OSM écrivent déjà. `getParkDisplayName` le reconnaît comme
 * générique et affiche « Aire de jeux • <rue> » — jamais un nom inventé.
 */
export const GENERIC_PARK_NAME = "Aire de jeux";
