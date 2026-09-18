import type { AppEnvironment } from "./events";

/**
 * Lit et valide strictement `VITE_APP_ENV` — `null` pour toute valeur absente
 * OU invalide (jamais un repli implicite vers `"production"` ni
 * `"staging"`). Aucune déduction depuis `import.meta.env.MODE`/`PROD`/`DEV` :
 * un build Vite "production" peut être déployé sur l'environnement Staging,
 * donc le mode de build ne garantit rien sur l'environnement applicatif réel
 * — seule une variable explicite, positionnée par le déploiement, fait foi.
 *
 * Utilisée à la fois par `isAnalyticsConfigured()` (gate) et par
 * `commonProperties.ts` (valeur envoyée) — un seul point de lecture/validation
 * pour éviter que ces deux usages divergent.
 */
export function getAppEnvironment(): AppEnvironment | null {
  const raw = (import.meta.env.VITE_APP_ENV as string | undefined)?.trim();
  return raw === "staging" || raw === "production" ? raw : null;
}
