/**
 * Local persistence for in-progress contributions (Phase 1).
 *
 * Why not `useState` only: a contribution can be started while signed out. When
 * the user hits "send", the just-in-time auth flow runs — and Google OAuth is a
 * **full-page redirect**, which unmounts the whole SPA and drops any in-memory
 * state (`useState`, the zustand `pendingResume` callback). So the draft and the
 * intent to resume are mirrored to `localStorage` before leaving for auth, and
 * picked back up on return.
 *
 * Scope on purpose kept tiny — no server-side draft store, no schema. Values
 * stored here are user-entered contribution content only (never tokens/secrets).
 * Drafts are cleared on successful send or explicit cancel, and expire on their
 * own after `DRAFT_TTL_MS`.
 */

const DRAFT_PREFIX = "toboggo:contrib-draft:";
const RESUME_KEY = "toboggo:contrib-resume";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const RESUME_TTL_MS = 30 * 60 * 1000; // 30 min — just long enough for an OAuth round-trip

interface Wrapped<T> {
  savedAt: number;
  data: T;
}

function readWrapped<T>(key: string, ttl: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Wrapped<T>;
    if (!parsed || typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > ttl) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeWrapped<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data } satisfies Wrapped<T>));
  } catch {
    /* private mode / quota — the flow still works, it just won't survive a redirect */
  }
}

// ── Draft (per contribution kind + park) ───────────────────────────────────

export function saveDraft<T>(key: string, data: T): void {
  writeWrapped(DRAFT_PREFIX + key, data);
}

export function loadDraft<T>(key: string): T | null {
  return readWrapped<T>(DRAFT_PREFIX + key, DRAFT_TTL_MS);
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    /* ignore */
  }
}

// ── Resume marker (where to go after a just-in-time login) ─────────────────

/** Remember the route to return to once the user is authenticated. */
export function setResumeRoute(route: string): void {
  writeWrapped(RESUME_KEY, route);
}

/** Read **and clear** the pending resume route (single use). */
export function takeResumeRoute(): string | null {
  const route = readWrapped<string>(RESUME_KEY, RESUME_TTL_MS);
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {
    /* ignore */
  }
  return typeof route === "string" && route.startsWith("/") ? route : null;
}

export function clearResumeRoute(): void {
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {
    /* ignore */
  }
}
