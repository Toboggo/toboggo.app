import i18n from "i18next";
import { normalizeLanguage } from "../../i18n/config";
import type { CommonProperties } from "./events";

/**
 * Source de `is_authenticated` — une simple fonction injectée UNE FOIS par
 * `session.ts` (`registerIsAuthenticated`, appelé au chargement du module,
 * voir le bas de `lib/session.ts`), jamais importée directement ici.
 *
 * Pourquoi : `lib/session.ts` importe déjà `trackEvent` depuis
 * `lib/analytics` (pour `park_favorited`) — si ce module importait en retour
 * `lib/session.ts` pour lire `useSession`, on aurait un cycle
 * `session → analytics → session`. L'injection inverse cette dépendance :
 * `lib/analytics` ne connaît jamais `lib/session.ts`, seulement une fonction
 * `() => boolean` que `session.ts` lui fournit. Pas de nouvel état dupliqué :
 * la fonction injectée appelle `useSession.getState()` à chaque fois qu'elle
 * est invoquée (jamais une valeur mise en cache), donc toujours la même
 * source de vérité, juste lue en sens inverse.
 *
 * Défaut `() => false` avant tout enregistrement (ne devrait arriver qu'en
 * test si `registerIsAuthenticated` n'est pas appelé) — cohérent avec
 * "pas de session connue = non authentifié".
 */
let getIsAuthenticated: () => boolean = () => false;

/** À appeler une seule fois — uniquement depuis `lib/session.ts`. */
export function registerIsAuthenticated(getter: () => boolean): void {
  getIsAuthenticated = getter;
}

/**
 * Propriétés communes (`EVENT-TAXONOMY.md` "Propriétés communes"), calculées
 * à la demande — jamais un objet `user`/`profile`/`child` complet, seulement
 * ces 3 valeurs dérivées :
 *
 * - `is_authenticated` : voir `registerIsAuthenticated` ci-dessus.
 * - `locale` : lu directement sur le singleton `i18next` (le même que celui
 *   que `./i18n/index.ts` initialise au boot, ou `./i18n/testInit.ts` en
 *   test) — volontairement PAS via `./i18n/index.ts` ni le hook
 *   `useLocale()`, pour ne jamais déclencher une deuxième initialisation
 *   d'i18next depuis ce module (risque de course avec l'init réelle/test —
 *   voir la note de conception dans `client.test.ts`). Ce module ne fait que
 *   LIRE l'état déjà initialisé par le reste de l'app.
 * - `app_version` : `__APP_VERSION__`, injecté par `vite.config.ts`
 *   (`apps/mobile/vite.config.ts`) depuis `package.json`, et par
 *   `vitest.config.ts` en test — fiable dans les deux cas (déjà utilisé par
 *   `About.tsx`), donc utilisé tel quel plutôt qu'une valeur inventée.
 */
export function getCommonProperties(): CommonProperties {
  return {
    is_authenticated: getIsAuthenticated(),
    app_version: __APP_VERSION__,
    locale: normalizeLanguage(i18n.resolvedLanguage ?? i18n.language),
  };
}
