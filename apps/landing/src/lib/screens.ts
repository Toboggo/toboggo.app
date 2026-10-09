/**
 * Registre des captures de l'app (apps/landing/public/screenshots/).
 *
 * Règles (voir aussi scripts/marketing-captures/README.md) :
 * - captures RÉELLES de apps/mobile, 750×1624, jamais retouchées. Stockées en WebP SANS PERTE
 *   (pixels strictement identiques au PNG de capture, contrôlés par
 *   scripts/optimize-images.mjs) ;
 * - produites sur la base LOCALE (le script refuse tout autre environnement)
 *   avec un compte de test ; les parcs affichés sont les 6 vrais parcs de Millau
 *   (données publiques des fiches, lues en lecture seule en production puis
 *   rejouées en local) ; AUCUNE photo de parc : les fiches montrent l'état
 *   « Ajouter une photo » de l'app, faute de photo aux droits documentés ;
 * - la fiche vitrine est « Aire de jeux de Gourg de bade » (adresse affichée
 *   telle que stockée) ; voir `available: false` ci-dessous pour les écrans
 *   prévus mais pas encore capturés.
 *
 * Ajouter une capture : déposer le PNG brut dans public/screenshots/, lancer
 * `node apps/landing/scripts/optimize-images.mjs` (crée le .webp), supprimer le PNG, puis passer
 * `available` à true. Tant que `available` est false, `appScreen()` renvoie
 * null et aucune page n'affiche d'image cassée ni de cadre vide.
 */
export interface AppScreen {
  id: string;
  /** Nom du fichier dans public/screenshots/. */
  file: string;
  alt: string;
  caption: string;
  available: boolean;
}

export const APP_SCREENS: readonly AppScreen[] = [
  { id: "explorer", file: "explorer.webp", alt: "Carte Explorer de l'application Toboggo", caption: "Explorez autour de vous", available: true },
  { id: "park-detail", file: "park-detail.webp", alt: "Fiche du parc « Aire de jeux de Gourg de bade » à Millau dans l'application Toboggo", caption: "Découvrez chaque parc", available: true },
  { id: "filters", file: "filters.webp", alt: "Filtres de recherche dans l'application Toboggo", caption: "Trouvez selon vos critères", available: true },
  { id: "favorites", file: "favorites.webp", alt: "Écran Favoris de l'application Toboggo", caption: "Gardez vos favoris", available: true },
  // Écrans réellement implémentés dans apps/mobile, pas encore capturés :
  { id: "compare", file: "compare.webp", alt: "Comparaison de parcs dans l'application Toboggo", caption: "Comparez des parcs", available: false },
  { id: "group-outing", file: "group-outing.webp", alt: "Sortie de groupe dans l'application Toboggo", caption: "Organisez une sortie de groupe", available: false },
  { id: "report", file: "report.webp", alt: "Signalement d'un problème dans l'application Toboggo", caption: "Signalez un problème", available: false },
  { id: "add-park", file: "add-park.webp", alt: "Ajout d'un parc dans l'application Toboggo", caption: "Ajoutez un parc manquant", available: false },
];

export function screenSrc(screen: AppScreen): string {
  return `/screenshots/${screen.file}`;
}

/** Capture disponible, ou null (jamais d'image cassée). */
export function appScreen(id: string): (AppScreen & { src: string }) | null {
  const screen = APP_SCREENS.find((s) => s.id === id);
  return screen && screen.available ? { ...screen, src: screenSrc(screen) } : null;
}
