/**
 * i18n — backend i18next minimal branché sur le chargement paresseux Vite.
 *
 * i18next demande `(langue, namespace)` ; on répond avec le JSON code-splitté
 * correspondant (`resources.loadCatalog`). Pas de requête réseau : tout est
 * bundlé et précaché par la PWA.
 */

import type { BackendModule, ReadCallback } from "i18next";
import { isSupportedLanguage, type Language, type Namespace } from "./config";
import { loadCatalog } from "./resources";

export const lazyCatalogBackend: BackendModule = {
  type: "backend",
  init: () => {
    /* aucune option */
  },
  read: (language: string, namespace: string, callback: ReadCallback) => {
    if (!isSupportedLanguage(language)) {
      callback(null, {});
      return;
    }
    loadCatalog(language as Language, namespace as Namespace).then(
      (resources) => callback(null, resources),
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), false),
    );
  },
};
