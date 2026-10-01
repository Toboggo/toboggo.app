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
