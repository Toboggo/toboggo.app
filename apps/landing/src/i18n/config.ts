/**
 * i18n — fondations Website-1.
 *
 * Infrastructure FR/EN/ES construite et testée dès ce lot, mais SEULE la
 * langue par défaut (fr) est actuellement publiée : aucune route /en/ ou /es/
 * n'existe encore (voir astro.config.mjs — pas de routing i18n Astro activé),
 * et le composant LanguageSwitcher n'est pas monté dans Header/Footer. Ceci
 * sera revu dans un lot dédié (Website-7) une fois le contenu EN/ES complet
 * et validé — voir apps/mobile/src/i18n/README.md pour les mêmes principes
 * produit appliqués côté app.
 */

export const LOCALES = ["fr", "en", "es"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
