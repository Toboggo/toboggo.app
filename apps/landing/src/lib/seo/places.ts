/**
 * Lieux (villes) pour le SEO local, dérivés des parcs.
 *
 * NORMALISATION PROVISOIRE : `parks.city` est du texte libre, donc une même
 * commune peut exister sous plusieurs orthographes (« Onet-Le-Chateau » et
 * « Onet-le-Château »). On regroupe ici par une clé normalisée, sans toucher à
 * la base. Cette couche est conçue pour être remplacée par une vraie table de
 * communes : `Place.placeId` / `inseeCode` sont déjà prévus (null aujourd'hui)
 * et `groupPlaces` est le SEUL endroit à remplacer quand `parks.place_id`
 * existera (voir apps/landing/seo/migrations-draft/).
 */
import { slugify } from "./slugs";
import type { SeoPark } from "./parks";

export const HUB_PATH = "/aires-de-jeux/";

export interface Place {
  /** Segment d'URL : /aires-de-jeux/<slug>/ — unique. */
  slug: string;
  /** Nom affiché (meilleure orthographe parmi les variantes). */
  name: string;
  /** Clé de regroupement normalisée (sans accents, minuscules). */
  key: string;
  countryCode: "FR";
  /** Département en clair, si renseigné. */
  department: string | null;
  /** Les deux premiers chiffres du code postal (code de département FR). */
  departmentCode: string | null;
  /** Toutes les orthographes rencontrées (traçabilité de la fusion). */
  variants: string[];
  parks: SeoPark[];
  /** Futurs identifiants d'une vraie table de communes. */
  placeId: string | null;
  inseeCode: string | null;
}

/** « Onet-Le-Chateau » et « Onet-le-Château » → « onet-le-chateau ». */
export function normalizeCityKey(city: string): string {
  return slugify(city.replace(/[’']/g, " "));
}

function diacriticCount(s: string): number {
  return (s.normalize("NFD").match(/[̀-ͯ]/g) ?? []).length;
}

const PARTICLES = new Set(["le", "la", "les", "de", "du", "des", "sur", "sous", "en", "et", "au", "aux"]);

/** Particules en minuscules (« Onet-le-Château ») — évite « Onet-Le-Chateau ». */
function particlesLowercase(s: string): boolean {
  return s
    .split(/[\s-]+/)
    .slice(1)
    .every((token) => !PARTICLES.has(token.toLowerCase()) || token === token.toLowerCase());
}

/** Meilleure orthographe : accents d'abord, particules correctes ensuite, fréquence en dernier recours. */
export function pickDisplayName(counts: Map<string, number>): string {
  return [...counts.entries()]
    .map(([name, n]) => ({ name, score: diacriticCount(name) * 100 + (particlesLowercase(name) ? 10 : 0) + n / 100000 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "fr"))[0].name;
}

function departmentCode(park: SeoPark): string | null {
  const code = park.postalCode?.trim().slice(0, 2) ?? "";
  return /^\d{2}$/.test(code) ? code : null;
}

function mostFrequent(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))[0]?.[0] ?? null;
}

/**
 * Regroupe les parcs par commune. Des communes homonymes de départements
 * différents sont séparées (slug suffixé du code de département). Les parcs
 * sans ville sont ignorés (ils ne peuvent appartenir à aucune page).
 */
export function groupPlaces(parks: SeoPark[]): Place[] {
  const byKey = new Map<string, SeoPark[]>();
  for (const park of parks) {
    const city = park.city?.trim();
    if (!city) continue;
    const key = normalizeCityKey(city);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), park]);
  }

  const places: Place[] = [];
  for (const [key, group] of [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const codes = new Set(group.map(departmentCode).filter((c): c is string => c !== null));
    const split = codes.size > 1;
    const buckets = split
      ? [...codes].sort().map((code) => ({ code, parks: group.filter((p) => departmentCode(p) === code) }))
      : [{ code: [...codes][0] ?? null, parks: group }];
    for (const bucket of buckets) {
      const counts = new Map<string, number>();
      for (const p of bucket.parks) counts.set(p.city!.trim(), (counts.get(p.city!.trim()) ?? 0) + 1);
      places.push({
        slug: split && bucket.code ? `${key}-${bucket.code}` : key,
        name: pickDisplayName(counts),
        key,
        countryCode: "FR",
        department: mostFrequent(bucket.parks.map((p) => p.adminArea2)),
        departmentCode: bucket.code,
        variants: [...counts.keys()].sort(),
        parks: bucket.parks,
        placeId: null,
        inseeCode: null,
      });
    }
  }
  return places;
}

export function placePath(place: Pick<Place, "slug">): string {
  return `${HUB_PATH}${place.slug}/`;
}
