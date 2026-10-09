# `nearby_parks` — performance sous RLS et migration 0046

> Diagnostic du 2026-10-09 (STAGING, 85 814 parcs, lecture seule). Les mesures
> sont des ordres de grandeur ; elles ne sont **pas garanties** sur STAGING/PROD.

## Symptôme
Premier chargement de la carte (New York) : `HTTP 500`, SQLSTATE
`57014 canceling statement due to statement timeout`. Le rôle `anon` a
`statement_timeout = 3 s`.

## Cause
Sous RLS, PostgreSQL ne pousse dans un index que des opérateurs *leakproof*.
`ST_DWithin` / `&&` (geography) ne le sont pas ⇒ le filtre spatial est évalué
**après** la policy, ligne par ligne : `Parallel Seq Scan` de `parks`
(84 331 lignes écartées, 6 431 pages) au lieu de l'index GiST. L'enrichissement
(`park_public`, ~20 sous-requêtes + `fstatus`/`fvalue`) est lui aussi ralenti ×18.

| STAGING, rôle | 2 km | 10 km | 20 km | candidats seuls (20 km) |
|---|---|---|---|---|
| `anon` (warm) | 305 ms | 913 ms | 1 444 ms | 2 186 ms (Seq Scan) |
| propriétaire (sans RLS) | 63 ms | 125 ms | 235 ms | 161 ms (index GiST) |
| `anon`, 1er appel à froid | **4 623 ms** (> 3 s ⇒ 500) | | | |

Rendre PostGIS *leakproof* exige un superuser (impossible en hébergé) ; réécrire
les policies (essais 0035/0036, jamais mergés) n'enlève pas la contrainte.

## Correctif (0046)
- `nearby_parks` (même signature, mêmes colonnes) → `SECURITY DEFINER`,
  `search_path = public, pg_temp`, `EXECUTE` = anon / authenticated / service_role
  (jamais PUBLIC). Tri `distance_m, id` (stable), rayon plafonné à 100 km.
- `nearby_parks_page(lat, lng, radius, limit, after_distance, after_id)` :
  pagination **par curseur** facultative (seules les lignes de la page sont
  enrichies). Nom distinct ⇒ pas d'ambiguïté de surcharge PostgREST.
- Aucune policy, vue ni donnée modifiée.

## Équivalence de sécurité
La fonction ne renvoie que `moderation_status = 'published'` et non
`permanently_closed` (filtre appliqué aux candidats **et** en sortie). Pour un
parc publié, la RLS ne masque rien à aucun rôle sur les tables lues par la vue :

| Table | Policy de lecture | Effet pour un parc publié |
|---|---|---|
| `parks` | `moderation_status = 'published'` (+ branches étendues) | visible |
| `park_features`, `park_names`, `park_scores` | `park_is_visible(park_id)` | visible (publié) |
| `features`, `organization_parks` | `true` | identique |
| `park_media` | approved ∨ own ∨ manages — la vue filtre `status = 'approved'` | identique |

`supabase/tests/nearby_parks_definer.test.sql` le vérifie ligne à ligne contre
l'ancienne logique INVOKER, pour anon / authenticated / créateur / gestionnaire /
staff, sur US / FR / ES, avec parcs pending / draft / rejected / blocked /
fermé et médias pending / rejected (aucune fuite). Variante « STAGING dérivé » :
`nearby_parks_definer_staging_baseline.sql`.

## Dépendances sensibles (à relire à chaque évolution)
- `nearby_parks*` lit `park_public` **sous les droits du propriétaire** (RLS contournée) : seules la liste de colonnes
  fermée de la fonction et ses filtres (`published`, non `permanently_closed`) bornent l'exposition. Colonnes à
  surveiller : `created_by` (uuid du créateur), `commune_id` / `organization_id`, `views`, `has_open_report`,
  `verification_status` — déjà lisibles par `anon` via `park_public`, **donc aucune information nouvelle**.
- Une colonne ajoutée à `park_public` n'est pas exposée par ces fonctions tant qu'on ne modifie pas leur liste
  (test S3 : liste fermée de 43 colonnes, toutes présentes dans `park_public`).
- Sous-objets lus : `park_features`, `features`, `fstatus`/`fvalue`, `park_media` (filtre `approved` dans la vue),
  `park_names`, `park_scores`, `organization_parks`. Toute nouvelle policy **plus restrictive** sur l'un d'eux serait
  contournée par ces fonctions : relancer `nearby_parks_definer.test.sql`.
- Propriétaire : rôle propriétaire de `parks` (`postgres`, `BYPASSRLS`, non superuser sur Supabase) ; la migration
  vérifie qu'il n'y a pas de `FORCE ROW LEVEL SECURITY` et que le propriétaire de la fonction = propriétaire de `parks`.
- `PUBLIC` n'a aucun `EXECUTE` (assertion de la migration + test S1).

## État des environnements (constaté en lecture seule)
- **PROD** : `nearby_parks` = définition 0017 ; policy unique `parks_public_read` ;
  migrations enregistrées jusqu'à 0045 (trous 0035, 0036, 0040).
- **STAGING** : migrations enregistrées seulement jusqu'à 0033 ; `nearby_parks`
  en variante CTE et policies `parks` scindées (`parks_public_read` +
  `parks_extended_read`) = **dérive hors dépôt** (0035/0036 appliquées à la
  main, jamais mergées). 0046 redéfinit la fonction quel que soit l'état
  antérieur ; elle ne corrige pas cette dérive de policies (sémantique
  équivalente d'après 0036, non modifiée ici).

## Déploiement (ordre obligatoire)
1. **STAGING** : coller `supabase/manual/0046_apply_in_transaction.sql` dans le
   SQL Editor STAGING (ou `psql --db-url` — jamais `--linked`). Transaction unique.
2. Valider sur STAGING : `supabase/tests/nearby_parks_definer.test.sql` (rollback),
   appels `anon` Manhattan 2/10/20 km, chargement à froid de l'app, 0 erreur 57014.
3. Client : **aucune mise à jour requise** (contrat identique). Option ultérieure :
   passer `fetchNearbyParks` à `nearby_parks_page` (curseur) — régénérer
   `database.types.ts` (`gen types`) après application.
4. **PROD** seulement après accord explicite : même fichier ; vérifier d'abord
   `select md5(pg_get_functiondef(oid)) from pg_proc where proname='nearby_parks'`
   = `f70a2d121f7a6379b772fd0fb3db68cf` (définition 0017 attendue).
5. Retour arrière : `supabase/manual/0046_rollback.sql` (restaure 0017 à l'identique).

## Mesure locale reproductible
`supabase/tests/nearby_parks_definer_perf.sql` (85 000 parcs synthétiques, `anon`,
transaction annulée) : voir l'en-tête pour la commande.
