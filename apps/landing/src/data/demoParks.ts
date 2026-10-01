/**
 * Sélection STATIQUE de parcs RÉELS utilisée pour la démonstration de la
 * homepage ("Des parcs près de chez vous"). CE N'EST PAS une connexion
 * Supabase depuis le site : la home ne lit aucune base, ces données sont
 * figées ici en dur.
 *
 * Origine : lecture seule (SELECT) de la base de production le 2026-10-01 —
 * parcs publiés (`moderation_status = published`) de Millau, choisis parce que
 * leurs fiches sont les mieux renseignées. Les 4 premiers sont les candidats
 * prioritaires ; les 2 derniers complètent le carrousel.
 *
 * Réserves à garder en tête :
 * - tous ces parcs ont `verification_status = unverified` en base : les
 *   équipements ci-dessous sont ceux déclarés « disponibles », pas des
 *   informations confirmées sur place ;
 * - `features` ne liste que les équipements `available`, avec le libellé FR
 *   exact de apps/mobile/src/i18n/locales/fr/features.json (jamais inventé) ;
 *   les équipements sans libellé FR existant (bascule, éclairage, accès
 *   poussettes…) ne sont volontairement pas repris ici ;
 * - aucune ville affichée : le champ `city` n'est pas renseigné pour tous ;
 * - aucune note ni nombre d'avis (aucune donnée fiable).
 *
 * `image` : chemin d'une photo VÉRIFIÉE de CE parc précis, sous
 * /images/home/parks/. Volontairement absent pour tous : l'inspection des
 * photos de production (2026-10-01) n'a pas encore été validée (droits et
 * correspondance). Ne jamais associer une photo générique à un parc réel —
 * PhotoPlaceholder s'affiche tant que `image` est absent.
 *
 * Un vrai carrousel connecté à Supabase reste hors périmètre de ce lot.
 */
export interface DemoPark {
  name: string;
  /** Tranche d'âge telle que saisie en base (min_age / max_age). */
  ageLabel?: string;
  /** Équipements disponibles, libellés FR de l'app. */
  features: string[];
  image?: string;
  imageAlt?: string;
}

export const DEMO_PARKS: DemoPark[] = [
  {
    name: "Parc de la Mairie",
    ageLabel: "De 1 à 12 ans",
    features: [
      "Toilettes",
      "Point d’eau potable",
      "Ombrage",
      "Toboggan",
      "Jeux à ressort",
      "Bac à sable",
      "Structure d’escalade",
      "Clôture",
      "Bancs",
      "Accès fauteuil roulant",
    ],
  },
  {
    name: "Aire de jeux du Quai Sully-Chalies",
    ageLabel: "De 2 à 12 ans",
    features: ["Balançoire", "Jeux à ressort", "Structure de jeux", "Structure d’escalade", "Ombrage", "Clôture", "Bancs", "Parking", "Accès fauteuil roulant"],
  },
  {
    name: "Parc de la Victoire – Haut",
    ageLabel: "De 0 à 12 ans",
    features: [
      "Toilettes",
      "Point d’eau potable",
      "Ombrage",
      "Toboggan",
      "Carrousel",
      "Bac à sable",
      "Structure d’escalade",
      "Clôture",
      "Bancs",
      "Parking",
      "Accès fauteuil roulant",
    ],
  },
  {
    name: "Aire de jeux de Viastels",
    ageLabel: "De 2 à 9 ans",
    features: ["Ombrage", "Toboggan", "Bac à sable", "Clôture", "Bancs", "Parking", "Accès fauteuil roulant"],
  },
  {
    name: "Aire de jeux de Gourg de bade",
    ageLabel: "De 0 à 12 ans",
    features: ["Toilettes", "Ombrage", "Toboggan", "Balançoire", "Clôture", "Accès fauteuil roulant"],
  },
  {
    name: "Aire de jeux du Parc de la Victoire – Bas",
    ageLabel: "De 2 à 12 ans",
    features: ["Ombrage", "Toboggan", "Structure d’escalade", "Bancs", "Parking", "Accès fauteuil roulant"],
  },
];
