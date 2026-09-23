import { create } from "zustand";

/**
 * Post-directions review prompt ("Vous êtes allé à ce parc ?"). Scheduled by
 * `useDirections` once the user actually hands off to a maps app; shown by
 * `<VisitRatingPrompt>` (GlobalOverlays) when they come back.
 *
 * Anti-nagging: a prompt that has been shown for a park is not shown again for
 * that park for `PARK_COOLDOWN_MS`, and never more than once per
 * `GLOBAL_COOLDOWN_MS` across parks. Persisted in localStorage (best-effort —
 * a blocked storage just means no cooldown, never a crash).
 */
export const VISIT_PROMPT_STORAGE_KEY = "toboggo:visit-prompt";
export const PARK_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 jours
export const GLOBAL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 h
const DEFAULT_DELAY_MS = 8000;

interface ShownLog {
  /** Last time the prompt was shown, any park. */
  last: number;
  /** parkId → last time the prompt was shown for that park. */
  parks: Record<string, number>;
}

function readLog(): ShownLog {
  try {
    const raw = localStorage.getItem(VISIT_PROMPT_STORAGE_KEY);
    if (!raw) return { last: 0, parks: {} };
    const parsed = JSON.parse(raw) as Partial<ShownLog>;
    return {
      last: typeof parsed.last === "number" ? parsed.last : 0,
      parks: parsed.parks && typeof parsed.parks === "object" ? parsed.parks : {},
    };
  } catch {
    return { last: 0, parks: {} };
  }
}

function recordShown(parkId: string, now: number) {
  const log = readLog();
  // Drop expired entries so the log never grows unbounded.
  const parks: Record<string, number> = {};
  for (const [id, at] of Object.entries(log.parks)) {
    if (now - at < PARK_COOLDOWN_MS) parks[id] = at;
  }
  parks[parkId] = now;
  try {
    localStorage.setItem(VISIT_PROMPT_STORAGE_KEY, JSON.stringify({ last: now, parks }));
  } catch {
    // Storage unavailable — prompt still works, just without cooldown.
  }
}

export function isVisitPromptCoolingDown(parkId: string, now = Date.now()): boolean {
  const log = readLog();
  if (now - log.last < GLOBAL_COOLDOWN_MS) return true;
  const at = log.parks[parkId];
  return at != null && now - at < PARK_COOLDOWN_MS;
}

interface VisitPromptState {
  parkId: string | null;
  parkName: string;
  visible: boolean;
  schedule: (parkId: string, parkName: string, delayMs?: number) => void;
  dismiss: () => void;
}

let pending: ReturnType<typeof setTimeout> | null = null;

export const useVisitPrompt = create<VisitPromptState>((set, get) => ({
  parkId: null,
  parkName: "",
  visible: false,
  schedule: (parkId, parkName, delayMs = DEFAULT_DELAY_MS) => {
    // A newer hand-off supersedes an older one still waiting to fire.
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      if (get().visible || isVisitPromptCoolingDown(parkId)) return;
      recordShown(parkId, Date.now());
      set({ parkId, parkName, visible: true });
    }, delayMs);
  },
  dismiss: () => set({ visible: false }),
}));
