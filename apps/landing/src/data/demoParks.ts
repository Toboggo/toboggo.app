/**
 * Sélection statique de démonstration marketing pour la home
 * ("Des parcs près de chez vous", Website-2 §3). CE N'EST PAS une connexion
 * Supabase depuis le site : ce sont de vrais parcs et attributs réellement
 * présents dans les données locales (vérifiés le 2026-09-28 via
 * `supabase db query` sur l'instance locale), figés ici en dur pour
 * l'aperçu.
 *
 * Aucune ville : aucun de ces parcs n'a de champ `city` renseigné dans les
 * données locales. Aucune note ni nombre d'avis : non affichés, par choix
 * (rien de tel n'est fiable à ce stade). `attribute` reprend le libellé
 * FR exact de la fonctionnalité réellement associée au parc (voir
 * apps/mobile/src/i18n/locales/fr/features.json), jamais inventé.
 *
 * `image` : chemin d'une vraie photo VÉRIFIÉE de CE parc précis, sous
 * /images/home/parks/. Volontairement non renseigné pour les 6 entrées
 * ci-dessous tant qu'aucune photo vérifiée n'existe — ne jamais associer une
 * photo générique à un parc réel en laissant croire qu'il s'agit de ce lieu
 * (voir consigne). PhotoPlaceholder s'affiche tant que `image` est absent.
 *
 * Un vrai carrousel connecté à Supabase reste hors périmètre de Website-2.
 */
export interface DemoPark {
  name: string;
  attribute?: string;
  image?: string;
}

export const DEMO_PARKS: DemoPark[] = [
  { name: "Aire de jeux Robespierre", attribute: "Clôturé" },
  { name: "Splash Park", attribute: "Jeux d'eau" },
  { name: "Labyrinthe des farfadets", attribute: "Accès fauteuil roulant" },
  { name: "La Naspe", attribute: "Accès fauteuil roulant" },
  { name: "Le cheval Poly", attribute: "Jeux à ressort" },
  { name: "Françoise Dolto", attribute: "Sol souple" },
];
