/**
 * Registre des captures de l'app (apps/landing/public/screenshots/).
 *
 * Règles (voir aussi scripts/marketing-captures/README.md) :
 * - captures RÉELLES de apps/mobile, 750×1624 PNG, jamais retouchées ;
 * - produites sur la base LOCALE avec un compte de test (le script refuse tout
 *   autre environnement) : aucune donnée personnelle, aucune donnée de prod ;
 * - les captures actuelles montrent les données de test locales (Tarbes,
 *   « Aire de jeux Robespierre ») : PROVISOIRES, à remplacer par une série
 *   complète (voir `available: false` ci-dessous pour les écrans prévus).
 *
 * Ajouter une capture : déposer le PNG dans public/screenshots/, passer
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
  { id: "explorer", file: "explorer.png", alt: "Carte Explorer de l'application Toboggo", caption: "Explorez autour de vous", available: true },
  { id: "park-detail", file: "park-detail.png", alt: "Fiche d'un parc dans l'application Toboggo", caption: "Découvrez chaque parc", available: true },
  { id: "filters", file: "filters.png", alt: "Filtres de recherche dans l'application Toboggo", caption: "Trouvez selon vos critères", available: true },
  { id: "favorites", file: "favorites.png", alt: "Écran Favoris de l'application Toboggo", caption: "Gardez vos favoris", available: true },
  // Écrans réellement implémentés dans apps/mobile, pas encore capturés :
  { id: "compare", file: "compare.png", alt: "Comparaison de parcs dans l'application Toboggo", caption: "Comparez des parcs", available: false },
  { id: "group-outing", file: "group-outing.png", alt: "Sortie de groupe dans l'application Toboggo", caption: "Organisez une sortie de groupe", available: false },
  { id: "report", file: "report.png", alt: "Signalement d'un problème dans l'application Toboggo", caption: "Signalez un problème", available: false },
  { id: "add-park", file: "add-park.png", alt: "Ajout d'un parc dans l'application Toboggo", caption: "Ajoutez un parc manquant", available: false },
];

export function screenSrc(screen: AppScreen): string {
  return `/screenshots/${screen.file}`;
}

/** Capture disponible, ou null (jamais d'image cassée). */
export function appScreen(id: string): (AppScreen & { src: string }) | null {
  const screen = APP_SCREENS.find((s) => s.id === id);
  return screen && screen.available ? { ...screen, src: screenSrc(screen) } : null;
}
