import type { Json } from "@toboggo/shared";

/**
 * Dérive une catégorie affichable pour une proposition `park_edits` à partir
 * de `changes.items[].field` — les 4 formes réelles connues (cf. audit
 * Admin-3, migration 0037) : "ages", "location", "feature:<code>",
 * "free_text". Toute autre valeur (field inconnu, `changes` malformé) tombe
 * dans "Autre", jamais une catégorie inventée.
 */
export type ParkEditTypeLabel = "Âges" | "Localisation" | "Équipements" | "Autre" | "Plusieurs modifications";

function isJsonObject(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function itemField(item: Json): string | null {
  if (!isJsonObject(item)) return null;
  const field = item.field;
  return typeof field === "string" ? field : null;
}

function categorize(field: string | null): "Âges" | "Localisation" | "Équipements" | "Autre" {
  if (field === "ages") return "Âges";
  if (field === "location") return "Localisation";
  if (field?.startsWith("feature:")) return "Équipements";
  return "Autre";
}

/** Une seule catégorie si tous les items s'y rattachent, sinon
 * "Plusieurs modifications" — jamais une liste de catégories concaténées. */
export function parkEditTypeLabel(changes: Json): ParkEditTypeLabel {
  if (!isJsonObject(changes) || !Array.isArray(changes.items) || changes.items.length === 0) return "Autre";
  const categories = new Set(changes.items.map((item) => categorize(itemField(item))));
  if (categories.size > 1) return "Plusieurs modifications";
  const [only] = categories;
  return only ?? "Autre";
}

export interface ParkEditItem {
  field: string;
  label: string;
  current: Json | undefined;
  proposed: Json | undefined;
}

/** Extraction défensive de `changes.items[]` pour l'affichage — jamais un
 * throw sur une forme inattendue, une liste vide au pire. */
export function parkEditItems(changes: Json): ParkEditItem[] {
  if (!isJsonObject(changes) || !Array.isArray(changes.items)) return [];
  const out: ParkEditItem[] = [];
  for (const raw of changes.items) {
    if (!isJsonObject(raw)) continue;
    const field = typeof raw.field === "string" ? raw.field : null;
    if (!field) continue;
    const label = typeof raw.label === "string" ? raw.label : field;
    out.push({ field, label, current: raw.current, proposed: raw.proposed });
  }
  return out;
}

/** Valeur lisible d'un item pour un affichage READ-ONLY minimal (Admin-3B-1) —
 * pas la comparaison A/B/C live avec le parc réel, qui relève d'Admin-3B-2.
 * `current`/`proposed` sont des formes hétérogènes (scalaire, objet
 * {min,max}, {lat,lng}/{latitude,longitude}) — ce formateur reste générique
 * et honnête plutôt que de deviner une présentation par champ. */
export function formatItemValue(value: Json | undefined): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => formatItemValue(v)).join(", ") || "—";
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (!entries.length) return "—";
  return entries.map(([k, v]) => `${k} : ${formatItemValue(v)}`).join(" · ");
}
