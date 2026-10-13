# LOT P2 — Performance RLS des lectures parcs (phase 1 : audit + préparation)

Statut : **PR ouverte, NON appliquée** (ni staging, ni production). Application staging = étape suivante, sur accord, via `0050_manual_apply.sql`.
Objectif : réduire le coût des lectures RLS (Admin/staff surtout) **sans changer aucun droit**.

## 1. Diagnostic

Mesure prod (lecture seule, rôle `authenticated` staff simulé en transaction annulée, 8 994 parcs dont 6 783 `pending`) :
`count(*)` sur `park_public` ≈ 1,5 s ; page de 25 parcs ≈ 1,7 s ; `park_sources` filtré OSM ≈ 2,7 s — contre 3–150 ms sans RLS.

Causes (confirmées par `EXPLAIN ANALYZE`, voir §4) :

1. **`parks_public_read`** évalue pour chaque parc non publié `can_edit_park(auth.uid(), id)` : fonction `SECURITY DEFINER` non inlinable qui relance `exists(parks…)`, `manages_park` (jointure `organization_parks ⋈ team_members`) puis `is_toboggo_staff`. ≈ 0,2 ms/ligne en prod.
2. **Ordre du `OR`** : `is_toboggo_staff` est en dernier → le staff paie tout avant d'être accepté.
3. **`auth.uid()` non enveloppé** en `(select auth.uid())` → pas de InitPlan, réévalué par ligne.
4. **Tables enfants** (`park_sources`, `park_features`, `park_names`, `park_scores`, + `external_ids`, `park_attribute_sources`, `park_entrances`, `park_equipment`, `park_opening_hours`, `park_zones`) : `*_read` = `park_is_visible(park_id)` par ligne (définer, relit `parks`).
5. **Piège** : leurs policies `*_write` sont `FOR ALL` → elles s'appliquent aussi aux `SELECT` (policies permissives = OR). Leur `USING` `can_edit_park(...)`/`manages_park(...)` était donc évalué par ligne même après correction des `*_read` (constaté : gain nul sur `park_sources` tant que seule `*_read` est corrigée).
6. **Impact non-staff** : anonymes / parents / gestionnaires paient aussi ~400 ms sur `park_public` (les 76 % de parcs non publiés doivent être écartés un par un) — touche la recherche mobile (`searchParks`, `ilike name`).
7. `park_public` est une vue `security_invoker` : sa RLS et celle de chaque sous-requête (`features`, `photos`, `score`, `organization_id`…) s'appliquent à chaque ligne renvoyée.

## 2. Proposition : `supabase/migrations/0050_rls_read_perf.sql`

* 2 helpers `SECURITY DEFINER STABLE` (search_path figé, EXECUTE anon/authenticated/service_role comme `nearby_parks`) :
  `rls_managed_park_ids()` (≡ volet organisation de `manages_park`) et `rls_member_commune_ids()` (≡ `is_commune_member`, chemin V1).
* `parks_public_read` : `published OR (select is_toboggo_staff((select auth.uid()))) OR created_by = (select auth.uid()) OR id in (select … rls_managed_park_ids()) OR (commune_id is not null AND commune_id in (select … rls_member_commune_ids()))` → InitPlan + hashed SubPlan, calculés **une fois par requête**.
* 10 policies `*_read` enfants : `(select is_toboggo_staff((select auth.uid()))) OR park_is_visible(park_id)` (expression d'origine conservée pour les non-staff — le chemin « commune V1 » n'y a jamais été admis, il ne l'est toujours pas).
* 10 policies `*_write` enfants : **`USING` uniquement** préfixé du même court-circuit staff ; `WITH CHECK` inchangé.
* Garde-fous intégrés : la migration s'arrête (rien modifié) si l'état de départ n'est pas exactement l'attendu (21 policies vérifiées), `lock_timeout = 5s`, vérification finale.
* **Non touchés** : policies INSERT/UPDATE/DELETE de `parks`, `park_media_read`, `organization_parks_read`, vues, fonctions existantes (`can_edit_park`, `manages_park`, `park_is_visible`, `is_toboggo_staff` restent en place).

Équivalence : `can_edit_park`, `manages_park` et `park_is_visible` incluent `is_toboggo_staff` (staff ⇒ vrai) ; `park_id` est `NOT NULL` + FK `ON DELETE CASCADE` vers `parks` sur les 10 tables ⇒ `staff OR f(...) ≡ f(...)`. Les ensembles `rls_*` sont la définition même des volets de `manages_park` / `is_commune_member`.

## 3. Tests RLS avant / après (mêmes droits)

Bac à sable isolé `rls_p2` (copie de la base locale, schéma aligné sur la prod : 0001→0049 ; hash des policies/fonctions identique à la prod sauf `notifications_insert` hors périmètre), 8 860 parcs (5 882 pending / 2 958 published / 16 rejected / 4 blocked), fixtures par rôle.

`tools/rls_equivalence_matrix.py` : pour **10 principaux** × **15 tables** compte + `md5` des lignes visibles ; puis pour chaque principal × 10 tables enfants le nombre de lignes modifiables (`UPDATE … SET park_id=park_id`), 5 `INSERT` ciblés (parc publié / pending Lyon / pending commune V1 / pending du créateur / pending quelconque) et `DELETE`.
Principaux : staff `super_admin`, staff `support`, gestionnaire Lyon, contributeur Lyon, membre commune V1 (Bordeaux), créateur d'un parc pending, utilisateur sans organisation, compte double staff+gestionnaire, uid authentifié inconnu, **anonyme**.

Résultat : **diff avant/après vide (324 lignes identiques)**. Les fixtures discriminent bien les chemins (ex. gestionnaire Lyon 2 970 parcs = 2 958 publiés + 12 pending Lyon ; membre V1 voit 2 983 parcs mais 2 961 `park_sources` — le chemin V1 n'ouvre pas les enfants, comme avant).

Contrôles complémentaires :
* `tools/rowdiff_sandbox.sql` : ancienne expression vs nouvelle, ligne à ligne, 8 860 parcs × 10 principaux → **0 divergence**.
* `tools/equivalence_readonly.sql` exécuté en **lecture seule sur la production** (données réelles, 4 principaux × 8 994 parcs = 44 970 paires) → **0 divergence** (17 803 paires visibles).
* Pré-conditions prod vérifiées en lecture seule : les 21 policies visées ont exactement la forme attendue ; aucun conflit de nom ; `team_members.commune_id == organization_id` pour les 4 lignes.

## 4. Mesures de performance (ms, meilleur de 3, `EXPLAIN ANALYZE`, bac à sable 8 860 parcs)

| requête | staff avant → après | gestionnaire avant → après | sans org avant → après | anonyme avant → après |
|---|---|---|---|---|
| `count(*)` park_public | 356 → **5,6** | 446 → **4,0** | 419 → **3,6** | 408 → **3,6** |
| page 25 (tri `updated_at`) | 440 → **14** | 511 → **71** | 513 → **65** | 528 → **66** |
| parcs `pending` (1 000 lignes, badge/ancien Shell) | 721 → **117** | 432 → **11** | 418 → **3,5** | 436 → **4,0** |
| `count` pending | 344 → **3,3** | 418 → **3,7** | 420 → **3,7** | 405 → **4,0** |
| `park_sources` source=osm | 573 → **1,3** | 1 028 → 1 045 | 940 → 978 | 916 → 936 |
| `park_features` count | 109 → **0,6** | 228 → 224 | 224 → 221 | 217 → 217 |
| recherche `name ilike` (page) | 367 → **7,2** | 463 → **5,5** | 398 → **4,4** | 409 → **4,9** |
| liste publiée (50, tri nom) | 377 → **13,6** | 561 → **52** | 458 → **49** | 490 → **51** |
| parcs d'une collectivité (ids) | 6,2 → 7,1 | 10,4 → 11,5 | 2,6 → 6,6 | 2,5 → 7,8 |

Lecture : le staff passe d'un coût proportionnel au nombre de parcs à ≈ constant ; gestionnaires/anonymes/parents gagnent ×8 à ×100 sur `park_public` (recherche mobile incluse). Les comptages massifs de **tables enfants** pour non-staff restent à ~1 s (inchangés, jamais utilisés en volume hors Admin). Les lectures ciblées d'une collectivité (≈ 10 ms) restent stables (+ 1–5 ms : construction des ensembles).
Extrapolation prod : le ratio avant/après est de ×60–×100 sur le staff ; la prod étant ~4× plus lente que le sandbox à parc égal (1,5 s vs 0,36 s), attendre ≈ 10–40 ms pour les `count`/pages Admin — **à re-mesurer sur staging puis prod** avec `tools/rls_bench.py` adapté.

## 5. Procédure d'application manuelle (après accord)

1. **Staging d'abord** (`--db-url`, jamais `--linked`) : `psql "<URL staging>" -v ON_ERROR_STOP=1 -f docs/architecture/p2/0050_manual_apply.sql` (dry-run : applique, vérifie, **ROLLBACK**), relire la sortie, puis `-v commit=1`.
2. Rejouer sur staging : matrice d'équivalence + bench (avec `P2_PSQL="psql <URL> -At"`), smoke tests : login Admin, liste Parcs, fiche parc, carte parents anonyme (`/map`, recherche), login gestionnaire.
3. **Production** : uniquement sur autorisation explicite ; même script (dry-run puis commit), hors pic de trafic.
4. Enregistrement de la version : fait **par `0050_manual_apply.sql` lui-même**, dans la même transaction (`insert into supabase_migrations.schema_migrations (version, name) values ('0050','rls_read_perf')`, même format que 0048/0049, `statements` vide) — annulé en dry-run, conservé seulement avec `-v commit=1`. Pas de `migration repair`, pas de `db push`. Le rollback retire aussi cette ligne.
5. Après application : `supabase gen types typescript --linked` (2 nouvelles fonctions apparaissent dans `Functions`) → commit de `database.types.ts`.

## 6. Rollback

`docs/architecture/p2/0050_rls_read_perf_rollback.sql` (transaction, sans donnée) : restaure `USING` d'origine des 21 policies puis supprime les 2 helpers. Testé sur le bac à sable : le hash global des policies redevient **identique** à l'état d'origine. Le rollback est instantané (aucune donnée ni index touchés) ; mêmes verrous que l'application.

## 7. Analyse des risques

| risque | niveau | traitement |
|---|---|---|
| Changement de droits involontaire | faible | équivalence logique + matrice 10×15 + 324 vérifications écriture + 0 divergence sur données prod réelles ; garde-fous « état attendu » |
| **`ALTER POLICY` = ACCESS EXCLUSIVE** (constaté) sur 11 tables | moyen | transaction de l'ordre de la ms ; `lock_timeout=5s` → échec propre plutôt que blocage ; appliquer hors pic ; relancer si timeout |
| Les 2 helpers sont appelables en RPC (`/rpc/rls_*`) | faible | ne renvoient que les ids de l'appelant (pas de fuite) ; même exposition que `is_toboggo_staff`/`manages_park` ; alternative = schéma non exposé (décision) |
| Dérive future (nouveau rôle/chemin ajouté dans `manages_park` sans mise à jour de `rls_managed_park_ids`) | moyen | commentaire dans les 2 fonctions ; test matrice à rejouer à chaque modif de ces helpers ; `manages_park` reste utilisé par les policies d'écriture |
| Migration non idempotente (2ᵉ exécution refusée par le garde-fou) | faible | voulu (échoue sans rien changer) |
| Plans de requêtes différents pour des utilisateurs avec très grand périmètre (hashed subplan de milliers d'ids) | faible | le sous-plan est borné au périmètre de l'utilisateur ; re-mesurer avec un gros compte collectivité |
| Tables enfants non-staff toujours lentes en scan massif | résiduel | hors usage réel ; option future : ensemble « parcs visibles » ou RPC Admin |
| Prod ≠ sandbox (volumétrie, index, charge) | moyen | staging obligatoire + dry-run + même suite de tests ; mesures prod à refaire |
| Dérive de schéma local (`db reset`) | faible | 0050 s'enchaîne après 0049 ; le garde-fou exige l'état 0018/0047 |

## 8. Décisions à prendre
* Appliquer sur staging (puis prod) — et quand.
* Helpers conservés dans `public` pour ce lot (décision fondateur) ; schéma privé non exposé = option future.
* Étendre le même schéma (staff InitPlan) à `reports_read`, `park_edits_read`, `park_media_read`, `organization_parks_read` (petites tables aujourd'hui : gain négligeable, non inclus).
* Scans massifs enfants pour non-staff : à traiter seulement si un usage apparaît (ex. carte Admin → RPC bornée).

## 9. Reproduire le bac à sable
`docker exec supabase_db_Toboggo_App createdb -U postgres rls_p2` ; `pg_dump -Fc postgres | pg_restore -d rls_p2 --no-owner` ; appliquer 0037→0049 manquantes (`psql -1`) ; `tools/sandbox_scale.sql` (×4 parcs), `tools/sandbox_fixtures.sql`, `tools/sandbox_seed_children.sql` ; baseline = `python3 tools/rls_equivalence_matrix.py > before.txt`, appliquer 0050, rejouer → `diff`. `tools/rls_bench.py` pour les temps. **Ne jamais pointer `P2_PSQL` vers la production.**
