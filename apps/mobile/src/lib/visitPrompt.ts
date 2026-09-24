import { create } from "zustand";
import { hasUserReviewedPark, type Review } from "@toboggo/shared";
import { queryClient } from "./queryClient";
import { useSession } from "./session";

/**
 * Post-directions review prompt ("Vous êtes allé à ce parc ?"). Scheduled by
 * `useDirections` once the user actually hands off to a maps app; shown by
 * `<VisitRatingPrompt>` (GlobalOverlays) when they come back.
 *
 * Eligibility, per park (all must hold):
 * 1. the signed-in user has not published a review of this park — server
 *    truth (`reviews`), see `reviewStatus`. If that can't be determined
 *    (network / Supabase error), this attempt is skipped without recording
 *    anything, so a later hand-off re-checks normally. Guests skip this check;
 * 2. the prompt was not shown for this park less than
 *    `PARK_REMINDER_COOLDOWN_MS` ago ("Plus tard", ✕, or a star tap followed
 *    by an abandoned form all count as "shown", never as "reviewed");
 * 3. no prompt at all (any park) less than `GLOBAL_ANTI_SPAM_MS` ago — only
 *    guards against rapid successive hand-offs, not a per-day limit.
 * The cheap local checks (2, 3) run first so the network is only touched
 * when a prompt would otherwise be shown.
 *
 * Persisted in localStorage (best-effort — a blocked storage just means no
 * cooldown, never a crash). The log stores *when* a prompt was shown, never an
 * expiry: entries written by an earlier version (then read with a 14-day /
 * 24 h policy) are re-evaluated against the current constants as-is.
 */
export const VISIT_PROMPT_STORAGE_KEY = "toboggo:visit-prompt";
export const PARK_REMINDER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 jours
export const GLOBAL_ANTI_SPAM_MS = 30 * 60 * 1000; // 30 min
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
    if (now - at < PARK_REMINDER_COOLDOWN_MS) parks[id] = at;
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
  const at = log.parks[parkId];
  if (at != null && now - at < PARK_REMINDER_COOLDOWN_MS) return true;
  return now - log.last < GLOBAL_ANTI_SPAM_MS;
}

/**
 * Has the signed-in user already published a review of `parkId`? A review
 * already in the React Query cache (park page / profile) answers without a
 * request; otherwise one existence query. Cache misses are never trusted as
 * "no review" (a just-published review may not have been refetched).
 * Guest → `"not_reviewed"` (local cooldowns only). Check failing (offline,
 * Supabase error…) → `"unknown"`: for a non-essential prompt, a temporary
 * false negative beats asking again for a review already published.
 */
async function reviewStatus(parkId: string): Promise<"reviewed" | "not_reviewed" | "unknown"> {
  const userId = useSession.getState().userId;
  if (!userId) return "not_reviewed";
  const mine = (r: Pick<Review, "park_id" | "user_id">) => r.park_id === parkId && r.user_id === userId;
  const cached = [
    ...(queryClient.getQueryData<Review[]>(["park-reviews", parkId]) ?? []),
    ...(queryClient.getQueryData<Review[]>(["my-reviews", userId]) ?? []),
  ];
  if (cached.some(mine)) return "reviewed";
  try {
    return (await hasUserReviewedPark(userId, parkId)) ? "reviewed" : "not_reviewed";
  } catch {
    return "unknown";
  }
}

interface VisitPromptState {
  parkId: string | null;
  parkName: string;
  visible: boolean;
  schedule: (parkId: string, parkName: string, delayMs?: number) => void;
  dismiss: () => void;
}

let pending: ReturnType<typeof setTimeout> | null = null;
/** Bumped by every `schedule`, so a superseded async check never shows a prompt. */
let generation = 0;

export const useVisitPrompt = create<VisitPromptState>((set, get) => ({
  parkId: null,
  parkName: "",
  visible: false,
  schedule: (parkId, parkName, delayMs = DEFAULT_DELAY_MS) => {
    // A newer hand-off supersedes an older one still waiting to fire.
    if (pending) clearTimeout(pending);
    const gen = ++generation;
    pending = setTimeout(() => {
      pending = null;
      if (get().visible || isVisitPromptCoolingDown(parkId)) return;
      void reviewStatus(parkId).then((status) => {
        // "reviewed" or "unknown": skip this attempt, record nothing.
        if (status !== "not_reviewed" || gen !== generation) return;
        // Re-checked after the await: another prompt may have been shown meanwhile.
        if (get().visible || isVisitPromptCoolingDown(parkId)) return;
        recordShown(parkId, Date.now());
        set({ parkId, parkName, visible: true });
      });
    }, delayMs);
  },
  dismiss: () => set({ visible: false }),
}));
