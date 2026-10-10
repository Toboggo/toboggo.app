# Déploiement PROD de la migration 0046 (`nearby_parks` SECURITY DEFINER)

> Préparation du 2026-10-10 — **rien n'est appliqué sur PROD**. Contexte, diagnostic et validation STAGING :
> `docs/operations/nearby-parks-performance.md`. PR #138 mergée (`05e0bae`).

## État réel de PROD (lecture seule, projet `dfzrsygetbhnjzfssgub` « Toboggo Production »)
| Élément | Valeur constatée | Compatible avec 0046 ? |
|---|---|---|
| `nearby_parks` | md5 **`f70a2d121f7a6379b772fd0fb3db68cf`** (= définition 0017), SECURITY INVOKER, propriétaire `postgres`, 1 seule surcharge | oui (empreinte attendue) |
| Type de retour | identique à celui de 0046 | `CREATE OR REPLACE` possible |
| ACL d'origine | `=X/postgres` (**PUBLIC**), postgres, anon, authenticated, service_role | 0046 révoque PUBLIC (voulu) |
| `nearby_parks_page` | n'existe pas | création |
| `parks` RLS | activée, **pas** FORCE ; propriétaire `postgres` (BYPASSRLS) | oui |
| `park_public` | md5 `fae08d09…`, `security_invoker=true`, aucune colonne manquante | inchangée |
| PostGIS | 3.3.7 dans `public` (= `search_path` de la fonction) | oui |
| Policies lues par la vue | identiques à l'état testé, sauf `organization_parks_read = true` (PROD) | oui : test relancé avec cette variante, 17/17 |
| Suivi | migrations jusqu'à 0045 ; 0046 absente | ordre respecté |
| Volume | 2 216 parcs (2 202 publiés) | gain préventif (avant l'import New York) |
| `statement_timeout` | anon 3 s, authenticated 8 s | cible du correctif |

Sauvegarde locale (non versionnée, dossier ignoré) : `backups/prod-0046-pre/` — `definitions.json` (définition, ACL,
propriétaire, policies, empreinte de la vue) et `nearby_parks_pre.sql`.

## Fichiers
| Fichier | Rôle |
|---|---|
| `supabase/manual/0046_apply_prod_in_transaction.sql` | application PROD : garde-fous d'empreinte (md5 attendu, 0046 absente, page absente, pas de FORCE RLS) + migration + enregistrement, **une transaction** |
| `supabase/manual/0046_rollback_prod.sql` | retour arrière exact : redéfinit `nearby_parks` à partir de la sauvegarde (md5 `f70a2d12…`), ACL d'origine (PUBLIC compris), supprime `nearby_parks_page`, retire 0046 du suivi, vérifie l'empreinte |
| `supabase/manual/0046_postcheck_readonly.sql` | contrôles post-migration, **SELECT uniquement** |

Validé sur la base locale (identique à PROD pour ces objets) : application avec garde-fous → md5 `afaf1b9b…` ;
retour arrière → md5 `f70a2d12…` et ACL d'origine ; post-contrôles OK. Tout dans des transactions annulées.

## Procédure (SQL Editor PROD, après accord explicite)
1. **Avant** : exécuter la requête 2 du fichier post-contrôles (état actuel) et vérifier md5 `f70a2d12…`.
   Prévoir une fenêtre calme (le verrou sur la fonction dure quelques ms).
2. Coller **`0046_apply_prod_in_transaction.sql`** en entier, exécuter une fois. Attendu : « Success. No rows returned »
   ; toute garde en échec annule la transaction (rien n'est appliqué).
3. Exécuter **`0046_postcheck_readonly.sql`** requête par requête (valeurs attendues en commentaire).
4. Smoke test application PROD : ouvrir la carte (invité, géolocalisation refusée puis acceptée), liste « Autour de vous »,
   fiche parc, ajout d'un parc **jusqu'au récapitulatif sans envoyer**. Console : 0 erreur 500 / 57014.
5. Surveiller les logs API / Postgres 30 min (erreurs `nearby_parks`, 57014, 42501 « permission denied »).
6. Régénérer `database.types.ts` (`gen types --linked`, lecture seule) dans une PR séparée pour ajouter `nearby_parks_page`.

## Critères d'arrêt → retour arrière immédiat (`0046_rollback_prod.sql`)
- une requête anon renvoie une erreur (42501, 57014, 500) après migration ;
- la requête 8 du post-contrôle montre `renvoyes ≠ attendu_publies` ;
- un parc non publié apparaît (requête 6, `interdits > 0`) ;
- toute anomalie inexpliquée sur la carte ou la liste.

## Risques résiduels
- Fonction qui contourne la RLS : sécurité = filtres internes + liste fermée de 43 colonnes + tests ; à relancer
  (`supabase/tests/nearby_parks_definer.test.sql`, base locale) à chaque évolution de `park_public`.
- PUBLIC perd `EXECUTE` : seuls `anon`, `authenticated`, `service_role` appellent la RPC (aucun autre rôle API).
- Le retour arrière rétablit `EXECUTE` pour PUBLIC (état d'origine).
- Dérive STAGING/PROD des policies `parks` : non corrigée ici.
