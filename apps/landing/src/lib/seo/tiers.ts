/**
 * Paliers de qualité d'un parc pour le SEO.
 *
 *   0  non affichable           → absent partout
 *   1  affichable, peu documenté → ligne dans la liste de la ville, PAS de page
 *   2  documenté                 → carte détaillée dans la ville, PAS de fiche indexable
 *   3  documenté + nom spécifique + adresse + ≥ 3 infos + signal de qualité réel
 *                                → fiche indexable (Phase 2B)
 *
 * Signal de qualité (au moins un) :
 *   - collectivité vérifiée (organization_parks.verified ET organizations.verified) ;
 *   - photo dont les droits sont VALIDÉS ;
 *   - vérification réelle : last_verified_at renseigné.
 *
 * Aujourd'hui aucun parc n'a de signal (aucune collectivité vérifiée, aucun
 * last_verified_at, aucune photo à droits validés) : le palier 3 est vide, ce
 * qui est voulu — la qualité des données, pas le code, ouvre les fiches.
 */
import { isAddressed, isDocumented, isListable } from "./eligibility";
import { describePark, type SeoPark, type SeoPhoto } from "./parks";
import { isGenericName } from "./slugs";

export type ParkTier = 0 | 1 | 2 | 3;

export interface TierResult {
  tier: ParkTier;
  /** Signaux de qualité réellement présents. */
  signals: ("collectivity" | "photo" | "verified")[];
  /** Pourquoi le palier 3 n'est pas atteint (vide si palier 3). */
  missing: string[];
}

/** Une photo n'est utilisable que si ses droits sont explicitement validés. */
export function isPhotoUsable(photo: Pick<SeoPhoto, "rightsStatus">): boolean {
  return photo.rightsStatus === "validated";
}

export function usablePhotos(park: Pick<SeoPark, "photos">): SeoPhoto[] {
  return park.photos.filter(isPhotoUsable);
}

export function qualitySignals(park: SeoPark): TierResult["signals"] {
  const signals: TierResult["signals"] = [];
  if (park.collectivityVerified) signals.push("collectivity");
  if (usablePhotos(park).length > 0) signals.push("photo");
  if (park.lastVerifiedAt) signals.push("verified");
  return signals;
}

export function parkTier(park: SeoPark): TierResult {
  const signals = qualitySignals(park);
  if (!isListable(park)) return { tier: 0, signals, missing: ["coordonnées ou code postal"] };
  if (!isDocumented(park)) return { tier: 1, signals, missing: ["documentation (âge complet ou ≥ 3 infos)"] };

  const missing: string[] = [];
  if (isGenericName(park.name)) missing.push("nom spécifique");
  if (!isAddressed(park)) missing.push("adresse");
  if (describePark(park).declaredCount < 3) missing.push("≥ 3 infos déclarées");
  if (signals.length === 0) missing.push("signal de qualité (collectivité vérifiée, photo à droits validés ou vérification réelle)");
  return missing.length === 0 ? { tier: 3, signals, missing } : { tier: 2, signals, missing };
}

/** Seul le palier 3 peut avoir une fiche indexable. */
export function isIndexablePark(park: SeoPark): boolean {
  return parkTier(park).tier === 3;
}
