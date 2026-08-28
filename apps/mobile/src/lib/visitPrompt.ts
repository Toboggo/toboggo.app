import { create } from "zustand";

interface VisitPromptState {
  parkId: string | null;
  parkName: string;
  visible: boolean;
  schedule: (parkId: string, parkName: string, delayMs?: number) => void;
  dismiss: () => void;
}

export const useVisitPrompt = create<VisitPromptState>((set) => ({
  parkId: null,
  parkName: "",
  visible: false,
  schedule: (parkId, parkName, delayMs = 8000) => {
    setTimeout(() => set({ parkId, parkName, visible: true }), delayMs);
  },
  dismiss: () => set({ visible: false }),
}));
