# Alignement du staging — policy `parks` (préalable à 0050) — PRÉPARÉ, NON APPLIQUÉ

## 1. Constat (lecture seule, 12/10/2026)
Comparaison exhaustive staging ↔ production du schéma `public` : **policies (91 vs 92), fonctions (799/799), triggers (49/49)**.
Seule différence : la table `parks`.

| | PROD | STAGING |
|---|---|---|
| `parks_public_read` | `published OR created_by=auth.uid() OR can_edit_park(..) OR (commune_id IS NOT NULL AND is_commune_member(..)) OR is_toboggo_staff(..)` — `{public}`, md5 `584ffc0f…` | `moderation_status='published'` — `{public}`, md5 `004aa1d1…` |
| `parks_extended_read` | n'existe pas | `{authenticated}` : `created_by=auth.uid()` OR `EXISTS(organization_parks ⋈ team_members …)` OR commune V1 (`team_members.commune_id = parks.commune_id`) OR `EXISTS(team_members … organization_id IS NULL)` — md5 `25cdb096…` |

Les policies SELECT permissives étant combinées en `OR`, la visibilité effective du staging = `published OR extended`.

## 2. Origine (4)
* Le dépôt ne contient aucune migration créant `parks_extended_read`. `docs/operations/nearby-parks-performance.md` la décrit comme **« dérive hors dépôt (essais 0035/0036 appliqués à la main, jamais mergés) »**, tentative de réécriture des policies pour accélérer `nearby_parks` sous RLS (« n'enlève pas la contrainte » : le filtre PostGIS n'est pas *leakproof*) ; le correctif réel a été `0046` (fonction `SECURITY DEFINER`). `supabase/tests/nearby_parks_definer_staging_baseline.sql` reproduit cette variante.
* Attention aux numéros : les fichiers `0035_notifications_insert_hardening.sql` / `0036_parks_moderation_guard.sql` du commit `889f13b` (branche `feature/v1-hardening`) sont **autre chose** (durcissement des notifications, trigger de garde de modération) ; ni staging ni prod ne les contiennent (fonctions et triggers identiques entre les deux, aucun `parks_moderation_guard`). L'affirmation « 0035/0036 appliquées à la main » n'est donc pas confirmée par la base : seule la scission de policy existe.
* La production n'a jamais eu cette variante : sa policy unique est la définition historique (0018/0020/0026). **L'effet fonctionnel voulu par la variante (mêmes lignes visibles, expression sans fonction par ligne) est déjà couvert par la prod** : la policy de prod donne exactement les mêmes droits (§3) ; la variante n'apporte aucun droit supplémentaire ni retiré.

## 3. Équivalence des droits (démontrée avant tout changement du staging)
Bac à sable `rls_p2` (schéma de la prod ; la variante staging y est reproduite et ses 2 hash de policy sont **identiques** à ceux du staging réel) :
1. **Matrice 13 profils × 15 tables (lecture) + UPDATE/INSERT/DELETE** : super_admin, support, gestionnaire, contributeur, membre V1 (commune), créateur d'un parc pending, sans organisation, staff+organisation, UID inconnu, anon, + 3 cas limites (ligne `organization_id NULL`+`commune_id` ⇒ staff, V2 seul sans `commune_id`, multi-organisations support+gestionnaire). Forme prod vs forme staging : **diff vide, 420 lignes identiques**.
2. **Propriété aléatoire** : 4 mondes tirés au hasard (statuts, `created_by`, `commune_id`, liens `organization_parks`) × 13 profils × {`parks`, `park_public`} = **104 empreintes identiques**.
3. Raisonnement : les sous-requêtes inline de la variante tournent sous la RLS de l'appelant, mais ne lisent que des lignes que l'appelant voit toujours (`team_members.user_id = auth.uid()` ; `organization_parks` d'une organisation dont il est membre ⇒ `is_org_member`) ; elles sont donc équivalentes aux helpers `SECURITY DEFINER` de la prod. Le rôle `{authenticated}` vs `{public}` ne change rien pour `anon` (`auth.uid()` NULL ⇒ aucune branche étendue).
Limite : le staging réel ne contient que des parcs publiés (85 814) : l'équivalence n'y est pas observable sur des lignes `pending` ; elle repose sur le bac à sable (schéma identique, vérifié par hash).

## 4. Fichiers
* `staging_align_parks_policy.sql` — **DRY-RUN** (finit par `ROLLBACK`).
* `staging_align_parks_policy_COMMIT.sql` — même contenu, finit par `COMMIT` (la seule différence est la dernière ligne).
* `staging_align_parks_policy_ROLLBACK.sql` — restaure exactement la variante staging (hash `004aa1d1…` / `25cdb096…`).
SQL pur (pas de méta-commande psql) : exécutable par `psql -f` ou par l'API (`supabase db query --linked --project-ref <ref staging> -f …`, jamais sans `--project-ref`).
Contenu : transaction, `lock_timeout 5s`, garde-fous (hash exacts des 2 policies de départ, 5 policies sur `parks`, helpers présents, RLS sans FORCE, 0050 absente), empreintes avant/après (parks, team_members, organization_parks, park_sources, historique `schema_migrations`, toutes les autres policies), changement = `ALTER POLICY parks_public_read` (+ `DROP POLICY parks_extended_read`), vérifications (hash prod `584ffc0f…`, 4 policies, rien d'autre modifié, **aucune donnée métier modifiée**), résumé `ALIGN_OK`.
Ne touche pas `schema_migrations` (ce n'est pas une migration).

## 5. Tests du script (bac à sable)
Dry-run → état inchangé · COMMIT → `parks_public_read` = hash prod, hash global des policies = état d'origine de la prod · relancé sur l'état aligné → refusé par le garde-fou · ROLLBACK → hash staging d'origine restaurés.

## 6. Ordre prévu (après décision)
1. Alignement staging (dry-run puis commit) → 2. `0050_manual_apply.sql` en dry-run puis commit (staging) → 3. tests RLS + mesures. Prod : seulement après validation staging et accord explicite.

## 7. Risques
* `ALTER/DROP POLICY` = ACCESS EXCLUSIVE sur `parks` (ms ; `lock_timeout` ⇒ échec propre). Hors pic.
* Performance : la policy de prod est plus coûteuse que la variante staging **pour des lignes non publiées** (staging n'en a pas : aucun effet mesurable) ; c'est précisément ce que 0050 corrige ensuite.
* Staging représentatif de la prod après alignement : bénéfice recherché ; coût = on perd l'expérience « variante » (rollback fourni).
