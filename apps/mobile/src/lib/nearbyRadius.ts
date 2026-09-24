import { create } from "zustand";

/** Radius choices offered by the "Zone de recherche" picker, in km. */
export const RADIUS_OPTIONS_KM = [1, 2, 5, 10, 20] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS_KM)[number];

export const DEFAULT_RADIUS_KM: RadiusKm = 2;

/**
 * Upper bound of the `nearby_parks` query (the RPC's own default, kept as is):
 * every radius choice is a client-side subset of this one fetch, so changing
 * the zone never refetches. Must stay ≥ the largest `RADIUS_OPTIONS_KM`.
 */
export const FETCH_RADIUS_KM = 20;

/**
 * How far "Des parcs un peu plus loin" may reach when the active zone is
 * empty. Suggestions only — the active radius itself is never changed
 * without an explicit user action.
 */
export const SUGGESTION_RADIUS_KM = 10;

interface NearbyRadiusState {
  radiusKm: RadiusKm;
  setRadiusKm: (r: RadiusKm) => void;
}

/**
 * The user's active "Autour de vous" zone. In-memory only, like `useFilters`:
 * kept for the whole session (screen changes included), reset on reload —
 * the app persists no other browsing preference across sessions either.
 */
export const useNearbyRadius = create<NearbyRadiusState>((set) => ({
  radiusKm: DEFAULT_RADIUS_KM,
  setRadiusKm: (radiusKm) => set({ radiusKm }),
}));
