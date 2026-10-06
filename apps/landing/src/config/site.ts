/**
 * Constantes du site public — SEUL endroit où vit le domaine.
 *
 * URL réellement déployée aujourd'hui (voir docs/architecture/database-migration.md
 * §11 CHECKPOINT). À remplacer si/quand un domaine personnalisé est attaché au
 * projet Vercel "toboggo-website" : canonicals, OG, sitemap et robots.txt
 * suivent automatiquement.
 */
export const SITE_URL = "https://toboggo-website.vercel.app";

export const SITE_NAME = "Toboggo";
export const SITE_LOCALE = "fr_FR";

/**
 * Image de partage par défaut : l'icône de marque réelle (512×512). Aucun
 * visuel 1200×630 dédié n'existe encore — d'où twitter:card "summary" et non
 * "summary_large_image". À remplacer par une vraie image OG quand elle existe.
 */
export const DEFAULT_OG_IMAGE = "/icon-512.png";
export const DEFAULT_OG_IMAGE_ALT = "Logo Toboggo";

export const CONTACT_EMAIL = "contact@toboggo.app";

/** App parents en production (PWA) : cible du CTA principal « Ouvrir l'app Toboggo ». */
export const APP_URL = "https://toboggo-app.vercel.app";

/**
 * URLs RÉELLES des fiches de l'app dans les stores. `null` tant que l'app n'y est
 * pas publiée (Apple Developer Program / Google Play Console : décidés, non créés) :
 * les boutons stores n'apparaissent alors NULLE PART. Le jour de la publication,
 * il suffit de coller les deux URLs ici — rien d'autre à modifier.
 */
export const STORE_LINKS: { appStore: string | null; googlePlay: string | null } = {
  appStore: null,
  googlePlay: null,
};
