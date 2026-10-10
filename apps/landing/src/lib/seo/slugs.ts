/**
 * Génération des slugs de parc — PRÉPARATION UNIQUEMENT : aucun slug n'est
 * écrit en base (parks.slug est vide pour tous les parcs). Ces fonctions pures
 * servent à (1) tester les règles de collision avant la migration et
 * (2) alimenter le futur script de remplissage (essai à blanc d'abord).
 *
 * Règles :
 *  - un slug est unique PAR VILLE (futur index unique (place_id, slug)) ;
 *  - nom spécifique   → `nom` ; collision → `nom-<adresse>` ; collision → + suffixe d'identifiant ;
 *  - nom générique    → `aire-de-jeux-<adresse>` ; sans adresse → `aire-de-jeux-<suffixe d'identifiant>` ;
 *  - le suffixe d'identifiant est dérivé de l'uuid (stable) et s'allonge en cas de collision ;
 *  - un slug déjà publié est IMMUABLE : on ne le recalcule jamais (renommage = historique + 301) ;
 *  - résultat indépendant de l'ordre d'entrée (tri par id).
 */
import { formatAddress, type SeoPark } from "./parks";

const MAX_SLUG_LENGTH = 80;

export function slugify(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= MAX_SLUG_LENGTH) return slug;
  // coupe sur une frontière de mot
  const cut = slug.slice(0, MAX_SLUG_LENGTH);
  return cut.slice(0, Math.max(cut.lastIndexOf("-"), 1)).replace(/-+$/, "");
}

/** Noms trop génériques pour faire une URL ou une fiche à eux seuls. */
const GENERIC_NAMES = new Set(["aire de jeux", "aire de jeu", "jeux pour enfants", "terrain de jeux", "jeux", "aire de jeux pour enfants"]);

export function isGenericName(name: string): boolean {
  return GENERIC_NAMES.has(name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim());
}

const GENERIC_SLUG = "aire-de-jeux";

function shortId(id: string, length: number): string {
  const compact = id.replace(/-/g, "").toLowerCase();
  return compact.slice(0, Math.min(Math.max(length, 1), compact.length));
}

/** Candidats par ordre de préférence, SANS le suffixe d'identifiant (ajouté par assignSlugs). */
export function slugCandidates(park: Pick<SeoPark, "name" | "addressLine" | "postalCode" | "city">): string[] {
  const addressSlug = slugify(formatAddress(park) ?? "");
  if (isGenericName(park.name)) return addressSlug ? [`${GENERIC_SLUG}-${addressSlug}`] : [];
  const base = slugify(park.name) || GENERIC_SLUG;
  return addressSlug ? [base, `${base}-${addressSlug}`] : [base];
}

export interface AssignOptions {
  /** Slugs déjà publiés (park id → slug) : conservés tels quels. */
  existing?: ReadonlyMap<string, string>;
}

/**
 * Attribue un slug unique à chaque parc d'UNE ville. Déterministe.
 * Lève une erreur si deux slugs existants se contredisent (donnée corrompue).
 */
export function assignSlugs(parks: Pick<SeoPark, "id" | "name" | "addressLine" | "postalCode" | "city">[], options: AssignOptions = {}): Map<string, string> {
  const result = new Map<string, string>();
  const taken = new Map<string, string>(); // slug → park id

  for (const park of parks) {
    const existing = options.existing?.get(park.id);
    if (!existing) continue;
    const owner = taken.get(existing);
    if (owner && owner !== park.id) throw new Error(`slug existant en double dans la même ville : « ${existing} » (${owner}, ${park.id})`);
    taken.set(existing, park.id);
    result.set(park.id, existing);
  }

  for (const park of [...parks].sort((a, b) => a.id.localeCompare(b.id))) {
    if (result.has(park.id)) continue;
    let chosen: string | null = null;
    for (const candidate of slugCandidates(park)) {
      if (!taken.has(candidate)) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen) {
      const bases = slugCandidates(park);
      const base = bases.length > 0 ? bases[bases.length - 1] : GENERIC_SLUG;
      const compactLength = park.id.replace(/-/g, "").length;
      for (let length = 6; length <= compactLength && !chosen; length += 2) {
        const candidate = `${base}-${shortId(park.id, length)}`;
        if (!taken.has(candidate)) chosen = candidate;
      }
    }
    if (!chosen) throw new Error(`impossible de générer un slug unique pour ${park.id}`);
    taken.set(chosen, park.id);
    result.set(park.id, chosen);
  }
  return result;
}

export interface SlugChange {
  parkId: string;
  oldSlug: string;
  newSlug: string;
}

/** Historique à enregistrer (→ 301 au build) quand un slug publié change. */
export function planSlugHistory(previous: ReadonlyMap<string, string>, next: ReadonlyMap<string, string>): SlugChange[] {
  const changes: SlugChange[] = [];
  for (const [parkId, oldSlug] of previous) {
    const newSlug = next.get(parkId);
    if (newSlug && newSlug !== oldSlug) changes.push({ parkId, oldSlug, newSlug });
  }
  return changes.sort((a, b) => a.parkId.localeCompare(b.parkId));
}
