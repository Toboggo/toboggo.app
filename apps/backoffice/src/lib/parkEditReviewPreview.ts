import type { Json, Park, ParkEditItemResult } from "@toboggo/shared";
import type { ParkEditItem } from "./parkEditType";

/**
 * Aperçu CÔTÉ CLIENT, LECTURE SEULE, de la classification A/B/C qu'appliquera
 * `review_park_edit()` (migration 0037) si l'admin clique Approuver — pour
 * afficher les conflits AVANT la décision (Admin-3B-2). Ce n'est PAS la
 * source de vérité : la RPC reclassera en direct, dans sa propre transaction
 * verrouillée, au moment réel de la décision — un état intermédiaire entre
 * le rendu de cet écran et le clic peut faire diverger cet aperçu du
 * résultat réel (courte fenêtre, RPC verrouillée par `FOR UPDATE`).
 *
 * Règles copiées EXACTEMENT de 0037 (mêmes clés, même normalisation
 * location, même tolérance flottante, même ordre de test — ALREADY_APPLIED
 * avant APPLICABLE pour couvrir A == B == C sans ambiguïté) :
 *   B == C             → ALREADY_APPLIED
 *   B == A (donc B≠C)  → APPLICABLE
 *   sinon (B≠A et B≠C) → CONFLICT
 *   free_text / field inconnu → NOT_AUTOMATICALLY_APPLICABLE (pas de B)
 */
export interface ParkEditItemPreview {
  result: ParkEditItemResult;
  /** Valeur B (réelle, relue en direct sur `park`) — `undefined` quand le
   * champ n'a pas d'équivalent sur `parks` (free_text / field inconnu). */
  live: Json | undefined;
}

function num(value: Json | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function str(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/** `IS NOT DISTINCT FROM` : `null`/`undefined` égaux entre eux, sinon `===`. */
function sameNullable<T>(a: T | null, b: T | null): boolean {
  if (a === null && b === null) return true;
  return a === b;
}

function jsonObj(value: Json | undefined): { [key: string]: Json | undefined } | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as { [key: string]: Json | undefined })
    : null;
}

export function previewParkEditItem(item: ParkEditItem, park: Park): ParkEditItemPreview {
  if (item.field === "ages") {
    const a = jsonObj(item.current);
    const c = jsonObj(item.proposed);
    const aMin = num(a?.min);
    const aMax = num(a?.max);
    const cMin = num(c?.min);
    const cMax = num(c?.max);
    const bMin = park.min_age;
    const bMax = park.max_age;

    const bEqC = sameNullable(bMin, cMin) && sameNullable(bMax, cMax);
    const bEqA = sameNullable(bMin, aMin) && sameNullable(bMax, aMax);
    const live: Json = { min: bMin, max: bMax };
    if (bEqC) return { result: "ALREADY_APPLIED", live };
    if (bEqA) return { result: "APPLICABLE", live };
    return { result: "CONFLICT", live };
  }

  if (item.field === "location") {
    // Incohérence réelle des données (voir 0037) : current = {latitude,
    // longitude}, proposed = {lat,lng} — normalisée ici comme dans la RPC.
    const a = jsonObj(item.current);
    const c = jsonObj(item.proposed);
    const aLat = num(a?.latitude);
    const aLng = num(a?.longitude);
    const cLat = num(c?.lat);
    const cLng = num(c?.lng);
    const bLat = park.latitude;
    const bLng = park.longitude;

    const close = (x: number | null, y: number | null) => x !== null && y !== null && Math.abs(x - y) <= 0.000001;
    const bEqC = close(bLat, cLat) && close(bLng, cLng);
    const bEqA = close(bLat, aLat) && close(bLng, aLng);
    const live: Json = { lat: bLat, lng: bLng };
    if (bEqC) return { result: "ALREADY_APPLIED", live };
    if (bEqA) return { result: "APPLICABLE", live };
    return { result: "CONFLICT", live };
  }

  if (item.field.startsWith("feature:")) {
    const code = item.field.slice("feature:".length);
    const aStatus = str(item.current);
    const cStatus = str(item.proposed);
    const bStatus = park.features[code]?.status ?? "unknown";

    const bEqC = sameNullable(bStatus, cStatus);
    const bEqA = sameNullable(bStatus, aStatus);
    if (bEqC) return { result: "ALREADY_APPLIED", live: bStatus };
    if (bEqA) return { result: "APPLICABLE", live: bStatus };
    return { result: "CONFLICT", live: bStatus };
  }

  // "free_text" ou tout field inconnu : jamais appliqué automatiquement,
  // aucune colonne cible à relire (même comportement que la RPC).
  return { result: "NOT_AUTOMATICALLY_APPLICABLE", live: undefined };
}
