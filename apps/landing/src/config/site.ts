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
 * Image de partage par défaut : visuel officiel 1200×630 du kit v3
 * (docs/brand-kit-v3/cover/og-1200x630-light.png, copie intacte) — d'où twitter:card
 * "summary_large_image". Les pages sans couverture propre l'utilisent.
 */
export const DEFAULT_OG_IMAGE = "/og-default.png";
export const DEFAULT_OG_IMAGE_ALT = "Toboggo";
/** Icône de marque carrée 512×512 (kit v3), utilisée comme logo de l'Organization (JSON-LD). */
export const BRAND_ICON_512 = "/icon-512.png";

export const CONTACT_EMAIL = "contact@toboggo.app";

/** App parents en production (PWA) : cible du CTA principal « Ouvrir l'app Toboggo ». */
export const APP_URL = "https://toboggo-app.vercel.app";

/**
 * URLs RÉELLES des fiches de l'app dans les stores. `null` tant que l'app n'y est
 * pas publiée (Apple Developer Program / Google Play Console : décidés, non créés) :
 * les boutons stores n'apparaissent alors NULLE PART. Le jour de la publication,
 * il suffit de coller les deux URLs ici — rien d'autre à modifier.
 */
/**
 * Réseaux sociaux RÉELLEMENT existants. Liste vide tant qu'aucune page officielle n'est confirmée :
 * le pied de page n'affiche alors rien (aucun faux lien, aucune icône morte). Pour en ajouter un :
 * `{ label: "Instagram", href: "https://www.instagram.com/…" }` — uniquement des URL https valides.
 */
export const SOCIAL_LINKS: readonly { label: string; href: string }[] = [];

export const STORE_LINKS: { appStore: string | null; googlePlay: string | null } = {
  appStore: null,
  googlePlay: null,
};
