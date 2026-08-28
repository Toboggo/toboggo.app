export const LEGAL_DOCS: Record<string, { title: string; sections: { heading: string; body: string }[] }> = {
  privacy: {
    title: "Politique de confidentialité",
    sections: [
      {
        heading: "Données collectées",
        body: "Votre position géographique (jamais partagée avec des tiers à des fins publicitaires), votre e-mail et mot de passe, ainsi que les contributions que vous choisissez de publier (avis, parcs, photos).",
      },
      {
        heading: "Données de vos enfants",
        body: "Le prénom et l'âge de vos enfants sont saisis par vous, le parent titulaire du compte, à des fins de recommandation d'aires de jeux adaptées. Ces informations ne sont jamais rendues publiques ni partagées avec d'autres utilisateurs.",
      },
      {
        heading: "Finalité et base légale",
        body: "Exécution du contrat de service et, pour la géolocalisation, votre consentement explicite — révocable à tout moment depuis Confidentialité.",
      },
      {
        heading: "Conservation",
        body: "Vos données sont supprimées dans un délai de 30 jours après la fermeture de votre compte. Les avis et parcs publiés peuvent rester visibles sous forme anonymisée.",
      },
      {
        heading: "Vos droits",
        body: "Vous pouvez accéder, corriger, exporter (« Télécharger mes données ») ou supprimer vos données à tout moment depuis Confidentialité. Vous disposez également d'un droit de réclamation auprès de la CNIL.",
      },
      {
        heading: "Partage des données",
        body: "Nous ne vendons aucune donnée. Seuls des prestataires techniques (hébergement, e-mail) y accèdent, sous engagement de confidentialité.",
      },
    ],
  },
  terms: {
    title: "Conditions Générales d'Utilisation",
    sections: [
      {
        heading: "1. Objet",
        body: "Toboggo permet de localiser des aires de jeux, de consulter leurs équipements (WC, ombre, tranche d'âge…), de laisser des avis et de proposer de nouveaux parcs.",
      },
      {
        heading: "2. Compte utilisateur",
        body: "Un compte est nécessaire pour noter, laisser un avis ou ajouter un parc. La navigation et la consultation de la carte restent libres sans compte.",
      },
      {
        heading: "3. Contenu déposé par les utilisateurs",
        body: "En publiant un avis, une photo ou un parc, vous accordez à Toboggo une licence non exclusive et gratuite d'utilisation. Tout contenu peut être modéré sans préavis.",
      },
      {
        heading: "4. Comptes collectivités",
        body: "Les collectivités partenaires disposent d'un accès dédié pour gérer leurs propres fiches de parcs (informations, statut, réponse aux signalements). Cet accès est réservé aux structures autorisées et révocable à tout moment.",
      },
      {
        heading: "5. Responsabilité",
        body: "Toboggo est un service d'information et de mise en relation ; nous n'exploitons pas les aires de jeux référencées.",
      },
      {
        heading: "6. Résiliation",
        body: "Vous pouvez supprimer votre compte à tout moment depuis Confidentialité, ou en écrivant à contact@toboggo.app.",
      },
    ],
  },
  mentions: {
    title: "Mentions légales",
    sections: [
      {
        heading: "Éditeur",
        body: "Toboggo SAS, SAS au capital de 10 000 €, RCS Paris 912 345 678, siège social : 14 rue des Tilleuls, 75011 Paris.",
      },
      { heading: "Hébergement", body: "Hébergé au sein de l'Union Européenne. Détails disponibles sur demande à contact@toboggo.app." },
      {
        heading: "Propriété intellectuelle",
        body: "La marque, le logo et les contenus éditoriaux appartiennent à Toboggo SAS. Les données de localisation des parcs sont fournies par la communauté sous licence de contribution ouverte.",
      },
    ],
  },
};
