/**
 * Fiches publiques de parc (Phase 2B).
 *
 * Une fiche est GÉNÉRÉE si et seulement si : parc validé éditorialement
 * (approvedParks.ts) ∧ ville publiée ∧ seuil de qualité d'une fiche (ci-dessous).
 * Elle est INDEXABLE (index + sitemap) seulement si elle atteint le palier 3
 * (signal de qualité réel) OU porte une validation éditoriale explicite ; sinon
 * elle existe mais en `noindex,follow` et hors sitemap. Aucune photo, aucune note,
 * aucun avis : rien n'est affiché sans donnée réelle.
 */
import { APPROVED_PARKS, validateApprovedParks, type ApprovedPark } from "./approvedParks";
import { hasValidCoordinates, isDocumented, isListable } from "./eligibility";
import { buildParkContent, parkDescription, parkTitle, type ParkContent } from "./parkContent";
import { placePath } from "./places";
import { SeoLoadError } from "./loader";
import { assignSlugs, isGenericName } from "./slugs";
import { parkTier, type TierResult } from "./tiers";
import type { SeoPark } from "./parks";
import type { PlaceData } from "./seoSite";

/** Seuil de qualité d'une fiche (valeurs proposées, à valider) : en dessous, la fiche serait pauvre. */
export const PARK_PAGE_THRESHOLDS = {
  /** Informations utiles déclarées (jeux, services, accessibilité, clôture/ombre ; revêtement exclu). */
  minDeclared: 5,
  /** Au moins N groupes non vides parmi jeux / services / accessibilité / environnement. */
  minGroups: 2,
} as const;

export interface ParkPageCheck {
  id: "listable" | "specificName" | "documented" | "declared" | "groups";
  passed: boolean;
  value: number;
  threshold: number;
}

export interface ParkPageEligibility {
  eligible: boolean;
  checks: ParkPageCheck[];
}

export function evaluateParkPage(park: SeoPark): ParkPageEligibility {
  const content = buildParkContent(park);
  const flag = (ok: boolean) => (ok ? 1 : 0);
  const checks: ParkPageCheck[] = [
    { id: "listable", passed: isListable(park) && hasValidCoordinates(park) && Boolean(park.city?.trim()), value: flag(isListable(park)), threshold: 1 },
    { id: "specificName", passed: !isGenericName(park.name), value: flag(!isGenericName(park.name)), threshold: 1 },
    { id: "documented", passed: isDocumented(park), value: flag(isDocumented(park)), threshold: 1 },
    { id: "declared", passed: content.declaredCount >= PARK_PAGE_THRESHOLDS.minDeclared, value: content.declaredCount, threshold: PARK_PAGE_THRESHOLDS.minDeclared },
    { id: "groups", passed: content.groupCount >= PARK_PAGE_THRESHOLDS.minGroups, value: content.groupCount, threshold: PARK_PAGE_THRESHOLDS.minGroups },
  ];
  return { eligible: checks.every((c) => c.passed), checks };
}

export type IndexVia = "tier3" | "editorial" | null;

/** Indexable : palier 3 (signal réel) ou validation éditoriale explicite d'une fiche déjà documentée (palier ≥ 2). */
export function indexability(tier: TierResult, entry: Pick<ApprovedPark, "editorialReview">): { indexable: boolean; via: IndexVia } {
  if (tier.tier === 3) return { indexable: true, via: "tier3" };
  if (entry.editorialReview && tier.tier >= 2) return { indexable: true, via: "editorial" };
  return { indexable: false, via: null };
}

export interface NearbyPage {
  name: string;
  path: string;
  distanceM: number;
}

export interface ParkPageData {
  placeSlug: string;
  placeName: string;
  slug: string;
  path: string;
  park: SeoPark;
  tier: TierResult;
  indexable: boolean;
  indexVia: IndexVia;
  content: ParkContent;
  title: string;
  description: string;
  nearby: NearbyPage[];
}

export interface ParkPageIssue {
  severity: "error" | "warning";
  message: string;
}

const NEARBY_MAX = 3;

function distanceM(a: Pick<SeoPark, "latitude" | "longitude">, b: Pick<SeoPark, "latitude" | "longitude">): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(rad((b.latitude as number) - (a.latitude as number)) / 2) ** 2 + Math.cos(rad(a.latitude as number)) * Math.cos(rad(b.latitude as number)) * Math.sin(rad((b.longitude as number) - (a.longitude as number)) / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(x)));
}

export interface BuildParkPagesOptions {
  /** Si vrai, une erreur lève un SeoLoadError (production). */
  strict?: boolean;
}

export function fichePath(placeSlug: string, slug: string): string {
  return `${placePath({ slug: placeSlug })}${slug}/`;
}

export function buildParkPages(published: readonly PlaceData[], approved: readonly ApprovedPark[] = APPROVED_PARKS, options: BuildParkPagesOptions = {}): { pages: ParkPageData[]; issues: ParkPageIssue[] } {
  const listProblems = validateApprovedParks(approved);
  // Une liste incohérente (slug ou parc en double…) est une erreur de développement : toujours bloquante.
  if (listProblems.length > 0) throw new SeoLoadError(`liste des fiches invalide : ${listProblems.join(" ; ")}`);
  const issues: ParkPageIssue[] = [];
  const pages: ParkPageData[] = [];

  for (const entry of approved) {
    // Une erreur sur une fiche DÉJÀ validée éditorialement (index prévu) ne doit jamais passer en silence.
    const severity: ParkPageIssue["severity"] = entry.editorialReview ? "error" : "warning";
    const place = published.find((p) => p.place.slug === entry.placeSlug);
    if (!place) {
      issues.push({ severity, message: `fiche « ${entry.slug} » : la ville « ${entry.placeSlug} » n'est pas publiée` });
      continue;
    }
    const park = place.place.parks.find((p) => p.id === entry.parkId);
    if (!park) {
      issues.push({ severity, message: `fiche « ${entry.slug} » : parc ${entry.parkId} introuvable dans « ${entry.placeSlug} »` });
      continue;
    }
    const eligibility = evaluateParkPage(park);
    if (!eligibility.eligible) {
      const failed = eligibility.checks.filter((c) => !c.passed).map((c) => `${c.id} ${c.value} < ${c.threshold}`);
      issues.push({ severity, message: `fiche « ${entry.slug} » non générée : seuil de qualité non atteint (${failed.join(", ")})` });
      continue;
    }
    const generated = assignSlugs(place.place.parks).get(park.id);
    if (generated !== entry.slug) {
      issues.push({ severity: "warning", message: `fiche « ${entry.slug} » : le slug figé diffère du slug que donnerait le nom actuel (« ${generated} ») — l'URL figée est conservée` });
    }

    const tier = parkTier(park);
    const { indexable, via } = indexability(tier, entry);
    const content = buildParkContent(park);
    pages.push({
      placeSlug: entry.placeSlug,
      placeName: place.place.name,
      slug: entry.slug,
      path: fichePath(entry.placeSlug, entry.slug),
      park,
      tier,
      indexable,
      indexVia: via,
      content,
      title: parkTitle(park, place.place.name),
      description: parkDescription(park, content, place.place.name),
      nearby: [],
    });
  }

  // « À proximité » : uniquement des fiches RÉELLEMENT générées, de la même ville, par distance réelle.
  for (const page of pages) {
    page.nearby = pages
      .filter((other) => other !== page && other.placeSlug === page.placeSlug && hasValidCoordinates(other.park))
      .map((other) => ({ name: other.park.name, path: other.path, distanceM: distanceM(page.park, other.park) }))
      .sort((a, b) => a.distanceM - b.distanceM || a.name.localeCompare(b.name, "fr"))
      .slice(0, NEARBY_MAX);
  }

  const errors = issues.filter((i) => i.severity === "error");
  if (options.strict && errors.length > 0) throw new SeoLoadError(errors.map((e) => e.message).join(" ; "));
  return { pages, issues };
}
