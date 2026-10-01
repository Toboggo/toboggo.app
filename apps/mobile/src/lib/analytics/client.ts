import posthog, { type PostHog } from "posthog-js";
import { ANALYTICS_PRIVACY_OPTIONS } from "./config";
import { getCommonProperties } from "./commonProperties";
import { getAppEnvironment } from "./environment";
import { EVENT_PROPERTY_ALLOWLIST, type AnalyticsEventName, type AnalyticsEventProperties } from "./events";

function readEnvVar(name: "VITE_POSTHOG_KEY" | "VITE_POSTHOG_HOST"): string | null {
  const raw = import.meta.env[name] as string | undefined;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * True uniquement si `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` ET
 * `VITE_APP_ENV` (strictement `"staging"` ou `"production"`, voir
 * `environment.ts`) sont TOUTES LES TROIS renseignées et valides — même
 * pattern de repli que `mapStyleUrl()` (packages/shared/src/map.ts) et
 * `isSupabaseConfigured()` (packages/shared/src/supabaseClient.ts) :
 * l'absence de configuration est un état normal (dev local, CI, Simulator,
 * sessions Claude Code), jamais une erreur, et ne doit jamais déclencher le
 * moindre appel réseau.
 *
 * `VITE_APP_ENV` est exigée ici délibérément : un projet PostHog unique
 * (Staging + Production) sépare ses données par la propriété commune
 * `environment`, jamais par projet — un environnement absent ou mal
 * orthographié ne doit JAMAIS faire retomber silencieusement un événement
 * dans une case "production" par défaut. Mieux vaut un no-op total qu'un
 * événement mal classé.
 */
export function isAnalyticsConfigured(): boolean {
  return Boolean(readEnvVar("VITE_POSTHOG_KEY") && readEnvVar("VITE_POSTHOG_HOST") && getAppEnvironment());
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
 * Identité PostHog de l'utilisateur authentifié courant — `null` = anonyme.
 *
 * Source de vérité unique de « cet utilisateur est identifié côté analytics »,
 * mise à jour de façon SYNCHRONE dès que `session.ts` apprend l'id Supabase
 * (callback `onAuthStateChange`, qui s'exécute avant même que
 * `signIn()`/`signUp()` ne rende la main à l'écran) — d'où `is_authenticated`
 * correct sur `login_completed`/`signup_completed`, là où le store de session
 * (`userId`, renseigné après le chargement asynchrone du profil) ne l'est pas
 * encore.
 */
let identifiedUserId: string | null = null;

/**
 * Rattache les événements à l'UUID Supabase (jamais e-mail, nom, ni aucune
 * propriété : `identify(userId)` seul — PRIVACY-RULES.md §1/§3). Idempotent :
 * rappeler avec le même id (TOKEN_REFRESHED, restauration + SIGNED_IN) ne fait
 * rien. Si un AUTRE compte était déjà identifié sans passage par la
 * déconnexion, on `reset()` d'abord : jamais de fusion A → B.
 *
 * La persistance reste `memory` (config.ts) : au rechargement le `distinct_id`
 * anonyme est neuf, et ce `identify()` (déclenché à la restauration de session)
 * le rattache à la même personne — un utilisateur connecté = une personne.
 */
export function identifyAnalyticsUser(userId: string): void {
  const posthogClient = getAnalyticsClient();
  if (!posthogClient || !userId) return;
  if (identifiedUserId === userId) return;
  if (identifiedUserId !== null) posthogClient.reset();
  posthogClient.identify(userId);
  identifiedUserId = userId;
}

/**
 * À la déconnexion : `reset()` PostHog (nouveau `distinct_id` anonyme) pour que
 * le compte suivant sur ce navigateur ne soit jamais fusionné avec celui-ci.
 * No-op si personne n'est identifié — une navigation invité n'est pas coupée
 * par un événement auth « pas de session ».
 */
export function resetAnalyticsIdentity(): void {
  const posthogClient = getAnalyticsClient();
  if (!posthogClient || identifiedUserId === null) return;
  posthogClient.reset();
  identifiedUserId = null;
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
 * (`is_authenticated`/`app_version`/`locale`/`environment`,
 * `commonProperties.ts`) sont ajoutées automatiquement à chaque appel —
 * jamais à fournir par l'appelant, et structurellement impossibles à écraser
 * (elles ne passent jamais par `EVENT_PROPERTY_ALLOWLIST`, cf. `events.ts`).
 *
 * Aucun composant ne doit importer `posthog-js`/`@posthog/react` ni appeler
 * `posthog.capture()` directement — uniquement cette fonction.
 */
export function trackEvent<E extends AnalyticsEventName>(event: E, properties: AnalyticsEventProperties[E]): void {
  const posthogClient = getAnalyticsClient();
  if (!posthogClient) return;
  // Revalidée ici (pas seulement dans `isAnalyticsConfigured()` ci-dessus) :
  // défense en profondeur — si jamais cette valeur devenait indisponible
  // entre les deux appels, on abandonne l'envoi plutôt que de deviner un
  // environnement, par ex. avec une valeur par défaut "production".
  const environment = getAppEnvironment();
  if (!environment) return;
  const common = getCommonProperties(environment);
  const payload = {
    ...common,
    // Authentifié = session connue du store OU identité analytics déjà posée
    // (voir `identifiedUserId`) — cohérent dès la fin de `signIn()`/`signUp()`.
    is_authenticated: common.is_authenticated || identifiedUserId !== null,
    ...filterToAllowlist(event, properties),
  };
  posthogClient.capture(event, payload);
}
