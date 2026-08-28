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
  openNow: boolean;
  sort: SortMode;
  setAge: (low: number, high: number) => void;
  toggleAmenity: (key: keyof AmenityFilters) => void;
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
  openNow: false,
  sort: "distance",
  setAge: (ageLow, ageHigh) => set({ ageLow, ageHigh }),
  toggleAmenity: (key) => set((s) => ({ amenities: { ...s.amenities, [key]: !s.amenities[key] } })),
  setOpenNow: (openNow) => set({ openNow }),
  setSort: (sort) => set({ sort }),
  reset: () => set({ ageLow: 0, ageHigh: 12, amenities: DEFAULT_AMENITIES, openNow: false }),
  activeCount: () => {
    const s = get();
    let n = Object.values(s.amenities).filter(Boolean).length;
    if (s.openNow) n += 1;
    if (s.ageLow !== 0 || s.ageHigh !== 12) n += 1;
    return n;
  },
}));
