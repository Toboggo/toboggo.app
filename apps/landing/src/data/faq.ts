/**
 * Source unique de la FAQ : rendue par pages/faq.astro ET injectée en
 * JSON-LD FAQPage — le balisage structuré doit refléter exactement le
 * contenu visible.
 */
export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqSection {
  title: string;
  items: FaqItem[];
}

export const FAQ_SECTIONS: FaqSection[] = [
  {
    title: "Trouver un parc",
    items: [
      {
        question: "Comment fonctionne la géolocalisation ?",
        answer: "Toboggo utilise votre position pour afficher les parcs les plus proches, triés par distance.",
      },
      {
        question: "Puis-je utiliser l'app sans autoriser la position ?",
        answer: "Oui, vous pouvez rechercher une ville manuellement depuis la barre de recherche.",
      },
      {
        question: "Que signifient les filtres (WC, ombre, tranche d'âge) ?",
        answer: "Ces informations sont fournies par la communauté ou les collectivités partenaires, et vérifiées avant publication.",
      },
    ],
  },
  {
    title: "Avis et contributions",
    items: [
      {
        question: "Comment noter ou laisser un avis ?",
        answer: "Un compte est nécessaire. Depuis la fiche du parc, appuyez sur « Donner mon avis ».",
      },
      {
        question: "Comment ajouter un parc manquant ?",
        answer: "Depuis l'onglet Ajouter, indiquez le nom, l'adresse et les équipements présents. La fiche est vérifiée avant publication.",
      },
      {
        question: "Comment signaler une information erronée ou obsolète ?",
        answer: "Utilisez le bouton « Signaler » sur la fiche du parc. Notre équipe ou la collectivité concernée met à jour l'information.",
      },
    ],
  },
  {
    title: "Compte",
    items: [
      {
        question: "La création de compte est-elle gratuite ?",
        answer: "Oui, entièrement gratuite.",
      },
      {
        question: "Comment supprimer mon compte et mes données ?",
        answer: "Depuis Confidentialité dans l'app, ou en écrivant à privacy@toboggo.app.",
      },
      {
        question: "Je suis une collectivité, comment gérer mes parcs ?",
        answer:
          "Les collectivités partenaires disposent d'un accès dédié — le back-office collectivité — pour mettre à jour leurs fiches et répondre aux signalements. Contactez-nous pour l'activer.",
      },
    ],
  },
];
