/**
 * Where to come back to after a just-in-time login.
 *
 * A contribution can be started while signed out. When the user hits "send", the
 * auth flow runs — and Google OAuth is a **full-page redirect** that unmounts
 * the whole SPA. The in-progress form content is persisted separately (the
 * shared draft socle — `usePersistentDraft`); this file only remembers the
 * single route to navigate back to once authenticated.
 *
 * Namespace: `toboggo:contrib-resume` — distinct from the draft namespace
 * (`toboggo:draft:*`). Short-lived (30 min, one OAuth round-trip) and never
 * holds form data, tokens or session.
 *
 * Was `contributionDraft.ts` before LOT 3D.D moved draft content to the socle.
 */

const RESUME_KEY = "toboggo:contrib-resume";
const RESUME_TTL_MS = 30 * 60 * 1000; // 30 min — just long enough for an OAuth round-trip

interface Wrapped {
  savedAt: number;
  route: string;
}

/** Remember the route to return to once the user is authenticated. */
export function setResumeRoute(route: string): void {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify({ savedAt: Date.now(), route } satisfies Wrapped));
  } catch {
    /* private mode / quota — the flow still works, it just won't survive a redirect */
  }
}

/** Read **and clear** the pending resume route (single use). */
export function takeResumeRoute(): string | null {
  let route: string | null = null;
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Wrapped;
      if (parsed && typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt <= RESUME_TTL_MS) {
        route = typeof parsed.route === "string" ? parsed.route : null;
      }
    }
  } catch {
    route = null;
  }
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {
    /* ignore */
  }
  return route && route.startsWith("/") ? route : null;
}

export function clearResumeRoute(): void {
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {
    /* ignore */
  }
}
