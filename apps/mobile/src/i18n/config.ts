/**
 * i18n — configuration statique (aucune dépendance à i18next ici).
 *
 * Règles produit (audit i18n, §I) :
 *  - 3 langues : fr / es / en. `es` = espagnol d'Espagne, `en` = anglais international.
 *  - La langue est **indépendante du pays et de la géolocalisation**. Rien dans
 *    ce module ne lit une position, un pays ou un fuseau.
 *  - Détection initiale : fr-* → fr, es-* → es, en-* → en, tout le reste → en.
 *  - Un choix manuel (persisté) est toujours prioritaire sur la langue du
 *    navigateur (voir `detect.ts`).
 */

export const SUPPORTED_LANGUAGES = ["fr", "es", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Langue de repli quand la langue demandée est absente ou non supportée. */
export const FALLBACK_LANGUAGE: Language = "en";

/** Clé `localStorage` du choix manuel. Même préfixe que le reste de l'app. */
export const STORAGE_KEY = "toboggo:lang";

export const DEFAULT_NAMESPACE = "common";

/**
 * Namespaces prévus (découpage par domaine — cf. audit §I). Seuls `common` et
 * `features` sont remplis en Phase 1 ; les autres se rempliront lot par lot.
 * Un namespace sans fichier de traduction se résout en `{}` (voir `resources.ts`).
 */
export const NAMESPACES = [
  "common",
  "onboarding",
  "map",
  "detail",
  "contribute",
  "reviews",
  "profile",
  "features",
  "errors",
  "legal",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Sous-tag primaire d'une balise BCP-47 (`"es-MX"` → `"es"`, `"EN_gb"` → `"en"`). */
export function primarySubtag(tag: string): string {
  return tag.toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * Ramène n'importe quelle balise de langue à une langue supportée.
 * `fr-*` → `fr`, `es-*` → `es`, `en-*` → `en`, sinon `en`.
 */
export function normalizeLanguage(tag: string | null | undefined): Language {
  if (!tag) return FALLBACK_LANGUAGE;
  const primary = primarySubtag(tag);
  return isSupportedLanguage(primary) ? primary : FALLBACK_LANGUAGE;
}

/**
 * Locale BCP-47 complète à passer aux API `Intl.*`.
 * `en` → `en-GB` : produit initialement européen (dates jj/mm, système métrique),
 * un `en-US` donnerait mm/jj. À ajuster si le positionnement international change.
 */
export const INTL_LOCALE: Record<Language, string> = {
  fr: "fr-FR",
  es: "es-ES",
  en: "en-GB",
};
