/**
 * Point d'entrée public de l'abstraction analytics — la SEULE chose qu'un
 * écran/composant est censé importer. Ne jamais importer `posthog-js`,
 * `@posthog/react`, `usePostHog` ou `posthog.capture` directement ailleurs
 * dans `apps/mobile/src` : passer par `trackEvent` ci-dessous.
 *
 * Aucun événement métier n'est câblé dans un écran à ce stade — ce module
 * fournit le socle (typage, no-op, provider), pas encore l'instrumentation
 * des 14 événements P0 (phase ultérieure).
 */
export { AnalyticsProvider } from "./AnalyticsProvider";
export { trackEvent, isAnalyticsConfigured } from "./client";
export type { AnalyticsEventName, AnalyticsEventProperties } from "./events";
