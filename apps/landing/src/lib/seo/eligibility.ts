/**
 * Éligibilité à l'indexation d'une page SEO locale. Pure, testée
 * (eligibility.test.ts) : la page, le sitemap et le hub s'appuient TOUS sur
 * cette fonction — aucun critère n'est dispersé ailleurs.
 *
 * Seuils initiaux (validés pour le pilote Millau) : à ne changer qu'en
 * connaissance de cause, car ils décident de index/noindex.
 */
import { describePark, type SeoPark } from "./parks";

export const THRESHOLDS = {
  /** Parcs publiés ET actifs avec coordonnées + code postal. */
  minListedParks: 5,
  /** Parcs « suffisamment documentés » parmi les parcs retenus. */
  minDocumentedParks: 3,
  /** Part des parcs avec adresse + coordonnées. */
  minAddressedRatio: 0.8,
  /** « Suffisamment documenté » : au moins N infos utiles déclarées… */
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
 * Suffisamment documenté pour une fiche détaillée : tranche d'âge complète
 * (min ET max) OU ≥ 3 informations utiles déclarées (équipements, services,
 * accessibilité, clôture/ombre — revêtement exclu).
 */
export function isDocumented(park: SeoPark): boolean {
  const hasAgeRange = park.minAge != null && park.maxAge != null;
  return hasAgeRange || describePark(park).declaredCount >= THRESHOLDS.documentedMinDeclared;
}

export interface EligibilityCheck {
  id: "listed" | "documented" | "addressed";
  passed: boolean;
  value: number;
  threshold: number;
}

export interface Eligibility {
  eligible: boolean;
  checks: EligibilityCheck[];
}

/** `parks` = parcs publiés ET actifs de la ville (le filtre est fait à la requête). */
export function evaluateEligibility(parks: SeoPark[]): Eligibility {
  const listed = parks.filter(isListable);
  const documented = listed.filter(isDocumented);
  const addressedRatio = parks.length === 0 ? 0 : parks.filter(isAddressed).length / parks.length;
  const checks: EligibilityCheck[] = [
    { id: "listed", passed: listed.length >= THRESHOLDS.minListedParks, value: listed.length, threshold: THRESHOLDS.minListedParks },
    { id: "documented", passed: documented.length >= THRESHOLDS.minDocumentedParks, value: documented.length, threshold: THRESHOLDS.minDocumentedParks },
    { id: "addressed", passed: addressedRatio >= THRESHOLDS.minAddressedRatio, value: Number(addressedRatio.toFixed(2)), threshold: THRESHOLDS.minAddressedRatio },
  ];
  return { eligible: checks.every((c) => c.passed), checks };
}
