/**
 * Validation éditoriale des FICHES de parc (même principe que approved.ts pour
 * les villes). Une fiche n'est générée que si :
 *   (1) le parc est dans APPROVED_PARKS (validation éditoriale humaine) ;
 *   (2) sa ville est publiée (validée ET éligible) ;
 *   (3) il passe le seuil de qualité d'une fiche (parkPages.ts).
 * Aucune autre fiche n'existe : pas de génération automatique, pas d'autres villes.
 *
 * `slug` est FIGÉ ici : une URL publiée ne change jamais, même si le nom du parc
 * est modifié ensuite ou si un homonyme apparaît (parks.slug est vide en base ;
 * aucune écriture n'est faite). Un test vérifie que ces slugs correspondent aux
 * règles de lib/seo/slugs.ts pour les noms actuels.
 *
 * `editorialReview` : validation humaine EXPLICITE de la fiche (date + relecteur).
 * Tant qu'elle est null ET que le parc n'a aucun signal de qualité réel
 * (collectivité vérifiée, photo à droits validés, last_verified_at), la fiche est
 * générée mais en `noindex,follow` et hors sitemap. C'est à toi de la renseigner,
 * après relecture : je ne la remplis jamais.
 */
export interface EditorialReview {
  /** Date de relecture (AAAA-MM-JJ). */
  reviewedAt: string;
  /** Qui a relu (nom ou rôle). */
  reviewer: string;
}

export interface ApprovedPark {
  placeSlug: string;
  /** Identifiant du parc (parks.id) : stable même si le nom change. */
  parkId: string;
  slug: string;
  editorialReview: EditorialReview | null;
}

export const APPROVED_PARKS: readonly ApprovedPark[] = [
  { placeSlug: "millau", parkId: "5fb59852-3afa-473f-9b26-90278d08c5a2", slug: "parc-de-la-mairie", editorialReview: null },
  { placeSlug: "millau", parkId: "de0f2532-c8f4-41f1-9578-fe2ace4efa97", slug: "parc-de-la-victoire-haut", editorialReview: null },
  { placeSlug: "millau", parkId: "ea14584d-61e8-47ba-a7af-a1b57c20cc62", slug: "parc-de-la-victoire-bas", editorialReview: null },
  { placeSlug: "millau", parkId: "1120b9da-5b97-4a82-8cac-30d28ba0a64f", slug: "aire-de-jeux-du-quai-sully-chalies", editorialReview: null },
  { placeSlug: "millau", parkId: "9e9c1acb-f7d0-4006-9131-30fabe70a9cb", slug: "aire-de-jeux-de-gourg-de-bade", editorialReview: null },
  { placeSlug: "millau", parkId: "09f604f7-da52-4402-9618-bbb3f6194d9e", slug: "aire-de-jeux-de-viastels", editorialReview: null },
];

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Cohérence de la liste elle-même : identifiants et slugs uniques par ville, format valide. */
export function validateApprovedParks(list: readonly ApprovedPark[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const entry of list) {
    if (!SLUG_RE.test(entry.slug)) problems.push(`slug invalide « ${entry.slug} »`);
    if (ids.has(entry.parkId)) problems.push(`parc en double ${entry.parkId}`);
    ids.add(entry.parkId);
    const key = `${entry.placeSlug}/${entry.slug}`;
    if (slugs.has(key)) problems.push(`slug en double dans la ville : ${key}`);
    slugs.add(key);
    if (entry.editorialReview && !/^\d{4}-\d{2}-\d{2}$/.test(entry.editorialReview.reviewedAt)) problems.push(`date de relecture invalide pour ${entry.slug}`);
  }
  return problems;
}
