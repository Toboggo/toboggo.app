/**
 * Point d'entrée public de l'abstraction analytics — la SEULE chose qu'un
 * écran/composant est censé importer. Ne jamais importer `posthog-js`,
 * `@posthog/react`, `usePostHog` ou `posthog.capture` directement ailleurs
 * dans `apps/mobile/src` : passer par `trackEvent` ci-dessous.
 *
 * `registerIsAuthenticated` est une exception : ce n'est pas un événement,
 * c'est le câblage — appelé UNE FOIS, uniquement par `lib/session.ts` (voir
 * `commonProperties.ts` pour la justification complète : évite un import
 * circulaire `session.ts` → `analytics` → `session.ts`). Aucun autre fichier
 * ne doit l'appeler.
 */
export { AnalyticsProvider } from "./AnalyticsProvider";
export { trackEvent, isAnalyticsConfigured } from "./client";
export { registerIsAuthenticated } from "./commonProperties";
export { distanceBucket } from "./events";
export type { AnalyticsEventName, AnalyticsEventProperties, RouteProvider } from "./events";
