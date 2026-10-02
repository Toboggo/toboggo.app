/**
 * Vue d'ensemble du SEO local, calculée UNE fois à partir du snapshot :
 * lieux, éligibilité (source unique : eligibility.ts), pages publiées.
 *
 * Page de ville générée  ⇔  ville validée (approved.ts)  ET  éligible.
 * Hub / sitemap / liens internes ne voient QUE les pages réellement générées.
 */
import { APPROVED_PLACE_SLUGS } from "./approved";
import { evaluateEligibility, isDocumented, isListable, type Eligibility } from "./eligibility";
import { groupPlaces, placePath, type Place } from "./places";
import { SeoLoadError, type SeoSnapshot } from "./loader";
import { loadSnapshot } from "./snapshot";
import type { SeoPark } from "./parks";

export interface PlaceData {
  place: Place;
  /** Parcs affichables (coordonnées + code postal). */
  listed: SeoPark[];
  /** Parcs documentés : cartes détaillées. */
  documented: SeoPark[];
  /** Parcs affichables mais peu documentés : liste compacte. */
  others: SeoPark[];
  eligibility: Eligibility;
}

export interface SeoSite {
  fetchedAt: string;
  places: PlaceData[];
  /** Villes validées ET éligibles : seules pages de ville générées. */
  published: PlaceData[];
  /** Éligibles mais non validées éditorialement : ni page ni lien. */
  candidates: PlaceData[];
  /** Validées mais absentes ou plus éligibles : page NON générée (voir `strict`). */
  issues: string[];
  /** Le hub n'est indexable (et dans le sitemap) que s'il liste au moins une ville. */
  hubIndexable: boolean;
}

export function analyzePlace(place: Place): PlaceData {
  const listed = place.parks.filter(isListable);
  const documented = listed.filter(isDocumented);
  const others = listed.filter((p) => !isDocumented(p));
  return { place, listed, documented, others, eligibility: evaluateEligibility(place.parks) };
}

export interface BuildOptions {
  approved?: readonly string[];
  /** En production, une ville validée qui n'est plus éligible fait échouer le build (évite un 404 silencieux sur une page indexée). */
  strict?: boolean;
}

export function buildSeoSite(snapshot: Pick<SeoSnapshot, "parks" | "fetchedAt">, options: BuildOptions = {}): SeoSite {
  const approved = options.approved ?? APPROVED_PLACE_SLUGS;
  const places = groupPlaces(snapshot.parks).map(analyzePlace);
  const bySlug = new Map(places.map((p) => [p.place.slug, p]));

  const published: PlaceData[] = [];
  const issues: string[] = [];
  for (const slug of approved) {
    const data = bySlug.get(slug);
    if (!data) issues.push(`ville validée « ${slug} » introuvable dans les données`);
    else if (!data.eligibility.eligible) {
      const failed = data.eligibility.checks.filter((c) => !c.passed).map((c) => `${c.id} ${c.value} < ${c.threshold}`);
      issues.push(`ville validée « ${slug} » non éligible (${failed.join(", ")}) : page non générée`);
    } else published.push(data);
  }

  if (issues.length > 0 && options.strict) throw new SeoLoadError(issues.join(" ; "));

  const candidates = places.filter((p) => p.eligibility.eligible && !approved.includes(p.place.slug));
  return { fetchedAt: snapshot.fetchedAt, places, published, candidates, issues, hubIndexable: published.length > 0 };
}

/**
 * Mode strict : production Vercel ou `SEO_STRICT=1`. Aucune page SEO ne doit alors
 * disparaître en silence (variables manquantes, lecture incomplète, ville plus éligible).
 */
export function isStrictBuild(processEnv: Record<string, string | undefined> = process.env): boolean {
  return processEnv.SEO_STRICT === "1" || processEnv.VERCEL_ENV === "production";
}

export function missingSnapshotError(approved: readonly string[]): SeoLoadError {
  return new SeoLoadError(
    "PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY sont manquantes ou invalides (une URL http(s) et une clé non vides sont requises), " +
      "ou le snapshot Supabase n'a pas pu être chargé, alors que des villes sont validées éditoriellement " +
      `(${approved.join(", ")}). Le build échoue pour ne pas dépublier silencieusement leurs pages SEO. ` +
      "Définir ces variables pour l'environnement concerné (Production et Preview), " +
      "ou construire hors production sans SEO_STRICT pour le mode dégradé (aucune page de ville).",
  );
}

// Même raison que snapshot.ts : la config Astro et les pages ont des graphes de
// modules distincts ; le cache vit sur globalThis pour calculer (et journaliser) une seule fois.
const SITE_KEY = Symbol.for("toboggo.seo.site");

function siteCache(): WeakMap<object, SeoSite> {
  const g = globalThis as unknown as Record<symbol, WeakMap<object, SeoSite> | undefined>;
  return (g[SITE_KEY] ??= new WeakMap());
}

/** `null` sans configuration Supabase : aucune page de ville, hub non indexable. */
export async function loadSeoSite(
  env: Record<string, string | undefined>,
  options: { strict?: boolean; approved?: readonly string[] } = {},
): Promise<SeoSite | null> {
  const strict = options.strict ?? isStrictBuild();
  const approved = options.approved ?? APPROVED_PLACE_SLUGS;
  const snapshot = await loadSnapshot(env);
  if (!snapshot) {
    // Sans configuration : mode dégradé en dev/preview, ÉCHEC en strict si des villes sont validées.
    if (strict && approved.length > 0) throw missingSnapshotError(approved);
    return null;
  }
  const cache = siteCache();
  let site = cache.get(snapshot);
  if (!site) {
    site = buildSeoSite(snapshot, { strict, approved });
    cache.set(snapshot, site);
    console.info(
      `[seo] ${site.places.length} villes, ${site.published.length} pages publiées (${site.published.map((p) => p.place.slug).join(", ") || "aucune"}), ` +
        `${site.candidates.length} candidates non validées${site.candidates.length ? ` (${site.candidates.map((c) => c.place.slug).join(", ")})` : ""}`,
    );
    for (const issue of site.issues) console.warn(`[seo] ATTENTION : ${issue}`);
  }
  return site;
}

/** Chemins à retirer du sitemap : le hub s'il n'a rien à lister. Les villes non générées n'y figurent pas d'office. */
export function sitemapExclusions(site: SeoSite | null, hubPath: string): string[] {
  return site?.hubIndexable ? [] : [hubPath];
}

export function publishedPaths(site: SeoSite | null): string[] {
  return (site?.published ?? []).map((p) => placePath(p.place));
}
