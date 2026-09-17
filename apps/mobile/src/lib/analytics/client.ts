import posthog, { type PostHog } from "posthog-js";
import { ANALYTICS_PRIVACY_OPTIONS } from "./config";
import { getCommonProperties } from "./commonProperties";
import { EVENT_PROPERTY_ALLOWLIST, type AnalyticsEventName, type AnalyticsEventProperties } from "./events";

function readEnvVar(name: "VITE_POSTHOG_KEY" | "VITE_POSTHOG_HOST"): string | null {
  const raw = import.meta.env[name] as string | undefined;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * True uniquement si `VITE_POSTHOG_KEY` ET `VITE_POSTHOG_HOST` sont
 * renseignées — même pattern de repli que `mapStyleUrl()`
 * (packages/shared/src/map.ts) et `isSupabaseConfigured()`
 * (packages/shared/src/supabaseClient.ts) : l'absence de configuration est
 * un état normal (dev local, CI, Simulator, sessions Claude Code), jamais une
 * erreur, et ne doit jamais déclencher le moindre appel réseau.
 */
export function isAnalyticsConfigured(): boolean {
  return Boolean(readEnvVar("VITE_POSTHOG_KEY") && readEnvVar("VITE_POSTHOG_HOST"));
}

let client: PostHog | null = null;

/**
 * Retourne le client PostHog déjà initialisé, ou l'initialise à la première
 * demande (une seule fois par session de page), ou `null` si non configuré.
 * `isAnalyticsConfigured()` est revérifiée à CHAQUE appel (pas seulement au
 * chargement du module) : si jamais l'app tournait sans ces variables, aucun
 * appel à `posthog.init()` n'a lieu, quel que soit l'ordre d'appel.
 */
export function getAnalyticsClient(): PostHog | null {
  if (!isAnalyticsConfigured()) return null;
  if (client) return client;
  posthog.init(readEnvVar("VITE_POSTHOG_KEY")!, {
    ...ANALYTICS_PRIVACY_OPTIONS,
    api_host: readEnvVar("VITE_POSTHOG_HOST")!,
  });
  client = posthog;
  return client;
}

/**
 * Filtre `properties` à l'allowlist déclarée pour cet événement dans
 * `EVENT_PROPERTY_ALLOWLIST` — seules ces clés quittent jamais ce module,
 * même si l'appelant a fourni davantage (ex. un spread accidentel d'un objet
 * `profile`/`child` plus large). Voir le commentaire d'en-tête de
 * `events.ts`.
 */
function filterToAllowlist<E extends AnalyticsEventName>(
  event: E,
  properties: AnalyticsEventProperties[E],
): Record<string, unknown> {
  const allowedKeys = EVENT_PROPERTY_ALLOWLIST[event] as readonly string[];
  const input = properties as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in input && input[key] !== undefined) filtered[key] = input[key];
  }
  return filtered;
}

/**
 * Point d'envoi unique des événements Product Analytics — no-op tant que
 * `isAnalyticsConfigured()` est faux (aucune trace posthog-js exécutée,
 * aucun réseau). `event` est restreint aux 26 noms de
 * docs/analytics/EVENT-TAXONOMY.md ; `properties` est typé et filtré à
 * l'allowlist de cet événement avant l'envoi. Les propriétés communes
 * (`is_authenticated`/`app_version`/`locale`, `commonProperties.ts`) sont
 * ajoutées automatiquement à chaque appel — jamais à fournir par l'appelant.
 *
 * Aucun composant ne doit importer `posthog-js`/`@posthog/react` ni appeler
 * `posthog.capture()` directement — uniquement cette fonction.
 */
export function trackEvent<E extends AnalyticsEventName>(event: E, properties: AnalyticsEventProperties[E]): void {
  const posthogClient = getAnalyticsClient();
  if (!posthogClient) return;
  const payload = { ...getCommonProperties(), ...filterToAllowlist(event, properties) };
  posthogClient.capture(event, payload);
}
