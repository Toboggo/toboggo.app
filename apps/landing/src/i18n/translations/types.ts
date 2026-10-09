export interface Dictionary {
  nav: {
    accueil: string;
    fonctionnalites: string;
    airesDeJeux: string;
    guides: string;
    collectivites: string;
    aPropos: string;
  };
  cta: {
    decouvrir: string;
    openApp: string;
  };
  footer: {
    tagline: string;
    explorer: {
      heading: string;
      fonctionnalites: string;
      guides: string;
      collectivites: string;
      airesDeJeux: string;
    };
    aPropos: {
      heading: string;
      mission: string;
      histoire: string;
      contact: string;
      aide: string;
    };
    legal: {
      heading: string;
      confidentialite: string;
      cgu: string;
      mentionsLegales: string;
      cookies: string;
    };
    copyright: string;
    /** Introduction de la mention d'attribution OpenStreetMap (le lien ODbL/OSM, lui, est fixe). */
    dataCredit: string;
  };
}
