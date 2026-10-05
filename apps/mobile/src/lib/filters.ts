import { create } from "zustand";

export interface AmenityFilters {
  wc: boolean;
  shade: boolean;
  fenced: boolean;
  pmr: boolean;
  benches: boolean;
  water: boolean;
  parking: boolean;
}

export type SortMode = "distance" | "rating" | "recent";

interface FilterState {
  ageLow: number;
  ageHigh: number;
  amenities: AmenityFilters;
  /** Codes de jeux requis (ET). Vide = aucune restriction. */
  games: string[];
  openNow: boolean;
  sort: SortMode;
  setAge: (low: number, high: number) => void;
  toggleAmenity: (key: keyof AmenityFilters) => void;
  toggleGame: (code: string) => void;
  setGames: (codes: string[]) => void;
  setOpenNow: (v: boolean) => void;
  setSort: (s: SortMode) => void;
  reset: () => void;
  activeCount: () => number;
}

const DEFAULT_AMENITIES: AmenityFilters = {
  wc: false,
  shade: false,
  fenced: false,
  pmr: false,
  benches: false,
  water: false,
  parking: false,
};

export const useFilters = create<FilterState>((set, get) => ({
  ageLow: 0,
  ageHigh: 12,
  amenities: DEFAULT_AMENITIES,
  games: [],
  openNow: false,
  sort: "distance",
  setAge: (ageLow, ageHigh) => set({ ageLow, ageHigh }),
  toggleAmenity: (key) => set((s) => ({ amenities: { ...s.amenities, [key]: !s.amenities[key] } })),
  toggleGame: (code) =>
    set((s) => ({ games: s.games.includes(code) ? s.games.filter((c) => c !== code) : [...s.games, code] })),
  setGames: (games) => set({ games: [...new Set(games)] }),
  setOpenNow: (openNow) => set({ openNow }),
  setSort: (sort) => set({ sort }),
  reset: () => set({ ageLow: 0, ageHigh: 12, amenities: DEFAULT_AMENITIES, games: [], openNow: false }),
  activeCount: () => {
    const s = get();
    let n = Object.values(s.amenities).filter(Boolean).length;
    n += s.games.length;
    if (s.openNow) n += 1;
    if (s.ageLow !== 0 || s.ageHigh !== 12) n += 1;
    return n;
  },
}));

/** Minuscules sans accents ni espaces superflus — pour la recherche de jeux. */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Filtre une liste `{ label }` par sous-chaîne (insensible à la casse et aux accents). Requête vide = tout. */
export function searchByLabel<T extends { label: string }>(items: readonly T[], query: string): T[] {
  const q = normalizeSearch(query);
  if (!q) return [...items];
  return items.filter((i) => normalizeSearch(i.label).includes(q));
}
