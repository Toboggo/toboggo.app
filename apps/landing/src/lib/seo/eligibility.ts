/**
 * Éligibilité d'une ville à une page SEO locale — V2.
 *
 * SOURCE UNIQUE : la génération des pages, le hub, le sitemap et les liens
 * internes s'appuient tous sur `evaluateEligibility`. Aucun critère ne doit
 * être recopié ailleurs.
 *
 * Une ville est éligible si et seulement si :
 *   1. au moins 5 parcs affichables (coordonnées valides + code postal) ;
 *   2. au moins 3 parcs documentés ;
 *   3. au moins 20 % des parcs affichables sont documentés.
 */
import { describePark, type SeoPark } from "./parks";

export const THRESHOLDS = {
  minListedParks: 5,
  minDocumentedParks: 3,
  /** Part des parcs affichables qui doivent être documentés. */
  minDocumentedRatio: 0.2,
  /** « Documenté » : tranche d'âge complète OU au moins N infos utiles déclarées. */
  documentedMinDeclared: 3,
} as const;

export function hasValidCoordinates(park: Pick<SeoPark, "latitude" | "longitude">): boolean {
  const { latitude: lat, longitude: lng } = park;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Parc affichable : coordonnées valides + code postal. */
export function isListable(park: SeoPark): boolean {
  return hasValidCoordinates(park) && Boolean(park.postalCode?.trim());
}

/** Parc avec adresse ET coordonnées. */
export function isAddressed(park: SeoPark): boolean {
  return hasValidCoordinates(park) && Boolean(park.addressLine?.trim());
}

/**
 * Suffisamment documenté pour une carte détaillée : tranche d'âge complète
 * (min ET max) OU ≥ 3 informations utiles déclarées (équipements, services,
 * accessibilité, clôture/ombre — revêtement exclu).
 */
export function isDocumented(park: SeoPark): boolean {
  const hasAgeRange = park.minAge != null && park.maxAge != null;
  return hasAgeRange || describePark(park).declaredCount >= THRESHOLDS.documentedMinDeclared;
}

export interface EligibilityCheck {
  id: "listed" | "documented" | "documentedRatio";
  passed: boolean;
  value: number;
  threshold: number;
}

export interface Eligibility {
  eligible: boolean;
  checks: EligibilityCheck[];
  listed: number;
  documented: number;
}

/** `parks` = parcs publiés ET actifs de la ville (le filtre est fait au chargement). */
export function evaluateEligibility(parks: SeoPark[]): Eligibility {
  const listed = parks.filter(isListable);
  const documented = listed.filter(isDocumented);
  const ratio = listed.length === 0 ? 0 : documented.length / listed.length;
  const checks: EligibilityCheck[] = [
    { id: "listed", passed: listed.length >= THRESHOLDS.minListedParks, value: listed.length, threshold: THRESHOLDS.minListedParks },
    { id: "documented", passed: documented.length >= THRESHOLDS.minDocumentedParks, value: documented.length, threshold: THRESHOLDS.minDocumentedParks },
    { id: "documentedRatio", passed: ratio >= THRESHOLDS.minDocumentedRatio, value: Number(ratio.toFixed(3)), threshold: THRESHOLDS.minDocumentedRatio },
  ];
  return { eligible: checks.every((c) => c.passed), checks, listed: listed.length, documented: documented.length };
}
