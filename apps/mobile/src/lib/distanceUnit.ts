/**
 * Unités de distance — préférence « Automatique / Kilomètres / Miles ».
 *
 * « Automatique » suit la RÉGION de l'utilisateur (sous-étiquette région de la
 * langue du navigateur / de l'appareil, ex. en-US → US), jamais la langue
 * choisie dans l'app et sans inférer de région depuis la seule langue
 * (« en » seul ne vaut pas US). Région inconnue → kilomètres. Le choix manuel
 * est persisté localement ; seul l'AFFICHAGE change, toutes les données et
 * calculs internes restent en mètres / kilomètres.
 */

import { create } from "zustand";
import type { DistanceUnit } from "@toboggo/shared";

export type DistanceUnitPreference = "auto" | DistanceUnit;

export const DISTANCE_UNIT_STORAGE_KEY = "toboggo:distance-unit";

// Régions où la distance routière courante est en miles (US, UK, Libéria,
// Myanmar + territoires américains). Le Canada, l'Irlande, etc. : kilomètres.
const MILES_REGIONS = new Set(["US", "GB", "LR", "MM", "PR", "GU", "VI", "AS", "MP"]);

function regionOf(tag: string): string | null {
  try {
    // Pas de `maximize()` : on ne déduit pas une région depuis la langue seule.
    return new Intl.Locale(tag).region ?? null;
  } catch {
    return null;
  }
}

/** Unité déduite de la région de l'appareil ; kilomètres si inconnue. */
export function detectDistanceUnit(languages?: readonly string[]): DistanceUnit {
  const list =
    languages ?? (typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);
  for (const tag of list) {
    const region = tag ? regionOf(tag) : null;
    if (region) return MILES_REGIONS.has(region) ? "mi" : "km";
  }
  return "km";
}

export function resolveDistanceUnit(preference: DistanceUnitPreference, languages?: readonly string[]): DistanceUnit {
  return preference === "auto" ? detectDistanceUnit(languages) : preference;
}

function readStored(): DistanceUnitPreference {
  try {
    const v = localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY);
    return v === "km" || v === "mi" ? v : "auto";
  } catch {
    return "auto";
  }
}

interface DistanceUnitState {
  preference: DistanceUnitPreference;
  setPreference: (next: DistanceUnitPreference) => void;
}

export const useDistanceUnitStore = create<DistanceUnitState>((set) => ({
  preference: readStored(),
  setPreference: (next) => {
    try {
      if (next === "auto") localStorage.removeItem(DISTANCE_UNIT_STORAGE_KEY);
      else localStorage.setItem(DISTANCE_UNIT_STORAGE_KEY, next);
    } catch {
      /* mode privé : s'applique quand même pour la session */
    }
    set({ preference: next });
  },
}));

/** Préférence + unité effective (résolue). */
export function useDistanceUnit(): {
  preference: DistanceUnitPreference;
  unit: DistanceUnit;
  setPreference: (next: DistanceUnitPreference) => void;
} {
  const preference = useDistanceUnitStore((s) => s.preference);
  const setPreference = useDistanceUnitStore((s) => s.setPreference);
  return { preference, unit: resolveDistanceUnit(preference), setPreference };
}
