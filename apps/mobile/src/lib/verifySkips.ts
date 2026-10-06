import { create } from "zustand";

/** Verifications the user passed on (« Je ne sais pas »), kept for the session
 * only and shared by the hub card and the full list. Nothing is ever written. */
export const useVerifySkips = create<{ skipped: ReadonlySet<string>; skip: (key: string) => void }>((set) => ({
  skipped: new Set<string>(),
  skip: (key) => set((s) => ({ skipped: new Set(s.skipped).add(key) })),
}));
