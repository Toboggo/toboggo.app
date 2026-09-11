/**
 * Park display name — generic-name detection, conservative street cleanup,
 * and the qualifier hierarchy that turns a park's raw `name` (often the
 * literal placeholder Toboggo's OSM importers write when OSM has no `name`
 * tag — see `scripts/osm/import-osm-local.py` / `import-osm-remote.py`) into
 * a differentiating title.
 *
 * NEVER stores a localized phrase: `getParkDisplayName` assembles the string
 * at call time from a translator (`t`) plus the park's own raw columns — the
 * generic prefix is translated, the proper name / street / commune never are
 * (see `park.displayName` in `apps/mobile/src/i18n/locales/*​/common.json`).
 *
 * `packages/shared` has no UI-framework dependency (not even react-i18next —
 * see `DisplayNameT` below), so every function here is a plain, deterministic
 * function of its arguments: testable with `node --test` and no React/i18next
 * harness (see `parkName.test.ts`).
 */

// ── Generic-name detection ──────────────────────────────────────────────

/**
 * Known generic playground labels: the literal fallback Toboggo's OSM
 * importers write when OSM has no `name` tag (`"Aire de jeux"`, see the
 * import scripts), its casing/singular variants actually observed in
 * production (`AUDIT-display-name-parcs-phase1.md` §D — "Aire de Jeux" ×13,
 * "Aire de jeu" ×2, "Jeux pour enfants" ×5, "Jardin d'enfants" ×3), and the
 * handful of equivalents in other languages a `name` tag can legitimately
 * carry (OSM is not French-only).
 *
 * Deliberately explicit and exhaustive rather than heuristic ("short name ⇒
 * generic") — a short real name (`"Séde"`, `"La Maourine 2"`, `"Cyclogym"`)
 * must never be swallowed, and a *long* fabricated one must never slip in
 * unnoticed either. Add a variant here only once it's backed by real data or
 * an explicit product decision — see the module-level tests for the exact
 * list this was derived from.
 *
 * Equipment-only OSM names (`"Balançoire"`, `"Pumptrack"`, `"Toboggan"`,
 * `"Trampolines"`, `"Structure multifonctions"`…) are intentionally treated
 * as NOT generic — see `isGenericParkName`'s doc comment.
 *
 * Matched on the FULL normalized string only, never "contains" — a real name
 * that happens to start with "Aire de jeux " (`"Aire de jeux Robespierre"`,
 * `"Aire de jeux du Pigeonnier"`, both present in production) is NOT
 * generic.
 */
const GENERIC_NAMES = [
  "aire de jeux",
  "aire de jeu",
  "jeux pour enfants",
  "jardin d'enfants",
  "playground",
  "children's playground",
  "area de juegos", // "Área de juegos" — diacritics stripped by normalizeForCompare()
] as const;

const GENERIC_NAME_SET: ReadonlySet<string> = new Set(GENERIC_NAMES);

/**
 * `trim` → collapse internal whitespace → lowercase → strip diacritics →
 * normalize apostrophe variants (curly `’`/backtick → straight `'`). The
 * same normalization is applied to both sides of every comparison in this
 * module (the explicit list above, and the dedup checks in
 * `getParkDisplayName`).
 */
function normalizeForCompare(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks
    .replace(/[’ʼ`]/g, "'") // curly/modifier/backtick apostrophes → straight
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Is `name` one of Toboggo's known generic playground labels (including the
 * OSM-import fallback `"Aire de jeux"`) — i.e. not differentiating enough to
 * show on its own, and a candidate for the `getParkDisplayName` qualifier
 * (street/commune)?
 *
 * `null` / `undefined` / an all-whitespace string count as generic too — an
 * absent name is, if anything, an even stronger case for a qualifier than a
 * known-generic string (in practice `parks.name` is `NOT NULL` in the
 * database, so this only matters for defensive/partial callers).
 *
 * Equipment-only OSM names (`"Balançoire"`, `"Pumptrack"`, `"Toboggan"`,
 * `"Trampolines"`, `"Structure multifonctions"`…) are intentionally treated
 * as NOT generic here: they are real OSM data (not Toboggo's own fallback
 * string), and folding them into "generic" would either invent a category
 * they don't belong to, or double up in `getParkDisplayName`
 * (`"Aire de jeux • Balançoire"` reads as if "Balançoire" were a place —
 * it's the equipment). They pass through unchanged, exactly like any other
 * real `name` — this was a `revue manuelle` case per the Phase 1 audit
 * (`AUDIT-display-name-parcs-phase1.md` §D/§J.1), not something a rule
 * should silently reclassify.
 */
export function isGenericParkName(name: string | null | undefined): boolean {
  if (name == null) return true;
  const normalized = normalizeForCompare(name);
  if (normalized === "") return true;
  return GENERIC_NAME_SET.has(normalized);
}

// ── Conservative street cleanup ─────────────────────────────────────────

/**
 * A leading housenumber token: one or more digits, optionally followed by a
 * French "bis/ter/quater" suffix or a single building-letter suffix
 * (`"66 G Avenue de Toulouse"`), either glued to the number (`"4bis"`) or
 * space-separated (`"2 bis"`), always followed by whitespace before the
 * actual street name. Case-insensitive.
 */
const LEADING_HOUSENUMBER = /^\d+\s*(?:bis|ter|quater|[a-z])?\s+/i;

/**
 * Strip a leading housenumber from a Geoapify/OSM `address_line`
 * (`"17 Rue Victor Hugo"` → `"Rue Victor Hugo"`, `"2 bis Avenue Jean
 * Jaurès"` → `"Avenue Jean Jaurès"`, `"66 G Avenue de Toulouse"` → `"Avenue
 * de Toulouse"`) — the number is the *nearest building's*, not the park's
 * (reverse geocoding resolves to the closest addressable point), and
 * showing it in a computed title is misleading (Phase 1 audit, §M.1).
 *
 * Deliberately conservative: only strips a token at the very START of the
 * string, so a number that's genuinely part of the street name
 * (`"Avenue du 8 Mai 1945"`, `"Rue du 11 Novembre"`) is untouched — those
 * strings don't start with a digit, so the regex never matches them.
 *
 * Never destructive on the source data: this transforms the string it's
 * given and nothing else — `parks.address_line` in the database is never
 * written here.
 *
 * Returns `null` for a missing/empty input, and the (whitespace-collapsed)
 * original string if stripping the number would leave nothing — defensive;
 * doesn't happen with real Geoapify data (its `address_line` always has a
 * street name after the number), but guards against a future malformed
 * value rather than returning an empty qualifier.
 */
export function cleanStreetName(addressLine: string | null | undefined): string | null {
  if (!addressLine) return null;
  const collapsed = addressLine.trim().replace(/\s+/g, " ");
  if (!collapsed) return null;
  const withoutNumber = collapsed.replace(LEADING_HOUSENUMBER, "").trim();
  return withoutNumber || collapsed;
}

// ── Display name assembly ───────────────────────────────────────────────

/** The subset of `Park` (see `packages/shared/src/types.ts`) this module
 * needs — kept minimal and duck-typed so it's trivial to construct in tests
 * and usable from any row shape that carries these three columns (`Park`,
 * `NearbyParkRow`, a partial fetch, …). */
export interface ParkDisplayNameInput {
  name?: string | null;
  address_line?: string | null;
  city?: string | null;
}

/**
 * Minimal duck-typed translator matching `useTranslation()`'s `t` — lets
 * this module stay free of a react-i18next dependency (and be testable with
 * a plain fake, see `parkName.test.ts`). Call sites pass their own `t`,
 * bound to whichever namespace is already in scope there: this function
 * always resolves its own keys against `common` explicitly via
 * `{ ns: "common" }` (same pattern already used for a cross-namespace call
 * in `apps/mobile/src/screens/favorites/Favorites.tsx`), so it works
 * regardless of the caller's own namespace.
 */
export type DisplayNameT = (key: string, options?: Record<string, unknown>) => string;

/**
 * First usable, non-degenerate qualifier: the cleaned street, else the
 * commune — skipping a candidate that (after normalization) is empty, or
 * happens to equal the translated generic prefix or the park's own raw name
 * (defensive dedup; see `getParkDisplayName`'s doc comment).
 */
function pickQualifier(
  park: ParkDisplayNameInput,
  generic: string,
  rawName: string,
): string | null {
  const candidates = [cleanStreetName(park.address_line), park.city?.trim() || null];
  const genericNormalized = normalizeForCompare(generic);
  const rawNameNormalized = normalizeForCompare(rawName);
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizeForCompare(candidate);
    if (normalized === "" || normalized === genericNormalized || normalized === rawNameNormalized) {
      continue;
    }
    return candidate;
  }
  return null;
}

/**
 * The park's display title — never invents an official name, never stores
 * anything: called at render time with the park's raw columns and a
 * translator, in whichever language is currently active.
 *
 * Hierarchy (Phase 2 — see the Phase 1 audit §J for the full rationale and
 * the ranks intentionally deferred to a later phase: parent park/garden,
 * neighbourhood/quartier):
 *
 *   1. `name` is present and not a known generic label (`isGenericParkName`)
 *      → returned as-is, NEVER translated. Either a real OSM name, a
 *      collectivité/Toboggo-validated name, or an OSM equipment word (see
 *      `isGenericParkName`'s doc comment) — Toboggo never second-guesses it.
 *   2. generic `name` + a usable street (`address_line`, housenumber
 *      stripped by `cleanStreetName`) → `"<generic> • <street>"`.
 *   3. generic `name` + no usable street but a usable `city` →
 *      `"<generic> • <city>"`.
 *   4. nothing usable → the generic label alone (`"Aire de jeux"` /
 *      `"Playground"` / `"Área de juegos"`, depending on the active
 *      language).
 *
 * The `<generic>` prefix is translated (`common:park.generic`); the
 * qualifier (street/city) is interpolated as plain data via
 * `common:park.displayName`'s `{{qualifier}}` — never passed through `t()`,
 * so it is never translated, matching the "never invent/alter a proper
 * name" rule.
 *
 * Dedup: a qualifier that (once normalized the same way as
 * `isGenericParkName`) equals the translated generic prefix or the park's
 * own raw name is skipped — falls through to the next rank instead of
 * producing a degenerate `"Aire de jeux • Aire de jeux"`. This is an
 * equality check, not a "contains" scan — see `pickQualifier`.
 */
export function getParkDisplayName(park: ParkDisplayNameInput, t: DisplayNameT): string {
  const rawName = park.name?.trim() || "";
  if (rawName && !isGenericParkName(rawName)) return rawName;

  const generic = t("park.generic", { ns: "common" });
  const qualifier = pickQualifier(park, generic, rawName);
  if (!qualifier) return generic;

  return t("park.displayName", { generic, qualifier, ns: "common" });
}
