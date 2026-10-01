import type { CaptureResult } from "posthog-js";

/**
 * Réduit une URL à `origin + pathname` : ni query string, ni hash.
 *
 * Pourquoi : posthog-js ajoute automatiquement `$current_url` (+ `$referrer`,
 * `$initial_*`) à CHAQUE événement, à partir de `window.location.href` — hash
 * compris. Au retour d'un login OAuth, Supabase place la session dans le hash
 * (`#access_token=…&refresh_token=…`) et ne le nettoie qu'après un traitement
 * asynchrone ; un événement émis entre-temps (ex. `app_opened`) embarquait donc
 * les tokens. On ne touche PAS à `window.location.hash` (supabase-js doit le
 * lire) : on assainit ce qui part vers PostHog, via `before_send`.
 *
 * Défensif : ne lève jamais. Valeur non-string → renvoyée telle quelle si
 * absente (`undefined`/`null`), sinon `undefined` (on préfère perdre la
 * propriété que risquer de la laisser fuiter).
 */
export function sanitizeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return `${url.origin}${url.pathname}`;
  } catch {
    /* URL relative ou invalide : repli ci-dessous */
  }
  // Relative, schéma exotique (android-app://…) ou chaîne invalide : on coupe
  // au premier `?` ou `#`, ce qui supprime query et hash dans tous les cas.
  return value.split(/[?#]/, 1)[0];
}

const URL_KEY = /(^|[_$])(url|referrer)$/i;

function sanitizeBag(bag: unknown): void {
  if (!bag || typeof bag !== "object") return;
  const record = bag as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!URL_KEY.test(key)) continue;
    const raw = record[key];
    if (raw === undefined || raw === null) continue;
    const safe = sanitizeUrl(raw);
    if (safe === undefined) delete record[key];
    else record[key] = safe;
  }
}

/**
 * `before_send` PostHog : assainit toute propriété dont le nom finit par
 * `url` / `referrer` (`$current_url`, `$referrer`, `$initial_current_url`,
 * `$initial_referrer`, `$session_entry_url`, …) dans les propriétés de
 * l'événement et dans `$set` / `$set_once`. Ne supprime jamais l'événement.
 */
export function sanitizeCaptureResult(result: CaptureResult | null): CaptureResult | null {
  if (!result) return result;
  sanitizeBag(result.properties);
  sanitizeBag(result.$set);
  sanitizeBag(result.$set_once);
  return result;
}
