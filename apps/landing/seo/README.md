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
