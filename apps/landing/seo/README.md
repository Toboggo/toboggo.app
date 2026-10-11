# SEO local Toboggo — architecture (Phase 2A)

Ce dossier n'est **pas déployé** (seuls `src/` et `public/` le sont). Il documente l'architecture SEO du site et contient les **brouillons non appliqués** de la base.

## Principe

```
Supabase (lecture seule, clé anon)  →  chargeur paginé unique  →  snapshot partagé
        →  lieux (normalisation provisoire)  →  éligibilité V2  →  validation éditoriale
        →  pages générées  →  hub, sitemap, liens internes
```

| Étape | Fichier (`src/lib/seo/`) |
|---|---|
| Chargeur paginé (Range / content-range, échec si troncature) | `loader.ts` |
| Snapshot partagé (1 chargement par build : config Astro + pages + home) | `snapshot.ts` |
| Lieux : fusion des variantes de ville, homonymes | `places.ts` |
| Éligibilité d'une ville — **source unique** | `eligibility.ts` |
| Validation éditoriale (villes autorisées, ville de la home) | `approved.ts` |
| Pages publiées, hub, exclusions du sitemap | `seoSite.ts`, `hub.ts` |
| Paliers de qualité d'un parc (modèle, fiches = Phase 2B) | `tiers.ts` |
| Slugs de parc (fonctions + tests, rien n'est écrit en base) | `slugs.ts` |

## Règle d'une page de ville

Page générée ⇔ ville **validée** (`approved.ts`) **ET éligible** (`eligibility.ts`).
Une ville non éligible n'a ni page, ni lien, ni entrée de sitemap. Une ville éligible mais non validée est seulement signalée dans les logs du build (« candidates »).

### Éligibilité V2
1. ≥ **5** parcs affichables (coordonnées valides + code postal) ;
2. ≥ **3** parcs documentés (tranche d'âge complète **ou** ≥ 3 infos utiles déclarées) ;
3. ≥ **20 %** des parcs affichables sont documentés.

### Ajouter une ville
1. Vérifier ses données (les logs du build listent les candidates).
2. Ajouter son slug dans `APPROVED_PLACE_SLUGS` (`approved.ts`).
3. `npm run build:landing`, puis `npm run verify:dist -w @toboggo/landing`.

### Garde-fou production
En production (`VERCEL_ENV=production`) ou avec `SEO_STRICT=1`, une ville validée qui n'est plus éligible **fait échouer le build** : on évite de dépublier silencieusement (404) une page indexée. Pour dépublier volontairement : retirer le slug de `approved.ts`.

## Paliers de qualité d'un parc (modèle ; fiches en Phase 2B)

| Palier | Condition | Traitement |
|---|---|---|
| 0 | sans coordonnées / code postal | absent |
| 1 | affichable, peu documenté | ligne dans la liste de la ville |
| 2 | documenté | carte détaillée, **pas** de fiche indexable |
| 3 | documenté + nom spécifique + adresse + ≥ 3 infos + **signal de qualité** | fiche indexable |

Signal de qualité (au moins un) : collectivité vérifiée (`organization_parks.verified` **et** `organizations.verified`), photo à droits **validés**, ou vérification réelle (`last_verified_at`). Aujourd'hui aucun parc n'en a : le palier 3 est vide. **Aucune photo n'est lue ni affichée** tant que le modèle de droits n'existe pas.

## Fiches de parc (Phase 2B) — `/aires-de-jeux/<ville>/<parc>/`

Une fiche est **générée** si et seulement si : parc validé éditorialement (`approvedParks.ts`) ∧ ville publiée ∧ seuil de qualité d'une fiche (`parkPages.ts` : nom spécifique, coordonnées + code postal + ville, parc documenté, ≥ 5 infos déclarées, ≥ 2 groupes d'infos). Aujourd'hui : exactement les 6 parcs documentés de Millau.

- **URL figée** : le `slug` est écrit dans `approvedParks.ts` (parks.slug est vide en base ; aucune écriture). Un renommage du parc ne change jamais l'URL ; un test vérifie que les slugs figés correspondent aux règles de `slugs.ts` pour les noms actuels.
- **Indexation** : `index` + sitemap seulement si la fiche atteint le palier 3 (signal de qualité réel) **ou** porte une validation éditoriale explicite (`editorialReview: { reviewedAt, reviewer }` dans `approvedParks.ts`, à renseigner par un humain après relecture). Sinon : générée en `noindex,follow` et hors sitemap. **Les 6 fiches sont noindex tant qu'aucune relecture n'est renseignée.**
- **Contenu** : uniquement des faits enregistrés — 8 critères famille (oui / non / partiel / « non renseigné »), jeux, services, accessibilité, environnement, équipements explicitement indisponibles, adresse **si elle existe**, coordonnées + lien OpenStreetMap, « Informations à confirmer », fiches voisines (distance réelle). **Aucune photo, note, avis, horaire ni téléphone.**
- **JSON-LD** : `BreadcrumbList` (4 niveaux) + `Playground` (nom, URL de la page, adresse si elle existe, coordonnées). Les URLs de fiches n'apparaissent dans l'`ItemList` de la ville que pour les fiches indexables.
- **Garde-fous** : liste d'allowlist invalide → build en échec ; fiche relue devenue inéligible ou introuvable → échec en production ; `verify-dist` vérifie l'absence d'image, le JSON-LD, les titres/descriptions uniques et l'exclusion des fiches noindex du sitemap.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` | lecture seule au build (Production **et** Preview) |
| `SEO_STRICT=1` | (optionnel) échec du build si une ville validée n'est plus éligible |
| `SEO_SNAPSHOT_FILE` | (dev/tests) lit un snapshot JSON au lieu d'appeler Supabase |

## Vérifications

```bash
npm run typecheck && npx vitest run apps/landing && npm run build:landing
npm run verify:dist -w @toboggo/landing   # sitemap, canonicals, liens, hub ⇔ villes
```

## Non appliqué (volontairement)

- `migrations-draft/` : 6 brouillons SQL (communes, `place_id`, slugs + historique, droits des photos, `seo_override`, vérification éditoriale) — voir son README.
- Remplissage de `parks.slug`, fiches `/aires-de-jeux/<ville>/<parc>/`, guides, CMS.
- Hook de déploiement Vercel : voir `REFRESH.md`.
