/**
 * Local-only persistence for in-progress form drafts (LOT 3D.B — shared V1 socle).
 *
 * Framework-free plumbing. Stores **user-entered form content only**, wrapped in
 * a versioned envelope with a save timestamp, under a single localStorage
 * namespace. Never stores tokens, sessions or auth. Degrades to a safe no-op
 * when `localStorage` is missing or throws (private mode, `SecurityError`,
 * storage disabled).
 *
 * UX policy — when to restore, when to clear — is NOT here. That lives in the
 * calling screen (see `usePersistentDraft` in @toboggo/design-system) and is
 * decided flow by flow.
 *
 * No server sync, no IndexedDB, no migration of old key formats — out of scope
 * for this socle.
 */

/** Every key written by this module starts with this. Nothing else is touched. */
export const DRAFT_NAMESPACE = "toboggo:draft:";

/** Default draft lifetime when a flow does not specify one. */
export const DEFAULT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Absolute ceiling used by {@link sweepDrafts}. The sweep cannot know each
 * flow's own TTL, so it only reclaims entries that are corrupt or older than
 * this — comfortably beyond any per-flow TTL we would set (72 h for the BO
 * edit flows at most). Per-flow expiry is still enforced on every read.
 */
export const DRAFT_SWEEP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface DraftEnvelope<T> {
  /** Schema version of `data`, owned by the calling flow. */
  v: number;
  /** Epoch ms of the last write. */
  savedAt: number;
  data: T;
}

export type WriteResult = "ok" | "quota" | "unavailable";

export interface ReadDraftOptions<T> {
  schemaVersion: number;
  ttlMs: number;
  /**
   * Called when the stored envelope's `v` differs from `schemaVersion`. Return
   * the migrated value, or `null` to discard the draft. Kept deliberately
   * simple — no chained migrations in this socle.
   */
  migrate?: (data: unknown, fromVersion: number) => T | null;
  /** `JSON.parse` reviver, e.g. to rebuild `Set` / `Map`. */
  reviver?: (key: string, value: unknown) => unknown;
}

export interface WriteDraftOptions {
  schemaVersion: number;
  /** `JSON.stringify` replacer, e.g. to serialise `Set` / `Map`. */
  replacer?: (key: string, value: unknown) => unknown;
}

// ── localStorage access — never throws ────────────────────────────────────────

function getLocalStorage(): Storage | null {
  try {
    // `typeof` still evaluates the reference; a sandboxed context can throw here.
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function safeRemove(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    /* ignore */
  }
}

function isQuotaError(err: unknown): boolean {
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return (
      err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22 ||
      err.code === 1014
    );
  }
  return err instanceof Error && /quota/i.test(err.name + " " + err.message);
}

function isValidEnvelope(value: unknown): value is DraftEnvelope<unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as DraftEnvelope<unknown>).v === "number" &&
    typeof (value as DraftEnvelope<unknown>).savedAt === "number" &&
    "data" in (value as object)
  );
}

// ── Key builder ──────────────────────────────────────────────────────────────

export type DraftPrincipal = { userId?: string | null } | "guest";

export interface DraftKeyParts {
  surface: "bo" | "mobile";
  /** Business flow, e.g. `"park.new"`, `"park.edit"`, `"report"`, `"review"`. */
  flow: string;
  /**
   * Optional business scope — `parkId`, `reportId`, a wizard section, an
   * `organizationId`, … Keys are sorted so the result is deterministic
   * regardless of insertion order. Empty / nullish entries are dropped.
   */
  scope?: Record<string, string | number | null | undefined>;
  /** `{ userId }` for a signed-in user, `"guest"` otherwise. */
  principal: DraftPrincipal;
}

function principalSegment(principal: DraftPrincipal): string {
  return principal !== "guest" && principal.userId
    ? `u=${encodeURIComponent(principal.userId)}`
    : "guest";
}

/**
 * Build a deterministic, collision-safe draft key. Every segment is
 * percent-encoded, so no user value can inject the `:` separator. Always end
 * with this builder — never hand-concatenate keys in a screen.
 */
export function buildDraftKey(parts: DraftKeyParts): string {
  const enc = (s: string) => encodeURIComponent(s);
  const segments: string[] = [enc(parts.surface), enc(parts.flow)];
  if (parts.scope) {
    for (const k of Object.keys(parts.scope).sort()) {
      const v = parts.scope[k];
      if (v == null || v === "") continue;
      segments.push(`${enc(k)}=${enc(String(v))}`);
    }
  }
  segments.push(principalSegment(parts.principal));
  return DRAFT_NAMESPACE + segments.join(":");
}

// ── Read / write / clear ─────────────────────────────────────────────────────

export function readDraft<T>(key: string, options: ReadDraftOptions<T>): T | null {
  const store = getLocalStorage();
  if (!store) return null;

  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (raw == null) return null;

  let envelope: DraftEnvelope<unknown> | null = null;
  try {
    const parsed = JSON.parse(raw, options.reviver);
    if (isValidEnvelope(parsed)) envelope = parsed;
  } catch {
    /* corrupt JSON */
  }
  if (!envelope) {
    safeRemove(store, key);
    return null;
  }

  if (Date.now() - envelope.savedAt > options.ttlMs) {
    safeRemove(store, key);
    return null;
  }

  if (envelope.v === options.schemaVersion) {
    return envelope.data as T;
  }

  // Version mismatch.
  if (options.migrate) {
    let migrated: T | null = null;
    try {
      migrated = options.migrate(envelope.data, envelope.v);
    } catch {
      migrated = null;
    }
    if (migrated == null) {
      safeRemove(store, key);
      return null;
    }
    return migrated;
  }

  safeRemove(store, key);
  return null;
}

/**
 * Persist a draft. On `QuotaExceededError`: reclaim only corrupt / long-expired
 * entries in our namespace ({@link sweepDrafts}), retry once, then give up with
 * `"quota"`. A valid recent draft — even another flow's — is never sacrificed
 * to make room.
 */
export function writeDraft<T>(key: string, data: T, options: WriteDraftOptions): WriteResult {
  const store = getLocalStorage();
  if (!store) return "unavailable";

  const envelope: DraftEnvelope<T> = { v: options.schemaVersion, savedAt: Date.now(), data };
  let payload: string;
  try {
    payload = JSON.stringify(envelope, options.replacer);
  } catch {
    // Caller handed us something non-serialisable — don't crash the form.
    return "unavailable";
  }

  const attempt = (): WriteResult => {
    try {
      store.setItem(key, payload);
      return "ok";
    } catch (err) {
      return isQuotaError(err) ? "quota" : "unavailable";
    }
  };

  const first = attempt();
  if (first !== "quota") return first;

  sweepDrafts();
  return attempt();
}

export function clearDraft(key: string): void {
  const store = getLocalStorage();
  if (!store) return;
  safeRemove(store, key);
}

// ── Enumeration helpers ──────────────────────────────────────────────────────

function draftKeys(store: Storage): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k != null && k.startsWith(DRAFT_NAMESPACE)) keys.push(k);
    }
  } catch {
    return [];
  }
  return keys;
}

export interface SweepOptions {
  /** Entries older than this are removed. Defaults to {@link DRAFT_SWEEP_MAX_AGE_MS}. */
  maxAgeMs?: number;
  /** Injectable clock for tests. */
  now?: number;
}

/**
 * Housekeeping: within the Toboggo draft namespace only, remove entries that
 * are corrupt or older than `maxAgeMs`. Never touches any other localStorage
 * key, and never removes a valid, recent draft. Safe to call on app start and
 * used internally by {@link writeDraft} on a quota hit.
 */
export function sweepDrafts(options: SweepOptions = {}): number {
  const store = getLocalStorage();
  if (!store) return 0;
  const maxAgeMs = options.maxAgeMs ?? DRAFT_SWEEP_MAX_AGE_MS;
  const now = options.now ?? Date.now();

  let removed = 0;
  for (const key of draftKeys(store)) {
    let raw: string | null;
    try {
      raw = store.getItem(key);
    } catch {
      continue;
    }
    if (raw == null) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      safeRemove(store, key); // corrupt
      removed++;
      continue;
    }
    if (!isValidEnvelope(parsed)) {
      safeRemove(store, key); // malformed envelope
      removed++;
      continue;
    }
    if (now - parsed.savedAt > maxAgeMs) {
      safeRemove(store, key); // long expired
      removed++;
    }
  }
  return removed;
}

export interface PurgeFilter {
  /** Restrict to keys whose namespace-relative part starts with this. */
  prefix?: string;
  /** Arbitrary predicate on the full key. Combined with `prefix` (both must pass). */
  match?: (key: string) => boolean;
}

/**
 * Targeted cleanup within the Toboggo draft namespace. With no filter it
 * removes every Toboggo draft (maintenance / tests) — **this is not the logout
 * path**; logout must be scoped, see {@link purgeDraftsForPrincipal}.
 */
export function purgeDrafts(filter: PurgeFilter = {}): number {
  const store = getLocalStorage();
  if (!store) return 0;

  let removed = 0;
  for (const key of draftKeys(store)) {
    if (filter.prefix && !key.slice(DRAFT_NAMESPACE.length).startsWith(filter.prefix)) continue;
    if (filter.match && !filter.match(key)) continue;
    safeRemove(store, key);
    removed++;
  }
  return removed;
}

/**
 * Remove only the drafts belonging to one principal — the correct logout /
 * account-switch cleanup. Drafts owned by any other user on the same browser
 * are left untouched.
 */
export function purgeDraftsForPrincipal(principal: DraftPrincipal): number {
  const suffix = ":" + principalSegment(principal);
  return purgeDrafts({ match: (key) => key.endsWith(suffix) });
}

/** Maintenance / tests only. Never call this on logout. */
export function purgeAllDrafts(): number {
  return purgeDrafts();
}

// ── Guest → signed-in handover ───────────────────────────────────────────────

function envelopeSavedAt(raw: string): number {
  try {
    const parsed = JSON.parse(raw);
    return isValidEnvelope(parsed) ? parsed.savedAt : Number.NEGATIVE_INFINITY;
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
}

/**
 * One-shot handover of a guest draft to a signed-in user for the SAME flow and
 * scope. Touches only `guestKey` and `userKey`; every other draft (a guest
 * draft for a different flow / park included) is left alone. Raw move — no
 * schema knowledge, no merge: if a user draft already exists, the newer of the
 * two by `savedAt` is kept and the other discarded. The guest key is always
 * removed afterwards. The next `readDraft(userKey, …)` still validates TTL /
 * version as usual.
 *
 * Returns `true` when a guest draft was present and its content is now under
 * `userKey`; `false` otherwise (nothing to do, storage unavailable, or the
 * existing user draft won).
 */
export function adoptGuestDraft(guestKey: string, userKey: string): boolean {
  if (guestKey === userKey) return false;
  const store = getLocalStorage();
  if (!store) return false;

  let guestRaw: string | null;
  try {
    guestRaw = store.getItem(guestKey);
  } catch {
    return false;
  }
  if (guestRaw == null) return false;

  let userRaw: string | null = null;
  try {
    userRaw = store.getItem(userKey);
  } catch {
    userRaw = null;
  }

  const guestWins = userRaw == null || envelopeSavedAt(guestRaw) >= envelopeSavedAt(userRaw);

  if (guestWins) {
    try {
      store.setItem(userKey, guestRaw);
    } catch {
      // Could not write the user key — keep the guest draft where it is so the
      // work is not lost, and report that nothing was adopted.
      return false;
    }
  }
  safeRemove(store, guestKey);
  return guestWins;
}
