/**
 * i18n — détection et persistance du choix de langue.
 *
 * Ordre de résolution au démarrage :
 *   1. choix manuel persisté (`localStorage["toboggo:lang"]`) — prioritaire, toujours ;
 *   2. langue(s) du navigateur, normalisées (fr-* → fr, es-* → es, en-* → en) ;
 *   3. repli `en`.
 *
 * Un changement de position GPS / de pays ne passe jamais par ici : la géoloc
 * vit dans `lib/geo.ts` et n'appelle aucune de ces fonctions.
 */

import {
  FALLBACK_LANGUAGE,
  STORAGE_KEY,
  isSupportedLanguage,
  primarySubtag,
  type Language,
} from "./config";

/** Lecture défensive du choix manuel (peut échouer en navigation privée). */
export function readStoredLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isSupportedLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

/** Enregistre le choix manuel localement (jamais côté serveur en Phase 1). */
export function persistLanguage(lang: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* quota / mode privé — la langue s'applique quand même pour la session */
  }
}

/** Efface le choix manuel : la détection navigateur reprend la main. */
export function clearStoredLanguage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function navigatorLanguages(): string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages && navigator.languages.length > 0) return [...navigator.languages];
  return navigator.language ? [navigator.language] : [];
}

/**
 * Langue avec laquelle démarrer l'application.
 * Un choix manuel existant court-circuite entièrement la langue du navigateur.
 */
export function detectInitialLanguage(): Language {
  const stored = readStoredLanguage();
  if (stored) return stored;

  for (const tag of navigatorLanguages()) {
    const primary = primarySubtag(tag);
    if (isSupportedLanguage(primary)) return primary;
  }
  return FALLBACK_LANGUAGE;
}
