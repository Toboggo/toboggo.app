import type { Park, ReverseGeocodedAddress } from "@toboggo/shared";

/**
 * Part « localité » de l'adresse du brouillon « Ajouter un parc », issue du
 * reverse geocoding. Elle porte la position (`lat`/`lng`) pour laquelle elle a
 * été résolue : elle n'est lue (affichage ET envoi) que si cette position est
 * toujours celle du pin — voir `localityFor`.
 */
export interface DraftLocality {
  postal_code: string | null;
  city: string | null;
  admin_area_1: string | null;
  admin_area_2: string | null;
  country_code: string | null;
  lat?: number;
  lng?: number;
}

export interface AddressSlice {
  address: string;
  /** `true` dès que l'utilisateur a saisi/corrigé le champ à la main. */
  addressEdited?: boolean;
  locality?: DraftLocality | null;
}

type Position = { lat: number; lng: number };

const SAME_POSITION_EPSILON = 1e-6;

/** La localité du brouillon, uniquement si elle a été résolue pour `pos`. Une
 * localité sans position (ancien brouillon) ou d'une autre position → `null` :
 * ancienne localité + nouvelles coordonnées est impossible. */
export function localityFor(d: AddressSlice, pos: Position): DraftLocality | null {
  const l = d.locality;
  if (!l || l.lat === undefined || l.lng === undefined) return null;
  const same = Math.abs(l.lat - pos.lat) < SAME_POSITION_EPSILON && Math.abs(l.lng - pos.lng) < SAME_POSITION_EPSILON;
  return same ? l : null;
}

/**
 * Applique une adresse résolue (pour `pos`) au brouillon.
 *
 * Règle UX (une correction manuelle n'est JAMAIS écrasée en silence) :
 *  - adresse saisie/corrigée à la main (non vide) → son texte est conservé ;
 *    seule la localité (code postal, ville, régions, pays), qui décrit le pin et
 *    non la saisie, est recalculée ;
 *  - adresse automatique (ou vide) → remplacée par la rue du résultat ; si le
 *    résultat n'a PAS de rue (ex. ville seule), l'ancienne rue automatique est
 *    supprimée : elle ne doit pas rester associée à la nouvelle localité.
 */
export function applyResolvedAddress(draft: AddressSlice, a: ReverseGeocodedAddress, pos: Position): AddressSlice {
  const keepManual = !!draft.addressEdited && draft.address.trim() !== "";
  return {
    address: keepManual ? draft.address : (a.address_line ?? ""),
    addressEdited: keepManual,
    locality: {
      postal_code: a.postal_code,
      city: a.city,
      admin_area_1: a.admin_area_1,
      admin_area_2: a.admin_area_2,
      country_code: a.country_code,
      lat: pos.lat,
      lng: pos.lng,
    },
  };
}

/** « 12100 Millau » (ou ce qui existe), `""` si rien. */
export function formatLocality(l: DraftLocality | null | undefined): string {
  return [l?.postal_code, l?.city].filter(Boolean).join(" ");
}

/** Champs adresse structurés à écrire dans `createPark` (aucune valeur vide
 * fabriquée ; localité seulement si elle correspond au pin envoyé). */
export function addressToParkInput(d: AddressSlice, pos: Position): Partial<Park> {
  const out: Partial<Park> = {};
  const line = d.address.trim();
  if (line) out.address_line = line;
  const l = localityFor(d, pos);
  if (l) {
    if (l.postal_code) out.postal_code = l.postal_code;
    if (l.city) out.city = l.city;
    if (l.admin_area_1) out.admin_area_1 = l.admin_area_1;
    if (l.admin_area_2) out.admin_area_2 = l.admin_area_2;
    if (l.country_code) out.country_code = l.country_code;
  }
  return out;
}
