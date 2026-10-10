# Guides — architecture prévue (Phase 2B, rien d'implémenté)

Aucun article n'existe ; aucune page `/guides/[slug]/` ; aucun CMS. `/guides/` reste `noindex` et hors sitemap.

## Contenu : Astro Content Collections (MDX dans le dépôt)
```
src/content/guides/<slug>.mdx      # un fichier = un article
src/content.config.ts              # collection « guides » (à créer en 2B, avec @astrojs/mdx)
```
Le contrat des champs existe déjà : `src/lib/guides.ts` (`guideSchema`, testé). Il est volontairement identique à un futur schéma Sanity (mêmes champs) : le passage à un CMS sera un script, pas une réécriture.

## Règles
- `status: draft | published` ; un article publié a une **vraie** `publishedAt` ; `updatedAt` jamais antérieure.
- Auteur réel (`author`) ou, à défaut, l'Organisation Toboggo (jamais de faux auteur).
- Image : seulement avec `license` + `credit` + `alt` (droits validés).
- `relatedPlaces` : slugs de villes **réellement générées** ; `unknownRelatedPlaces` doit faire échouer le build.
- `faq` : seulement des questions visibles dans l'article (sinon pas de `FAQPage`).
- `/guides/` devient indexable à partir de **3** articles publiés (`MIN_PUBLISHED_GUIDES`).
- Pas de pages de tags ni de catégories tant qu'elles n'ont pas un volume réel.

## JSON-LD
`guideArticleLd` produit un `Article` avec uniquement les propriétés présentes (pas de date ni d'image inventées). `/guides/` : `CollectionPage` + `ItemList` quand il sera indexable.

## Quand envisager Sanity (Phase 3)
≥ 15–20 articles, ou un éditeur non technique, ou besoin d'aperçu / planification / traduction. Voir l'audit Phase 2.
