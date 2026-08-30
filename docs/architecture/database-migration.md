# Toboggo — Chantier de migration Supabase V1 → V2 (BDD mondiale)

> **SOURCE DE VÉRITÉ du chantier.** À mettre à jour à la fin de chaque phase.
> Aucun secret / token / mot de passe ici.
> Dernière mise à jour : **2026-08-30** — **Phase 5C = CLOSED / PASS** (commit `e0712f8` commité **et poussé** sur `origin/main` ; `HEAD == origin/main`). **Phase 5D en cours = PRÉPARATION AU CUTOVER V2** (préparation seule, prod jamais touchée) : réconciliation du checkpoint, analyse du backup production (Docker **redevenu disponible** sur cette machine → `supabase db dump --linked` viable), **plan de rollback écrit (§15)**, **procédure staging jetable (§16)**, **audit pré-cutover (§17)**. Aucun `db push --linked`, aucun `db reset --linked`, aucun `migration repair`, aucune migration `0022+`, aucun commit/push effectué en 5D.
>
> Rappel Phase 5C.1 (close) : P5C-1 corrigé côté app (`Parks.tsx` + `ParkModal.tsx`, gardes explicites, 0 `any`/`ts-ignore`) ; P5C-2/P5C-3 corrigés via **`0021_fix_remaining_v2_rls.sql`** (non destructive — branche V2 `manages_park`/`organization_parks` ajoutée en OR, branche V1 `commune_id` conservée). `LEGACY_RLS_AUDIT = PASS`. `db reset` local → `0001→0021` + seed = **PASS**. `BACKOFFICE_PARKS/REPORTS/REVIEWS/MULTI_ORG` = PASS · `TYPECHECK` / `build:mobile` / `build:backoffice` = PASS. **`0021` est pris ; le legacy cleanup destructif est `0022+` (toujours INTERDIT).** Prod toujours V1 (`0001→0006`) ; `0007→0021` JAMAIS appliquées en prod. `READY_FOR_PHASE_5D = YES`. Dettes non bloquantes ouvertes : **D4** (`ADDPARK_TRI_STATE_DECISION = OPEN`), **M1–M5** (voir §11).

Ce document permet à une nouvelle session Claude Code (sans accès à l'historique
de conversation) de reprendre le chantier sans reperdre une décision ni refaire
les audits. Lire **§11 CHECKPOINT** en premier.

---

## 1. État actuel

| Élément | État |
|---|---|
| **Production Supabase** (projet lié `dfzrsygetbhnjzfssgub`) | **V1** — schéma plat pré-PDF, jamais migré vers v2 |
| **Migrations réellement déployées** | `0001 → 0006` = les 6 fichiers historiques (voir §3) |
| `supabase/migrations/` | Historique réel `0001_init … 0006_admin_user_moderation` **+** migrations incrémentales `0007 → 0019` (**TESTED en local 3B–3E**) **+ `0020_fix_v2_runtime_compat.sql`** (Phase 5B.1 : corrections runtime coexistence D1/D2/D3, non destructif — voir §14) **+ `0021_fix_remaining_v2_rls.sql`** (Phase 5C.1 : P5C-2/P5C-3, `reports_*` + `reviews_update` alignées `organization_parks`, non destructif — voir §14). Non déployées en prod. |
| `supabase/migrations-v2-draft/` | Architecture cible **from-scratch de référence uniquement** (`0001_schema … 0005_fix_signup_trigger`). **NE PAS appliquer.** Sert de spec + de cible pour `supabase gen types` post-cutover. |
| `packages/shared/src/types/database.types.ts` | Version V2 générée en local (`gen types --local`, Phase 3C), **commitée en `1f0510e` (Phase 4A)** après re-vérification structurelle contre le schéma local V2 validé (17 tables v2 + vue `park_public`, ~18 enums v2, `report_status += in_progress`, `nearby_parks` élargi). Le fix Phase 3E (`park_public.water`) ne change pas la forme du type (`water: boolean` inchangé). Sauvegarde V1 volatile : `/tmp/database.types.v1.backup.ts`. Régénérer post-cutover via `gen types --linked` une fois la prod en V2. |
| `packages/shared/src/api/*.ts` + `packages/shared/src/types.ts` | **Phase 4B (`ca18c71`)** : alignés avec `database.types.ts` V2. `npm run typecheck` : **10 → 0 erreurs** ; `build:mobile` + `build:backoffice` PASS. Aucun `any` / `as any` / `@ts-ignore` / `@ts-expect-error` ajouté ; aucun `DEFAULT` ajouté aux colonnes legacy ; DB/RLS/migrations inchangées. Colonnes legacy NOT NULL (`parks.lat/lng/formatted_address`, `reviews.stars`, `reports.reason`, `maintenance.commune_id`) laissées aux triggers `*_v1_compat`. |
| `packages/shared/src/supabaseClient.ts` | `createClient<Database>` typé contre `database.types.ts` (V2 depuis `1f0510e`). Typecheck applicatif : **0 erreur** (Phase 4B). |
| `supabase/inventory-pre-v2.sql` | Script READ-ONLY d'inventaire prod, déjà exécuté (résultats en §2). |
| **Git** | Repo `github.com/Toboggo/toboggo.app` branche `main`. Commits du chantier poussés (du plus récent au plus ancien) : `b530265 fix(db): resolve v2 runtime compatibility issues` (Phase 5B.1 — `0020_fix_v2_runtime_compat.sql` + `seed.sql` + doc) · `f270275 docs(db): checkpoint phase 4` · `ca18c71 fix(shared): align APIs with Supabase v2 types` (Phase 4B) · `1f0510e chore(types): switch Supabase types to v2 schema` (Phase 4A) · `9b13047 fix(db): validate v1 to v2 backfill` (Phases 3B→3E) · `d0e1875 docs(db): refresh migration checkpoint` · `c0da9a2 chore(types): type Supabase client from remote schema` · `3029c57 chore(db): prepare incremental Supabase v2 migration` (réconciliation Phase 2A). **Non commité (Phase 5C.1, à commiter) : `supabase/migrations/0021_fix_remaining_v2_rls.sql` (nouveau) + `apps/backoffice/src/components/ParkModal.tsx` + `apps/backoffice/src/screens/Parks.tsx` + ce doc.** Non commité hors chantier (NE PAS toucher, NE PAS stager) : 3× `icons-sprite.svg` + `docs/Toboggo-Brand-Guidelines.pdf`. Voir §11 « ÉTAT GIT ». |

### Reconstruction de l'historique (fait en Phase 2A/2B, commité dans `3029c57`)

- Les 6 fichiers historiques `_archive_migrations_pre_pdf/0001…0006` ont été **copiés** dans `supabase/migrations/` (SHA-1 identiques). L'archive est conservée.
- Les 5 fichiers v2 from-scratch ont été **déplacés** vers `supabase/migrations-v2-draft/`.
- `supabase migration list --linked` affiche alors `Local 0001→0006 == Remote 0001→0006` (alignés en **contenu**, pas seulement en numéro).

---

## 2. Données production inventoriées (`inventory-pre-v2.sql`)

| Table | COUNT(*) |
|---|--:|
| communes | **2** |
| profiles | **4** |
| team_members | **3** (2 `super_admin` sans commune = staff Toboggo ; 1 `gestionnaire` lié à une commune) |
| parks | **17** |
| reviews | 0 |
| reports | 0 |
| maintenance | 0 |
| park_edit_history | 0 |
| notifications / activity_log / groups / group_members / contact_messages | 0 |

**Orphelins : AUCUN.** 1 `profiles.favorites` contient 1 UUID de parc **valide**.

### parks (17)

- 16 avec `play_equipment` non vide, 1 sans
- 6 avec `commune_id`, **11 sans** (restent sans organisation en v2)
- 16 `published`, 1 `pending`
- 0 photo (`parks.photos` vide partout ; buckets Storage `park-photos`/`avatars`/`report-photos` à **0 objet**)
- 0 adresse vide, 0 lat/lng invalide, 0 `geom` NULL

### parks — booléens `true`

| wc | shade | fenced | pmr | benches | water | parking |
|--:|--:|--:|--:|--:|--:|--:|
| 10 | 13 | 11 | 10 | 14 | 4 | 9 |

### parks.surface

| gazon | sol_souple | sable | non_precise |
|--:|--:|--:|--:|
| 7 | 5 | 4 | 1 |

### parks.play_equipment[] — valeurs distinctes + fréquence

| code V1 | occurrences |
|---|--:|
| swing | 12 |
| sandbox | 7 |
| toboggan | 7 |
| climbing | 6 |
| springs | 4 |
| carousel | 3 |
| multisport | 2 |
| waterplay | 2 |
| zipline | 2 |
| motorcourse | 1 |

**Total attendu de lignes `park_features` après 0010** : `17 × 8` (features « toujours renseignées ») `+ 46` (play) = **182**, dont **46** en statut `unknown` (voir §5).

---

## 3. Architecture V1 (réellement déployée)

Enums : `park_status(draft,pending,published,blocked,rejected)`, `park_surface(sable,gazon,sol_souple,non_precise)`, `report_reason(...)`, `report_status(open,resolved,dismissed)`, `age_band(all,under3,3-6,6-12)`, `maintenance_recur`, `team_role(super_admin,moderation,support,gestionnaire,contributeur)`, `notification_type`.

Tables métier (13) :

- **`communes`** (id, name, contact_email, email_notif, created_at)
- **`parks`** — plat : `commune_id`, `formatted_address NOT NULL`, `lat`/`lng NOT NULL` (double precision), `geom` généré, `age_min`/`age_max int NOT NULL def 0/12`, `surface`, `wc/shade/fenced/pmr/benches/water/parking bool NOT NULL def false`, `play_equipment text[]`, `photos text[]`, `status`, `created_by`, `views`, `rating`, `review_count`, `has_open_report`
- **`park_edit_history`** (park_id, actor **text**, action **text**, note, created_at)
- **`reviews`** — `stars NOT NULL check(0.5..5)`, `sub_ratings jsonb {clean,safety,equipment,comfort}`, `age_band`, `flagged bool NOT NULL`, `photo`, `reply/reply_by/reply_at` ; **pas de `updated_at`**
- **`reports`** — `reason NOT NULL`, `equipment`, `comment`, `photo`, `status`, `resolution_*`
- **`team_members`** — `commune_id` nullable (null = staff), `unique(commune_id, email)`
- **`maintenance`** — `commune_id NOT NULL`
- **`activity_log`** — `commune_id` nullable
- `profiles` (+ `suspended` via 0006), `notifications`, `groups`, `group_members`, `contact_messages`

Fonctions : `recompute_park_rating` (lit `stars`), `recompute_park_open_report` (`status='open'`), `touch_updated_at`, `link_team_member_on_signup`, `nearby_parks(double precision, double precision, int)` (retour **plat**), `increment_park_views`, `delete_own_account`.
RLS helpers : `is_toboggo_staff` / `is_toboggo_admin` (sur `commune_id is null`), `commune_role`, `is_commune_member`, `is_commune_gestionnaire`.

### Les 6 migrations historiques

| # | Fichier | Contenu |
|---|---|---|
| 0001 | `0001_init.sql` | schéma plat + PostGIS + triggers + `nearby_parks` V1 |
| 0002 | `0002_rls.sql` | helpers `*_commune_*` + policies V1 |
| 0003 | `0003_storage.sql` | buckets park-photos / avatars / report-photos + policies |
| 0004 | `0004_account_deletion.sql` | `delete_own_account()` |
| 0005 | `0005_contact_messages.sql` | table `contact_messages` + policies |
| 0006 | `0006_admin_user_moderation.sql` | `profiles.suspended` + `profiles_staff_read/update` |

---

## 4. Architecture V2 cible — transformations

| V1 | V2 | Transformation |
|---|---|---|
| `communes` | `organizations` (+ `type`, `country_code`, `website`, `verified`) | copie 1-1, **`organizations.id = communes.id`** (UUID préservés) ; `type='municipality'`, `country_code='FR'` |
| `parks.commune_id` | `organization_parks(organization_id, park_id, role='owner')` | ligne N-N pour les **6** parcs concernés ; 11 sans org |
| `parks.wc/benches/water/parking/pmr` (bool) | `park_features` : `toilets`/`benches`/`drinking_water`/`parking`/`wheelchair_access` | `true→available`, `false→unknown` (voir §5) |
| `parks.shade` (bool) | `park_features(shade_level)` | `true→available value 'partial'` ; `false→unknown` |
| `parks.fenced` (bool) | `park_features(fence_status)` | `true→available value 'partially_fenced'` ; `false→unknown` |
| `parks.surface` | `park_features(surface_type)` | `gazon→grass`, `sable→sand`, `sol_souple→rubber` (available) ; `non_precise→unknown` |
| `parks.play_equipment[]` | `park_features` catégorie `play`, statut `available` | `toboggan→slide`, `springs→springer`, `waterplay→water_play`, `motorcourse→motor_course` ; les 6 autres identiques |
| `parks.photos[]` | `park_media` (url, category='other', status='approved', is_cover sur le 1er) | 0 ligne (arrays vides) |
| `parks.age_min/age_max` | `parks.min_age/max_age` (smallint) + `ages_derived=false` | copie |
| `parks.status` | `parks.moderation_status` | libellés d'enum identiques → cast direct |
| `parks.lat/lng` | `parks.latitude/longitude` (numeric(9,6)) + `location` généré | cast |
| — | `parks.country_code`/`timezone` **NOT NULL sans DEFAULT** | backfill `'FR'`/`'Europe/Paris'` **des 17 lignes historiques uniquement** (voir §5) |
| `parks.formatted_address` | `parks.address_line` (+ `postal_code`, `city` restent NULL) | copie |
| `reviews.stars` | `reviews.rating` | rename (même échelle) |
| `reviews.sub_ratings jsonb` | `reviews.cleanliness/safety/equipment/comfort` | extraction clés `clean/safety/equipment/comfort` |
| `reviews.age_band` | `reviews.recommended_min_age/max_age` | `all→0..12`, `under3→0..3`, `3-6→3..6`, `6-12→6..12` |
| `reviews.flagged` | `reviews.status` (`published`/`flagged`) | `true→flagged` |
| `reports.reason` | `reports.category` | libellés identiques → cast |
| `reports.equipment/comment` | `reports.equipment_label`/`description` | rename |
| `reports.status` | idem + valeur `in_progress` ajoutée | superset |
| `park_edit_history` | `audit_log` (générique) | `entity_type='park'` ; `actor` texte → `source` (perte connue, 0 ligne) |
| `team_members/maintenance/activity_log.commune_id` | `.organization_id` (FK organizations) | ajout colonne + backfill = `commune_id` |
| `profiles.favorites uuid[]` | inchangé | — |
| — (nouvelles, vides) | `park_zones`, `park_entrances`, `park_equipment`, `park_opening_hours`, `park_sources`, `external_ids`, `park_names`, `park_attribute_sources`, `park_edits`, `park_scores`, `park_duplicate_candidates`, `features` (seedé) | création seule |

Vue `park_public` (v2) : aplatit le modèle normalisé **et** reprojette la forme plate (`wc`, `surface`, `play_equipment`, `commune_id`, `status`…) pour que le front actuel continue de compiler pendant la coexistence.

---

## 5. Décisions irréversibles / importantes

1. **§4 — jamais `false → unavailable`.** Un booléen V1 `false` signifie « non coché » ≠ « confirmé absent ». Mapping figé :
   - `wc/benches/water/parking/pmr` : `true → available`, **`false → unknown`**
   - `shade` : `true → shade_level available value 'partial'` ; `false → unknown, value NULL` (**jamais `fully_shaded`/`mostly_shaded`**)
   - `fenced` : `true → fence_status available value 'partially_fenced'` ; `false → unknown, value NULL` (**jamais `fully_fenced`**)
   - `surface non_precise → surface_type unknown, value NULL`
   > Conséquence : après migration on ne distingue plus « non coché » de « confirmé absent ». ~46 lignes `park_features` en `unknown`. Accepté.
2. **`country_code` / `timezone`** : `'FR'` / `'Europe/Paris'` uniquement en **backfill des 17 parcs historiques** (français). **JAMAIS en DEFAULT de colonne, JAMAIS dans un trigger.** Tout nouveau parc doit fournir sa géographie explicitement (architecture mondiale). Un INSERT qui les omet doit échouer.
3. **`organizations.id = communes.id`** : UUID préservés pour que `parks.commune_id`, `team_members.commune_id` pointent déjà la bonne organisation sans remapping.
4. **Coexistence** : toutes les colonnes/tables V1 sont **conservées** pendant la migration (`parks.lat/lng/wc/...`, `communes`, `park_edit_history`, `*.commune_id`, `reviews.stars/flagged`, `reports.reason`…). Des triggers `*_v1_compat` synchronisent V1↔V2 (voir §9).
5. **Aucun `DROP TABLE` / `DROP COLUMN` / `DELETE` / `TRUNCATE`** dans `0007→0021`. Seuls `DROP` admis : `DROP FUNCTION nearby_parks` (0017, changement de type de retour, recréée immédiatement) ; `DROP TRIGGER IF EXISTS x` (chacun recréé aussitôt) ; `DROP POLICY` en 0020 sur `audit_log_read` / `parks_*` et en 0021 sur `reports_read` / `reports_update` / `reviews_update` (chacune **recréée aussitôt**, coexistence préservée).
6. **Le nettoyage legacy destructif = migration `0022+`** (`0020` réaffecté au fix runtime — Phase 5B.1 ; `0021` réaffecté au fix RLS restant — Phase 5C.1 ; les deux non destructifs). À écrire **seulement après cutover du front V2**. Contient tous les `DROP` de colonnes/tables/policies V1 (`communes` **et** `park_edit_history` incluses — cf. §14 audit legacy RLS 5C.1), `DROP` des triggers `*_v1_compat`, retour `park_public` à `p.*`. Destructif, irréversible.
7. **`recalculate_park_score`** : `SECURITY INVOKER` (pas DEFINER) → soumis à la policy `park_scores_write` (moindre privilège).
8. **`nearby_parks`** : stratégie `DROP + CREATE` retenue (auditée sûre) — pas de `nearby_parks_v2`.

---

## 6. Migrations 0007 → 0021

Toutes en `supabase/migrations/`. État `0007→0019` : **DRAFT → AUDITED (2C) → FIXED (2D) → TESTED (3B–3E)**. `0001→0019` appliquées sans erreur, toutes assertions `RAISE` passées, sur base locale V2 (seed) **et** sur fixture V1 réaliste (backfill). `0020` ajoutée en **Phase 5B.1** (corrections runtime coexistence, non destructif). `0021` ajoutée en **Phase 5C.1** (RLS restante de coexistence : `reports_*` + `reviews_update`, non destructif). `db reset` local `0001→0021` + seed = **PASS**.

| # | Fichier | Objectif | État | Dépend de | Points particuliers |
|---|---|---|---|---|---|
| 0007 | `0007_v2_enums_extensions.sql` | 18 enums v2 manquants ; `pg_trgm` ; `report_status += in_progress` | TESTED (SAFE) | — | `ALTER TYPE ADD VALUE` in-transaction : **confirmé OK** sur PG17 local (3B + 3D) |
| 0008 | `0008_v2_organizations.sql` | `organizations` + `organization_parks` ; backfill communes/6 relations | FIXED (SAFE) | 0007 | UUID communes préservés |
| 0009 | `0009_v2_parks_columns.sql` | +21 colonnes v2 sur `parks` ; `location` généré ; index ; trigger `parks_v1_compat` | FIXED (SAFE_WITH_NOTE) | 0007 | trigger **bidirectionnel** ; `country_code`/`timezone` NOT NULL **sans DEFAULT** ; INSERT V1 exige quand même ces 2 champs (voulu) |
| 0010 | `0010_v2_features.sql` | `features` + seed catalogue + `park_features` + backfill (règles §5) | FIXED (SAFE) | 0009 | assertions : 0 `unavalaible`, value domains, tout code play mappé ; 182 lignes attendues |
| 0011 | `0011_v2_media.sql` | `park_media` + backfill `parks.photos[]` (0 ligne) | FIXED (SAFE) | 0009 | requête générique sûre si array vide |
| 0012 | `0012_v2_park_details.sql` | 11 tables filles v2 (vides) ; FK différées `park_features.source_id`, `park_media.zone_id` ; `maintenance.zone_id/equipment_id` | FIXED (SAFE) | 0008, 0010, 0011 | assertion `c_rows=0` **retirée** → intégrité référentielle (portable staging) |
| 0013 | `0013_v2_reviews.sql` | +9 colonnes v2 sur `reviews` ; `rating NOT NULL` ; check ; trigger `reviews_v1_compat` | FIXED (SAFE) | 0007 | trigger **bidirectionnel** `rating↔stars`, `status↔flagged` |
| 0014 | `0014_v2_reports.sql` | +7 colonnes v2 sur `reports` ; `category NOT NULL` ; trigger `reports_v1_compat` | FIXED (SAFE) | 0007, 0012 | trigger **bidirectionnel** `category↔reason`, `equipment↔equipment_label`, `comment↔description` |
| 0015 | `0015_v2_audit.sql` | `audit_log` + backfill `park_edit_history` (0 ligne) | FIXED (SAFE) | — | perte connue : `actor` texte → `source` |
| 0016 | `0016_v2_organization_columns.sql` | `organization_id` sur team_members/maintenance/activity_log + FK + triggers | FIXED (SAFE) | 0008 | triggers `IS DISTINCT FROM` → `SET organization_id = NULL` possible en UPDATE ; backfill : 2 super_admin → NULL, gestionnaire → même UUID |
| 0017 | `0017_v2_functions.sql` | triggers recompute/audit ; `fstatus`/`fvalue` ; vue `park_public` ; `nearby_parks` v2 ; `find_duplicate_parks` ; `recalculate_park_score` | TESTED (SAFE) — **corrigé 3E** | 0008–0015 | `park_public` = **liste explicite** ; `has_score` = `coalesce(...,false)` ; `nearby_parks` DROP+CREATE ; `SET search_path` sur 5 SECDEF ; `recalculate_park_score` en INVOKER. **3E : `park_public.water` = `drinking_water` seul** (ne fusionne plus `water_play` — point d'eau ≠ jeux d'eau ; `water_play` reste exposé via `play_equipment`). `nearby_parks.water` hérite (lit la vue). |
| 0018 | `0018_v2_rls.sql` | helpers v2 (`org_role` priorisé) ; RLS + policies sur les 17 tables nouvelles ; faille `organization_parks` corrigée | FIXED (SAFE) | 0016, 0017 | `SET search_path` sur 8 helpers ; policies `organization_parks` séparées + trigger `organization_parks_guard` ; **ne touche PAS** les policies V1 de parks/reviews/reports (coexistence) |
| 0019 | `0019_v2_grants.sql` | `REVOKE ALL` + `GRANT` ciblé (Supabase grant-all par défaut) ; re-grant `nearby_parks` post-DROP | FIXED (SAFE) | 0017, 0018 | anon = lecture seule ; `audit_log` append-only ; `park_duplicate_candidates` lecture seule (écritures = `service_role`) |
| 0020 | `0020_fix_v2_runtime_compat.sql` | **corrections runtime coexistence (Phase 5B.1)** : D1 `link_team_member_on_signup` `SET search_path=''` + objets `public.*` qualifiés ; D2 `audit_log_read` → `entity_type='parks'` ; D3 `parks_update` (+ `can_edit_park()`, `USING`+`WITH CHECK`), `parks_public_read` + `parks_delete` alignées V2 | TESTED (SAFE) — Phase 5B.1 | 0018 | **NON DESTRUCTIF** : 0 `DROP TABLE/COLUMN`, 0 `DELETE/TRUNCATE`. Branche V1 `commune_id` **conservée** (coexistence, OR permissif). `parks_insert` inchangée. ⚠️ ce `0020` **n'est pas** le legacy cleanup du plan (§5 #6) → devient `0022+`. |
| 0021 | `0021_fix_remaining_v2_rls.sql` | **RLS restante de coexistence (Phase 5C.1)** : P5C-2 `reports_read` (+ `manages_park()`), `reports_update` (+ `organization_parks`/`is_org_gestionnaire`, `USING`+`WITH CHECK`) ; P5C-3 `reviews_update` (branche `user_id = auth.uid()` **retirée** — restriction, elle laissait l'auteur réécrire `reply*` ; + `organization_parks`/`is_org_gestionnaire`, `USING`+`WITH CHECK`) | TESTED (SAFE) — Phase 5C.1 | 0018, 0020 | **NON DESTRUCTIF** : 0 `DROP TABLE/COLUMN`, 0 `DELETE/TRUNCATE`. `DROP POLICY` × 3 chacune recréée aussitôt. Branche V1 `commune_id` **conservée** sur les 3. `reports_insert` / `reviews_insert` / `reviews_delete` inchangées. ⚠️ ce `0021` **n'est pas** le legacy cleanup du plan (§5 #6) → devient `0022+`. |

**`migrations-v2-draft/`** aussi corrigé en Phase 2D (cohérence du schéma cible) : `0002_functions.sql` (`search_path` sur 6 SECDEF + `delete_own_account` ; `recalculate_park_score` INVOKER ; `has_score` coalesce) et `0003_rls.sql` (faille `organization_parks` + `search_path` sur 8 helpers). **Phase 3E** : `0002_functions.sql` reçoit aussi le fix `park_public.water` (`drinking_water` seul).

---

## 7. Audits effectués

### Phase 1 (audit initial) + 1B (typage)
- Toute la persistance passe par `packages/shared/src/api/*` (+ 1 exception `apps/backoffice/src/lib/orgSession.ts`).
- `createClient<Database>` typé contre V1 → **110 erreurs** de typecheck, toutes catégorie **A** (code cible v2, DB est v1), 0 catégorie B, 0 C. Build mobile + backoffice échouent au `tsc -b`.
- APIs shared classées : GROUPE 1 (marche contre V1), GROUPE 2 (compat dégradée), **GROUPE 3** (cible v2, cassé) — dont tout `api/parks.ts` (lecture `park_public`), `api/parkDetails.ts`, `api/features.ts`, `api/contributions.ts`, `api/team.ts`, `api/maintenance.ts`.
- **eslint absent du repo** (aucune dépendance, aucun config) → `npm run lint` échoue (préexistant, catégorie B).
- **Décision** : faire évoluer la BASE vers v2, pas réécrire le front vers v1.

### Phase 2A — backup + inventaire
- `supabase db dump` **exige Docker** (indisponible) → backup CLI impossible sur cette machine.
- Inventaire fait via `supabase/inventory-pre-v2.sql` (SQL Editor, read-only) → résultats en §2.
- `.gitignore` : `backups/` ajouté.

### Phase 2B — génération des 13 migrations
- `0007→0019` créées (~2000 lignes). Non-destructives. Assertions `RAISE EXCEPTION` relatives (pas de count hardcodé).

### Phase 2C — audit statique
Problèmes trouvés :
- **FIX_REQUIRED** 0013 & 0014 : `SET NOT NULL` sur `rating`/`category` + triggers **unidirectionnels** → INSERT V1 brut impossible.
- 0012 : assertion « tables vides » testait une précondition externe (false-fail si ré-appliquée sur staging seedé).
- 0016 : triggers « fill if null » bidirectionnels → impossible de mettre `organization_id = NULL` en UPDATE.
- 0009 : trigger unidirectionnel ; `lat/lng/age_min/max` non resynchronisés en UPDATE.
- 14 fonctions `SECURITY DEFINER` sans `search_path`.
- **Faille `organization_parks_write`** : un gestionnaire d'org A pouvait rattacher n'importe quel parc (y compris d'org B) à A et gagner les droits dessus. (Présente aussi dans `migrations-v2-draft/0003`.)
- `recalculate_park_score` SECDEF + exécutable par tout `authenticated`.
- Sur-grants `audit_log` / `park_duplicate_candidates` (UPDATE/DELETE à authenticated).
- `park_public.has_score` pouvait être `NULL` (type attendu `boolean`).
- **Verdict Phase 2C : NOT_READY.**

### Phase 2D — corrections
Toutes les corrections ci-dessus appliquées (voir §6 + §8 + §9). Ré-audit :
- INSERT/UPDATE V1 & V2 sur parks / reviews / reports / team_members : **OK** (bidirectionnel).
- Isolation org A / org B : **tenue**. super_admin : **droits intacts**.
- `search_path` : pinné sur les 13 SECDEF.
- Grants : anon lecture seule, audit_log append-only, park_duplicate_candidates lecture seule.
- Scans interdits : `DROP TABLE/COLUMN/POLICY/TYPE = 0` ; `DELETE/TRUNCATE = 0` ; `DROP FUNCTION = 1` (nearby_parks, justifié) ; `DROP TRIGGER IF EXISTS = 21` (tous recréés).
- **Verdict Phase 2D : READY_FOR_LOCAL_TEST.**

---

## 8. Sécurité (état après Phase 2D)

### RLS `organizations`
- SELECT : `using(true)` (public — nécessaire au sélecteur d'org).
- INSERT : `is_toboggo_admin`. UPDATE : `is_toboggo_staff OR is_org_gestionnaire(id)`. DELETE : `is_toboggo_admin`.

### RLS `organization_parks` (faille corrigée)
- SELECT : `using(true)`.
- `organization_parks_staff_all` (FOR ALL) : staff Toboggo → gestion globale.
- `organization_parks_gest_insert` : gestionnaire de `organization_id` **ET** le parc n'a pas déjà un `owner` dans une **autre** organisation.
- `organization_parks_gest_update` : gestionnaire de `organization_id` (ancienne **et** nouvelle ligne).
- `organization_parks_gest_delete` : gestionnaire de `organization_id`.
- **Trigger `organization_parks_guard` (BEFORE UPDATE)** : un non-staff ne peut **jamais** changer `park_id` ni `organization_id` d'une relation existante → `RAISE EXCEPTION`.

### Isolation collectivités
- Édition des tables filles d'un parc (`park_features`, `park_zones`, `park_media`, …) : `can_edit_park(uid, park_id)` = `parks.created_by = uid OR manages_park(uid, park_id)`.
- `manages_park` = `EXISTS (organization_parks op JOIN team_members tm ON tm.organization_id = op.organization_id WHERE op.park_id = X AND tm.user_id = uid) OR is_toboggo_staff(uid)`.
- Un gestionnaire d'org A ne peut PAS éditer un parc d'org B (join `A = B` faux) et ne peut PAS s'attribuer le parc (voir `organization_parks` ci-dessus).

### super_admin Toboggo
- `team_members` avec `organization_id IS NULL` → `is_toboggo_staff` = true → `is_toboggo_admin` = true → `manages_park(*)` = true → **tous droits**. Le backfill 0016 les laisse à `organization_id = NULL` (car `commune_id` était NULL).

### SECURITY DEFINER / search_path
Toutes ces fonctions ont `SET search_path = public, pg_temp` (0017 + 0018) :
`recompute_park_rating`, `recompute_park_open_report`, `recompute_park_ages`, `audit_row`, `increment_park_views`, `is_toboggo_staff`, `is_toboggo_admin`, `org_role`, `is_org_member`, `is_org_gestionnaire`, `manages_park`, `can_edit_park`, `park_is_visible`.
`recalculate_park_score` : **SECURITY INVOKER** (pas DEFINER) + `search_path`.
`organization_parks_guard` : INVOKER + `search_path`.
> Références `auth.uid()` schéma-qualifiées → résolues hors search_path. Pré-existant non couvert : `link_team_member_on_signup` (V1) — a déjà `search_path` dans `migrations-v2-draft/0005` mais **pas dans la V1 déployée** ; à traiter au cutover.

### Grants sensibles (0019)
- `anon` : **SELECT seul** sur toutes les tables v2 + `park_public`. Aucun INSERT/UPDATE/DELETE/TRUNCATE (Supabase les accorde par défaut → `REVOKE ALL` explicite).
- `authenticated` : SELECT + INS/UPD/DEL sur les tables canoniques (RLS filtre ligne à ligne).
- `audit_log` : `authenticated` = **INSERT + SELECT** uniquement (append-only ; alimenté par `audit_row` SECDEF).
- `park_duplicate_candidates` : `authenticated` = **SELECT** uniquement (RLS = staff) ; écritures réservées à `service_role`.
- RPC : `nearby_parks`, `fstatus`, `fvalue`, `increment_park_views` → `anon` + `authenticated` ; `find_duplicate_parks`, `recalculate_park_score` → `authenticated` seul.

---

## 9. Compatibilité V1/V2 — triggers

Tous `BEFORE INSERT OR UPDATE`, `language plpgsql` (pas SECDEF), **sans boucle** (affectations sur `NEW` uniquement). Retirés au **0020**.

| Trigger (table) | Comportement |
|---|---|
| **`parks_v1_compat`** (parks) | INSERT : v2 canonique, comble V1 (`lat←latitude`, `lng←longitude`, `formatted_address←coalesce(address_line,city,name,'—')`, `age_min←nullif(age_min,0)`↔`min_age`, `status←moderation_status`). UPDATE : colonne modifiée gagne (`IS DISTINCT FROM`), synchronise sa contrepartie. **Ne touche PAS `country_code`/`timezone`.** |
| **`reviews_v1_compat`** (reviews) | `rating ↔ stars` (v2 canonique sur INSERT) ; `status ↔ flagged` (colonne modifiée gagne sur UPDATE ; INSERT V1 `flagged=true` + status au défaut → `status:='flagged'`). |
| **`reports_v1_compat`** (reports) | `category ↔ reason` (v2 canonique), `equipment ↔ equipment_label`, `comment ↔ description`. |
| **`team_members_v1_compat`** / **`maintenance_v1_compat`** / **`activity_log_v1_compat`** | `organization_id ↔ commune_id`. INSERT : comble le manquant. UPDATE : `IS DISTINCT FROM` → `SET organization_id = NULL` **n'est pas** réinjecté depuis `commune_id`. |

### Stratégie `nearby_parks`
`DROP FUNCTION nearby_parks(double precision, double precision, int)` + `CREATE` v2 dans **la même transaction** (0017). Justification auditée :
1. atomique — aucune fenêtre où la fonction manque pour d'autres connexions ;
2. **signature d'arguments identique** — aucun appelant à modifier ;
3. retour v2 = **superset** de la forme V1 (tous les champs lus par `fetchNearbyParks` présents) ;
4. un seul site d'appel (`packages/shared/src/api/parks.ts`, hook `useNearbyParks`).
GRANT ré-attribué en 0019 (le DROP l'avait supprimé).

---

## 10. INTERDICTIONS ACTUELLES

**INTERDIT**, tant que les étapes de test ne sont pas validées :

- ❌ `supabase db push --linked` vers la **production** (projet lié `dfzrsygetbhnjzfssgub`)
- ❌ `supabase db reset --linked`
- ❌ `supabase migration repair` sur la **production**
- ❌ toute application de `0007 → 0021` sur la **production**
- ❌ créer la migration **`0022+` de legacy cleanup destructif** (`0020` = fix runtime Phase 5B.1, `0021` = fix RLS restant Phase 5C.1, tous deux non destructifs — voir §14 ; le cleanup destructif reste conditionné au cutover)
- ❌ modifier rétroactivement `0001 → 0021` (figées)
- ❌ supprimer / altérer les colonnes ou tables V1
- ❌ modifier le schéma distant de production de quelque manière que ce soit
- ❌ committer un secret / token / mot de passe DB

**AUTORISÉ** :

- ✅ lecture seule sur la production distante : `supabase migration list --linked`, `supabase gen types typescript --linked`, SQL Editor `SELECT`
- ✅ édition locale des fichiers de migration **non encore figés** (`migrations-v2-draft/` ; un futur `0022+` uniquement)
- ✅ `supabase db reset` / application des migrations sur une base **LOCALE explicitement isolée** (Postgres local jetable)
- ✅ application des migrations sur un projet **STAGING jetable, explicitement séparé de la production**

---

## 11. CHECKPOINT ACTUEL

> **⚠️ Section critique — lire en premier, mettre à jour à chaque phase.**

```
DERNIÈRE PHASE :
  Phase 5C = CLOSED / PASS. Corrections 5C.1 (0021 + Parks.tsx + ParkModal.tsx
  + doc) commitées ET poussées : e0712f8 fix(backoffice): resolve v2 parks and
  rls issues. HEAD == origin/main == e0712f8. Working tree : seuls 3× icons-sprite
  + Toboggo-Brand-Guidelines.pdf modifiés (HORS chantier, NON stagés).
  READY_FOR_PHASE_5D = YES.

  Phase 5D EN COURS = PRÉPARATION AU CUTOVER (préparation seule) :
    - §11 checkpoint réconcilié (e0712f8 poussé ; Phase 5C close).
    - §15 PLAN DE ROLLBACK écrit (avant / échec pendant / front V2 KO /
      restauration DB / GO-NO-GO).
    - §16 PROCÉDURE STAGING JETABLE écrite (nouveau projet, jamais
      dfzrsygetbhnjzfssgub, garde-fous, preuve TARGET_DB=STAGING).
    - §17 AUDIT PRÉ-CUTOVER exécuté (0007→0021 présentes/ordonnées, 0022+
      absente, 0001→0021 == commits de validation, types V2, typecheck+builds
      PASS, aucune URL/clé trackée, scan destructif OK).
    - PROD_TOUCHED = NO. Aucun db push/reset/repair, aucun 0022, aucun commit.
    - Backup prod : PAS ENCORE LANCÉ (commande présentée §15.A / ÉTAPE 2).

PHASE 5A — PASS (brancher l'app sur Supabase local + smoke tests read-only)
  - mobile (5173) + backoffice (5175) : VITE_SUPABASE_URL = http://127.0.0.1:54321
    uniquement (vérifié dans le module servi par Vite + trafic réseau).
  - .env.local créé (racine, gitignored, non tracké) ; .env (prod) NON touché ;
    .env.local a priorité sur .env en dev.
  - PROD_GUARD = PASS : 0 requête vers dfzrsygetbhnjzfssgub.supabase.co.
  - smoke read-only : liste/carte, recherche, détail parc, amenities, photos,
    score, reviews = PASS ; park_public anon = 5 published (pending masqué) ;
    nearby_parks anon = PASS ; écriture anon refusée (401).

PHASE 5A.1 — PASS (réalignement local avant 5B)
  - supabase db reset (LOCAL, sans --linked) : 0001→0019 + seed = PASS.
  - park_public.water : définition LIVE == fix 3E
    (fstatus(id,'drinking_water')='available' SEUL, aucun OR water_play).
  - nearby_parks.water hérite de la vue.
  - dataset local : parks=6 / organizations=2 / park_features=35 / park_zones=4.
  - port 5174 : ancien vite backoffice fantôme arrêté proprement.

PHASE 5B — PARTIAL (tests fonctionnels d'écriture, sessions Auth réelles)
  MOBILE_WRITES = PASS · BACKOFFICE_WRITES = PARTIAL · DATA_INTEGRITY = PASS
  · TYPECHECK/BUILDS = PASS · V1_V2_COMPAT_TRIGGERS = PASS.
  5 défauts détectés :
  - D1 BLOCKER : link_team_member_on_signup() SECURITY DEFINER sans search_path
      → tout supabase.auth.signUp() renvoie 500
      (relation "team_members" does not exist, rôle supabase_auth_admin).
  - D2 IMPORTANT : audit_row() écrit entity_type='parks' mais la policy
      audit_log_read teste 'park' → gestionnaire ne lit jamais l'historique parc.
  - D3 IMPORTANT : parks_update / parks_public_read / parks_delete reposent sur
      parks.commune_id (NULL dans le seed V2) → gestionnaire V2 bloqué,
      UPDATE 0-ligne SILENCIEUX.
  - D4 MINOR (produit) : AddPark mappe un équipement non coché → 'unavailable'
      (le modèle permet unknown/available/unavailable).
  - D5 MINOR (fidélité seed) : table V1 `communes` vide → FK
      team_members/maintenance.commune_id non satisfiables sans INSERT manuel.

PHASE 5B.1 — PASS (corrections D1/D2/D3/D5)
  - Nouvelle migration NON DESTRUCTIVE : supabase/migrations/0020_fix_v2_runtime_compat.sql
    (0 DROP TABLE/COLUMN, 0 DELETE/TRUNCATE ; 0001→0019 inchangées). Voir §14.
  - D1 FIXED : link_team_member_on_signup() → SET search_path = '' + objets
    public.* qualifiés ; logique de liaison par e-mail inchangée. Vrai
    supabase.auth.signUp() testé (parent + 3 pré-invités) : session OK,
    profiles + team_members liés par trigger, signInWithOtp sans erreur DB.
  - D2 FIXED : audit_log_read teste maintenant entity_type = 'parks'.
    owner-read / cross-org-denied / parent-denied / super_admin-read = PASS.
  - D3 FIXED : parks_update reconnaît can_edit_park() (USING + WITH CHECK
    explicites) ; branche V1 commune_id conservée (coexistence, OR permissif) ;
    parks_public_read + parks_delete alignées V2 (parks_delete : gestionnaire
    d'une organisation propriétaire via organization_parks). parks_insert
    inchangée (CHECK auth.uid() IS NOT NULL, aucune dette). Matrice A/B testée
    avec sessions Auth réelles + COMPTAGE DE LIGNES (aucun 0-row silencieux
    pour un acteur autorisé).
  - D5 FIXED : seed.sql insère les 2 lignes `communes` miroir (id = organizations.id,
    type municipality). `communes` N'EST PAS canonique V2. Prouvé : après
    db reset, team_members/maintenance/*_v1_compat fonctionnent sans INSERT manuel.
  - D4 : NON corrigé — décision produit. ADDPARK_TRI_STATE_DECISION = OPEN.
  Tests : AUTH_RUNTIME=PASS · PARK_UPDATE_RLS=PASS · AUDIT_RLS=PASS ·
  V1_V2_COMPAT=PASS · DATA_INTEGRITY=PASS (0 orphelin, 0 faux 'unavailable',
  géo cohérente) · TYPECHECK=PASS · MOBILE_BUILD=PASS · BACKOFFICE_BUILD=PASS.
  READY_FOR_PHASE_5C = YES.

PHASE 5C — PARTIAL (tests fonctionnels backoffice + rôles multi-organisation,
                    sessions Auth réelles + navigation UI réelle ; voir §14)
  6 comptes créés via vrai auth/v1/signup (D1 confirmé, 0 signup 500) :
  super_admin + support (org NULL, staff) · gestA (Lyon) · gestB (Bordeaux) ·
  contribA (Lyon) · parent (aucun team_member).
  PASS : auth/login/routing (admin vs collectivité), dashboard + isolation A/B,
  maintenance (create/update/done/cross-org), audit_log (0020 D2 confirmé),
  team (list/invite/signup-link/cross-org), organization_parks guard,
  intégrité (0 orphelin, 0 multi-owner, 0 écart commune_id/organization_id),
  typecheck + builds.
  3 défauts :
  - P5C-1 BLOCKER : apps/backoffice/src/screens/Parks.tsx rend <ParkModal
      park={modalPark}> INCONDITIONNELLEMENT, modalPark initial null →
      ParkModal : existing=null, isNew=false → {!isNew && canManage && (
      existing!.status ... )} déréférence null au RENDU → TypeError, pas
      d'error boundary → écran blanc pour admin + gestionnaire (canManage=true).
      Contributeur non touché (canManage=false). BUG PRÉEXISTANT (commit initial
      5cb0260), pas une régression du chantier V2 ; exposé par la 1re navigation
      UI privilégiée. /map non touché (rend <ParkModal> conditionnellement).
  - P5C-2 IMPORTANT : policies reports_read / reports_update reposent sur
      parks.commune_id (colonne V1, NULL dans le modèle V2 canonique où la
      propriété passe par organization_parks). Gestionnaire d'une organisation
      propriétaire : voit 0 signalement (liste + dashboard faux "0") ; PATCH
      /reports → HTTP 200 [] = 0-ligne SILENCIEUX. Staff (is_toboggo_staff) OK.
      Même famille que D3, NON couverte par 0020 (qui n'a fait que parks_*).
  - P5C-3 IMPORTANT : reviews_update repose sur parks.commune_id → réponse d'un
      gestionnaire à un avis = PATCH 204 mais 0 ligne. Même dette.
  Contributions/park_edits : RLS/API V2 corrects (manages_park) mais AUCUNE UI
  back-office → BO_PARK_EDIT_ACTION = NOT_IMPLEMENTED. Team role update = idem.
  organization_parks : pas d'UI dédiée (implicite via createPark/updatePark).

PHASE 5C.1 — PASS (corrections P5C-1 / P5C-2 / P5C-3)
  AUDIT LEGACY RLS (LEGACY_RLS_AUDIT = PASS) — scan pg_policies LIVE de toute
  policy sur parks.commune_id / is_commune_member / is_commune_gestionnaire :
    CLASSE C (dette identique, à corriger) : reports_read, reports_update,
      reviews_update → corrigées en 0021.
    CLASSE B (OK) : parks_* (déjà 0020) ; maintenance_all / activity_read /
      team_* → filtrent sur le commune_id PROPRE de la ligne, tenu par les
      triggers *_v1_compat (testé PASS 5C + régression).
    CLASSE D (table morte / legacy, laissée au cleanup destructif 0022+) :
      park_edit_history.park_history_read (0 ligne, 0 trigger, 0 usage app —
      l'historique parc passe par audit_log, déjà corrigé 0020) ;
      communes.communes_write (l'app écrit organizations / organizations_update).
    EXTRA_POLICIES_FIXED = NONE (aucune autre dette démontrable en usage réel).

  P5C-1 FIXED — app uniquement, 0 modif DB :
  - apps/backoffice/src/screens/Parks.tsx : {modalPark && <ParkModal … />}
    (garde de rendu explicite, même schéma que MapScreen).
  - apps/backoffice/src/components/ParkModal.tsx : gardes {!isNew && …} →
    {existing && …} (2×) ; existing!.status → existing.status (3×) ;
    else → else if (existing) dans save(). Assertions `!` supprimées.
    Aucun try/catch global, aucun any/ts-ignore/ts-expect-error.
  - UI réelle (avant ET après db reset) : /parks + « Mes parcs » chargent pour
    super_admin / gestA / gestB ; modal ouvre/édite/enregistre/réouvre ;
    historique parc dans la modal (audit_log) rendu ; contributeur = lecture
    seule préservée (0 bouton Enregistrer/statut/suppression).
    BO_PARKS_SCREEN_ADMIN / BO_PARK_MODAL_ADMIN / BO_PARKS_SCREEN_GEST /
    BO_PARK_MODAL_GEST / BO_PARK_MODAL_CONTRIB_READONLY / BO_NO_REACT_CRASH = PASS.

  P5C-2 FIXED — 0021 :
  - reports_read : + manages_park(auth.uid(), park_id) (membre d'une org
    propriétaire OU staff). Branche V1 commune_id conservée.
  - reports_update : + exists(organization_parks op WHERE op.park_id=… AND
    is_org_gestionnaire(auth.uid(), op.organization_id)) ; USING + WITH CHECK
    explicites et identiques. Branches is_toboggo_admin + V1 commune_id conservées.
  - Tests sessions Auth réelles + comptage de lignes (état propre 0001→0021) :
    REPORT_OWNER_READ (gestA 1 / gestB 1 / contribA 1 / admin 2 / support 2 /
    parent 2 en tant que reporter) / REPORT_OWNER_UPDATE (gestA→Lyon rows=1,
    gestB→Bordeaux rows=1) / REPORT_CROSS_ORG_DENIED (gestA→Bordeaux rows=0,
    gestB→Lyon rows=0) / REPORT_STAFF_GLOBAL (admin rows=1 ; contributeur rows=0 ;
    parent rows=0 — pas de triage) = PASS. UI : gestA voit + rouvre + résout.

  P5C-3 FIXED — 0021 :
  - reviews_update : branche `user_id = auth.uid()` RETIRÉE (restriction, pas
    extension — elle laissait l'auteur réécrire sa propre ligne d'avis, colonnes
    reply* incluses ; aucun parcours applicatif ne l'utilise) ; + is_toboggo_staff
    + exists(organization_parks … is_org_gestionnaire) ; USING + WITH CHECK
    explicites. Branche V1 commune_id gestionnaire conservée. insert/delete inchangées.
  - Tests (état propre) : REVIEW_REPLY_OWNER (gestA rows=1) /
    REVIEW_REPLY_CROSS_ORG_DENIED (gestB rows=0) / REVIEW_REPLY_ADMIN (rows=1) /
    REVIEW_REPLY_PARENT_DENIED (parent — même sur son propre avis — rows=0 ;
    contributeur rows=0) = PASS. Readback reply/reply_by/reply_at OK. UI : gestA
    répond → « Réponse : … » affichée, persistée (fini le 204/0-row silencieux).
  - Observation hors périmètre : flagReview() (mobile — signalement d'un avis
    par un tiers) était DÉJÀ non fonctionnel sous la policy V1 (seul l'auteur
    passait). Comportement inchangé par 0021 → dette M5.

  RESET : supabase db reset (LOCAL, sans --linked) → 0001→0021 + seed = PASS.
    Fixtures recréées via vrais flux Auth (signup ×6 → 200, 5 team_members liés
    par trigger). Corrections re-vérifiées depuis état propre → toutes PASS.
  RÉGRESSION : AUTH / RLS_MULTI_ORG / MAINTENANCE / AUDIT / TEAM = PASS.
  TYPECHECK / BACKOFFICE_BUILD / MOBILE_BUILD = PASS ; 0 as any/ts-ignore ajouté.
  BACKOFFICE_PARKS / BACKOFFICE_REPORTS / BACKOFFICE_REVIEWS / BACKOFFICE_MULTI_ORG = PASS.
  PHASE_5C_1 = PASS. READY_FOR_PHASE_5D = YES.

VERDICT DB :
  BACKFILL_READY_FOR_PROD = YES

ÉTAT APPLICATION :
  TYPECHECK_V2     = PASS
  MOBILE_BUILD     = PASS
  BACKOFFICE_BUILD = PASS

PRODUCTION :
  toujours V1 — 0001→0006 uniquement.
  0007→0021 JAMAIS appliquées en production.

DETTE NON BLOQUANTE / OUVERTE :
  - createPark (packages/shared/src/api/parks.ts) conserve des fallbacks
    APPLICATIFS country_code="FR" / timezone="Europe/Paris" quand le caller
    ne les fournit pas. Ni DEFAULT de colonne ni trigger (conforme §5 #2),
    à revoir avant déploiement mondial. Confirmé UTILISÉ en 5B (AddPark ne
    passe pas ces champs).
  - D4 — ADDPARK_TRI_STATE_DECISION = OPEN. AddPark : équipement/amenity non
    coché → park_features.status='unavailable' (splitParkInput, parks.ts).
    Le modèle permet unknown / available / unavailable. Décision produit.
  - M1 — badges React Query du Shell back-office (pendingParks / openReports)
    utilisent des clés non invalidées par les mutations des modales →
    compteurs périmés jusqu'au rechargement. Cosmétique.
  - M2 — nav collectivité (Shell.tsx communeItems) non filtrée par rôle : un
    contributeur voit Entretien/Journal/Statistiques comme un gestionnaire ;
    les actions internes sont gardées SAUF l'entretien (maintenance_all =
    is_commune_member → contributeur peut créer/éditer/supprimer). À arbitrer
    produit.
  - M3 — [auth.rate_limit] email_sent = 2/h en local ⇒ >2 invitations/h
    échouent sur l'étape supabase.auth.signInWithOtp de inviteTeamMember.
    Config locale, non bloquant.
  - M4 — warning dev-only React « validateDOMNesting: <button> descendant de
    <button> » dans Parks.tsx (la ligne de liste est un <button> contenant des
    <Button>). Dev-only, absent du build prod.
  - M5 — flagReview() (mobile, « Avis signalé, merci ») : le signalement d'un
    avis PAR UN TIERS est non fonctionnel sous reviews_update (RLS V1 puis 0021 :
    seuls auteur→retiré / gestionnaire org / staff passent). Rows=0 silencieux
    côté mobile. À traiter séparément (policy dédiée ou flux modération).
  NE PAS corriger D4 ni M1–M5 maintenant.

PROCHAINE PHASE :
  Fin de Phase 5D (préparation) → décision du fondateur : (a) créer le staging
  jetable et rejouer 0001→0021 dessus (§16), et/ou (b) lancer le backup prod
  (§15.A), et/ou (c) planifier la fenêtre de maintenance + db push --linked.
  AUCUNE de ces actions n'est faite tant que le fondateur ne l'a pas demandée.
  Prod jamais touchée en 5D.

ÉTAT GIT :
  DÉJÀ COMMITÉ ET POUSSÉ sur origin/main (HEAD == origin/main == e0712f8) :
  - e0712f8 fix(backoffice): resolve v2 parks and rls issues    (Phase 5C.1 —
      0021_fix_remaining_v2_rls.sql + ParkModal.tsx + Parks.tsx + doc)
  - b530265 fix(db): resolve v2 runtime compatibility issues    (Phase 5B.1 —
      0020_fix_v2_runtime_compat.sql + seed.sql + doc)
  - f270275 docs(db): checkpoint phase 4
  - ca18c71 fix(shared): align APIs with Supabase v2 types      (Phase 4B)
  - 1f0510e chore(types): switch Supabase types to v2 schema    (Phase 4A)
  - 9b13047 fix(db): validate v1 to v2 backfill                 (Phases 3B→3E)

  NON COMMITÉ — produit par Phase 5D (préparation cutover), à commiter sur
  instruction du fondateur :
  - docs/architecture/database-migration.md   (ce checkpoint + §15 rollback
      + §16 staging + §17 audit pré-cutover)

  NON COMMITÉ, hors chantier DB — NE PAS toucher, NE PAS stager :
  - apps/backoffice/public/icons-sprite.svg
  - apps/mobile/public/icons-sprite.svg
  - packages/design-system/src/icons/icons-sprite.svg
  - docs/Toboggo-Brand-Guidelines.pdf (non tracé)
    modifs de branding hors chantier DB, NON produites par ce chantier.

  LOCAL, hors Git : .env.local (racine, gitignored — URL locale + clé anon
  LOCALE), scripts de test 5B→5C.1 (scratchpad de session), données de test
  dans la base locale (reset 0001→0021 en 5C.1, fixtures recréées).

FICHIERS À LIRE (dans l'ordre) :
  1. docs/architecture/database-migration.md  (ce fichier — §13 Phase 3, §14 Phase 5)
  2. supabase/migrations/0007_v2_*.sql → 0019_v2_*.sql + 0020_fix_v2_runtime_compat.sql
     + 0021_fix_remaining_v2_rls.sql
  3. supabase/migrations/0001_init.sql → 0006_admin_user_moderation.sql (V1 déployé)
  4. supabase/migrations-v2-draft/0001_schema.sql → 0005_fix_signup_trigger.sql (cible de référence)
  5. supabase/inventory-pre-v2.sql  (+ résultats en §2 de ce doc)
  6. packages/shared/src/types/database.types.ts (schéma V2 local, commité 1f0510e)
  7. packages/shared/src/api/*.ts + packages/shared/src/types.ts (aligné V2 — commit ca18c71)

COMMANDES AUTORISÉES :
  - supabase migration list --linked            (read-only, prod)
  - supabase gen types typescript --linked ...   (read-only, prod)
  - SQL Editor : SELECT uniquement
  - npm run typecheck / npm run build            (local)
  - npm run dev:mobile / npm run dev:backoffice  (local, contre .env.local)
  - supabase gen types typescript --local        (base locale)
  - édition de migrations-v2-draft/ et d'un futur 0022+ uniquement (0001→0021 figées)
  - git add / git commit / git push
  - sur une base LOCALE explicitement isolée : supabase db reset / db push / psql
    (dont : CREATE DATABASE jetable + apply migrations + DROP DATABASE — harnais 3D)
  - création LOCALE d'utilisateurs de test fictifs via supabase.auth.signUp()
    ou l'API admin auth (jamais de compte réel)
  - sur un projet STAGING jetable explicitement séparé de la prod : idem

COMMANDES INTERDITES (voir §10) :
  - supabase db push --linked vers la production
  - supabase db reset --linked
  - supabase migration repair sur la production
  - toute application de 0007→0021 sur la production
  - toute écriture sur le schéma distant de production
  - modification rétroactive de 0001→0021 (figées)
  - création de la migration 0022+ de legacy cleanup destructif
    (0020 = fix runtime 5B.1, 0021 = fix RLS 5C.1, non destructifs)
```

---

## 12. Roadmap restante

- [x] Phase 2D corrections
- [x] nouvel audit statique (Phase 2D → READY_FOR_LOCAL_TEST)
- [x] **test migrations sur DB locale** (0001→0019 + seed V2) — Phase 3B
- [x] assertions post-migration (toutes les `RAISE EXCEPTION` passent) — 3B (seed V2) + 3D (fixture V1)
- [x] génération `database.types.ts` **V2** (`gen types --local`) — Phase 3C
- [x] typecheck frontend : ~110 → **10** erreurs (toutes dans `shared/src/api/*`) — Phase 3C
- [x] **test réel du backfill V1→V2** sur fixture des 17 parcs réels — Phase 3D ; 1 fix (`park_public.water`) — Phase 3E ; **31/31 checks PASS**
- [x] **Phase 4A** — checkpoint types V2 : fix Phase 3E confirmé commité (`9b13047`) ; `database.types.ts` V2 re-vérifié contre le schéma local V2 validé ; commité `1f0510e`
- [x] **Phase 4B** — 10 erreurs `shared/src/api/*` → **0** ; `typecheck` + `build:mobile` + `build:backoffice` PASS ; commité `ca18c71`. Dette non bloquante : fallbacks applicatifs `country_code="FR"` / `timezone="Europe/Paris"` dans `createPark` (à revoir avant déploiement mondial)
- [x] **Phase 5A / 5A.1** — app branchée sur Supabase local uniquement (`.env.local`), smoke tests read-only PASS, prod guard PASS ; `db reset` local, fix 3E `park_public.water` live, dataset réaligné. Voir §14.
- [x] **Phase 5B** — tests fonctionnels d'écriture (sessions Auth réelles) : mobile PASS, backoffice PARTIAL, intégrité PASS. 5 défauts D1–D5. Voir §14.
- [x] **Phase 5B.1** — corrections D1/D2/D3/D5 via `0020_fix_v2_runtime_compat.sql` (non destructif) + `seed.sql` ; rejeu des tests = PASS ; `READY_FOR_PHASE_5C = YES`. D4 laissé ouvert (décision produit). Voir §14. Commité `b530265`.
- [x] **Phase 5C** — tests fonctionnels backoffice + rôles multi-organisation (sessions Auth réelles + navigation UI réelle) contre Supabase local V2 (`0001→0021` + seed). PARTIAL : auth/routing/dashboard/maintenance/audit/team/org_parks/intégrité = PASS ; 3 défauts P5C-1 (BLOCKER — ParkModal null crash) / P5C-2 / P5C-3 (IMPORTANT — RLS `reports_*`/`reviews_update` sur `parks.commune_id`). Voir §14.
- [x] **Phase 5C.1** — P5C-1 corrigé côté app (`Parks.tsx` + `ParkModal.tsx`) ; P5C-2/P5C-3 corrigés via `0021_fix_remaining_v2_rls.sql` (non destructif) ; `LEGACY_RLS_AUDIT = PASS` ; `db reset` `0001→0021` + seed = PASS ; corrections re-vérifiées (rows + UI) ; régression + typecheck + builds = PASS. `PHASE_5C_1 = PASS` · `READY_FOR_PHASE_5D = YES`. Dettes M1–M5 documentées, non corrigées. Voir §14.
- [x] **Phase 5C.2** — checkpoint + commit des 4 fichiers du chantier 5C.1. Commité + poussé : `e0712f8 fix(backoffice): resolve v2 parks and rls issues`. `HEAD == origin/main`. Phase 5C = CLOSED / PASS.
- [~] **Phase 5D — préparation au cutover** (préparation seule, prod jamais touchée) : checkpoint réconcilié ; **§15 plan de rollback** ; **§16 procédure staging jetable** ; **§17 audit pré-cutover** (PASS). Docker redevenu disponible → `supabase db dump --linked` viable (commande présentée §15.A, PAS lancée). `PROD_TOUCHED = NO`.
- [ ] backup production (`supabase db dump --linked` — schema + `--data-only` + `--role-only` ; voir §15.A) — **présenté, non lancé**
- [ ] (option) staging jetable : nouveau projet, `0001→0021` + seed synthétique, rejeu de l'audit (§16) — **présenté, non créé**
- [ ] migration production (`db push` du projet lié, fenêtre de maintenance) — checklist GO/NO-GO en §15.E
- [ ] validation production (parcours critiques + assertions)
- [ ] période de coexistence (front v2 déployé, colonnes V1 encore là)
- [ ] cutover (front v2 = seul en prod)
- [ ] **seulement ensuite** : migration **`0022+`** — legacy cleanup destructif (DROP colonnes/tables/policies V1 — `communes` + `park_edit_history` incluses, DROP triggers `*_v1_compat`, retour `park_public` à `p.*`, DROP enums V1 obsolètes). ⚠️ les numéros `0020` (fix runtime 5B.1) et `0021` (fix RLS restant 5C.1) sont pris par des migrations non destructives.

---

## 13. Phase 3 — validation locale (3B → 3E)

Tout en **local** (Docker Supabase, PG17). Prod jamais touchée, aucun `--linked` en écriture.

### 3B — Stack locale + application des migrations
- `supabase start` : PG 17.6, GoTrue, PostgREST, Storage, Realtime, Studio — tous `healthy`.
- `0001→0019` + `seed.sql` appliqués automatiquement au démarrage (base neuve). **Aucune erreur.**
- `ALTER TYPE … ADD VALUE` in-transaction (0007) : confirmé OK sur PG17.

### 3C — Validation post-migration (seed V2) + types + typecheck
- 19 migrations tracées, 17 tables v2, vue `park_public`, 15 fonctions v2, RLS active sur les 17 tables. **PASS.**
- **RLS testée par SQL** (SET ROLE + jwt claims) : anon (lecture published/`park_public` OK ; INSERT/UPDATE/DELETE `park_features` + `audit_log` refusés), authenticated standard (ne peut pas éditer un parc non géré), gestionnaire org A (gère A, pas B, ne peut pas s'attribuer un parc de B), super_admin (droits globaux), `audit_log` append-only. **13/13 PASS.**
- `supabase gen types typescript --local` → types V2. Comparés à la V1 : +17 tables, +1 vue, +18 enums, `report_status += in_progress`, `nearby_parks` élargi.
- Bascule `packages/shared/src/types/database.types.ts` → V2 (non commité). `npm run typecheck` : **~110 → 10 erreurs**, toutes dans `packages/shared/src/api/*` ; **0 erreur propre** mobile/backoffice. Builds bloqués au gate `tsc -b` par ces 10 (donc `vite build` non atteint).

#### Les 10 erreurs restantes (entrée Phase 4) — **toutes résolues en Phase 4B (`ca18c71`)**
> Résolution : cast étroit au point d'appel `.insert()` pour le Groupe B (colonnes legacy laissées aux triggers `*_v1_compat`, **pas** de `SET DEFAULT`), types générés (`TablesInsert`/`TablesUpdate`/`NearbyParkRow`/`feature_status`) pour C et D. Détail en table « Historique des mises à jour » ligne 4B.

| Fichier:ligne | Cause |
|---|---|
| `api/contributions.ts:21,83` | `changes: Record<string,unknown>` ⇏ `Json` ; nullabilité |
| `api/maintenance.ts:39,48` | `toRow()` non typé (`Record<string,unknown>`) ; `commune_id` V1 requis |
| `api/parks.ts:35` | `nearby_parks` (projection) casté en `Park` complet |
| `api/parks.ts:166` | `park_features.status: string` ⇏ `feature_status` |
| `api/parks.ts:176,193` | `splitParkInput()` non typé ; colonnes V1+V2 NOT NULL sans DEFAULT |
| `api/reports.ts:73` | `reason` (V1 NOT NULL) requis par le type `Insert` |
| `api/reviews.ts:108` | `stars` (V1 NOT NULL) requis par le type `Insert` |

Classement : **A (code encore V1) = 0** · **B (coexistence : V1 NOT NULL sans DEFAULT, trigger remplit au runtime mais typegen l'ignore) ≈ 4** · **C (types/helpers manuels `shared`) ≈ 6** · **D (forme RPC `nearby_parks`) = 1**. Aucune n'exige de retoucher migrations ni RLS ; décision Groupe B : `SET DEFAULT` sur 4 colonnes V1 **ou** cast côté API.

### 3D — Test réel du backfill V1→V2
- Fixture V1 **synthétique mais fidèle** aux agrégats des 17 parcs réels (§2) : 17 parcs, 2 communes, 3 team_members (2 super_admin sans commune + 1 gestionnaire), 4 profiles, 1 favorite. UUID/noms/emails fictifs (générateur : scratchpad, hors Git).
- Base locale isolée (`CREATE DATABASE` jetable) : bootstrap `auth`/`storage` minimal → `0001→0006` → fixture → snapshot `baseline` → `0007→0019`. Toutes assertions `RAISE` passées.
- **Backfill vérifié parc par parc** : identité (17/17, 0 perte, 0 doublon, 0 orphelin), géo (`lat/lng→latitude/longitude`, `location` généré), âges, statut, adresse, surface (`gazon→grass`, `sable→sand`, `sol_souple→rubber`, `non_precise→unknown`), booléens (**`true→available`, `false→unknown`, JAMAIS `unavailable`**), `shade→partial|∅`, `fence→partially_fenced|∅`, 10/10 codes `play_equipment` → feature v2 attendue, `park_features` = 182 exact, `communes→organizations` (id préservés), `organization_parks` (6 owner, 11 parcs org-less OK), `team_members` (rôles, staff→org NULL, gestionnaire→org=commune), `favorites` intacts.
- **1 seul défaut** : `park_public.water` = `drinking_water OR water_play` → 2 parcs avec jeux d'eau mais sans point d'eau affichés `water=true` (faux positif dans la vue de compat ; donnée canonique `park_features` correcte).

### 3E — Correction `park_public.water`
- `supabase/migrations/0017_v2_functions.sql` **et** `supabase/migrations-v2-draft/0002_functions.sql` : `water` = `fstatus(p.id,'drinking_water')='available'` seul.
- `water_play` reste exposé via `park_public.play_equipment` (`'waterplay'`) et la feature `water_play`.
- Harnais 3D rejoué : **31/31 checks PASS** ; `park_public.water` == V1 `water` 17/17 ; `nearby_parks.water` hérite (0 divergence) ; `0001→0019` toujours OK.
- **`BACKFILL_READY_FOR_PROD = YES`.**

---

## 14. Phase 5 — tests fonctionnels contre Supabase local V2

Tout en **local** (Docker Supabase, PG17), `.env.local` → `http://127.0.0.1:54321`.
Prod jamais touchée, aucun `--linked`.

### 5A — Brancher l'app + smoke tests read-only  → **PASS**
- `.env.local` créé à la racine (Vite `envDir` = racine du monorepo) : `VITE_SUPABASE_URL=http://127.0.0.1:54321` + clé anon **LOCALE**. `.env` (prod) **non modifié** ; `.env.local` gitignored (`.gitignore:4`), non tracké, prioritaire sur `.env` en dev.
- **PROD_GUARD** : `import.meta.env` inliné par Vite dans le module servi = `http://127.0.0.1:54321` (mobile 5173 **et** backoffice 5175) ; trafic réseau 100 % local ; **0 requête** vers `dfzrsygetbhnjzfssgub.supabase.co`.
- Smoke read-only mobile : carte/liste (`nearby_parks`), recherche (`park_public` ilike), détail parc, amenities, photos (vide), score, reviews (vide) = **PASS**, 0 erreur console.
- Backoffice : démarre, login screen, `/parks` redirige vers login (routing guard OK).
- API anon directe : `park_public` = **5 published** (parc `pending` masqué) ; `nearby_parks` répond (signature `p_lat,p_lng,p_radius_m`) ; écriture anon `park_features`/`parks` → **401**.

### 5A.1 — Réalignement local  → **PASS**
- `supabase db reset` (LOCAL) : `0001→0019` + `seed` = **PASS**.
- `park_public.water` LIVE == fix 3E : `fstatus(id,'drinking_water')='available'` **seul** (aucun `OR water_play`). `nearby_parks` lit `v.water` de la vue.
- Dataset : `parks=6` / `organizations=2` / `park_features=35` / `park_zones=4`.
- Port `5174` : ancien serveur Vite backoffice fantôme (session antérieure) arrêté proprement.

### 5B — Tests fonctionnels d'écriture (sessions Auth réelles)  → **PARTIAL**
Chemins testés en répliquant fidèlement les payloads de `packages/shared/src/api/*` + des écrans mobile (`AddPark` / `RatePark` / `ReportProblem`), via des sessions `signInWithPassword` réelles.

| Domaine | Résultat |
|---|---|
| `createPark` + `parks_v1_compat` (lat/lng, formatted_address, âges, status miroir) | PASS |
| `applyFeatures` (`park_features` upsert) | PASS |
| `createReview` + `reviews_v1_compat` (`stars`←`rating`), recompute rating/count | PASS |
| `createReport` + `reports_v1_compat` (`reason`←`category`, equipment/comment) | PASS |
| `createMaintenance` / `updateMaintenance` + `maintenance_v1_compat` (`commune_id`←`organization_id`) | PASS |
| `submitParkEdit` (`park_edits`, `changes` jsonb), `findDuplicateParks` | PASS |
| RLS isolation A/B, `organization_parks_guard`, super_admin, parent-deny | PASS |
| Intégrité référentielle / sémantique features / géo | PASS (0 orphelin, 0 faux `unavailable`) |
| typecheck / build:mobile / build:backoffice | PASS |

**5 défauts** (voir §11 CHECKPOINT pour le détail) :
- **D1 BLOCKER** — `link_team_member_on_signup()` SECURITY DEFINER sans `search_path` → **tout `supabase.auth.signUp()` renvoie 500** (`relation "team_members" does not exist` ; rôle GoTrue `supabase_auth_admin` en search_path `auth`). Déjà pré-identifié §8 (« à traiter au cutover »). Contourné en 5B par création SQL directe des users.
- **D2 IMPORTANT** — `audit_row()` écrit `entity_type = 'parks'` ; `audit_log_read` teste `'park'` → gestionnaire ne lit jamais l'historique de son parc (fail-closed, pas de fuite).
- **D3 IMPORTANT** — `parks_update` / `parks_public_read` / `parks_delete` reposent sur `parks.commune_id` (NULL dans le seed V2 ; propriété via `organization_parks`) → gestionnaire V2 bloqué, **`UPDATE` 0 ligne silencieux**. `park_features` (policy V2 `can_edit_park`) non affecté.
- **D4 MINOR (produit)** — `AddPark` : équipement/amenity non coché → `park_features.status='unavailable'` (le modèle permet `unknown`). `ADDPARK_TRI_STATE_DECISION = OPEN`.
- **D5 MINOR (fidélité seed)** — table V1 `communes` vide → FK `team_members`/`maintenance.commune_id → communes.id` non satisfiables sans INSERT manuel.

### 5B.1 — Corrections D1/D2/D3/D5  → **PASS**

**`supabase/migrations/0020_fix_v2_runtime_compat.sql`** (NON DESTRUCTIF — 0 `DROP TABLE/COLUMN`, 0 `DELETE/TRUNCATE`, 0 changement de forme ; `0001→0019` inchangées). ⚠️ **le numéro `0020` du plan (legacy cleanup destructif) est réaffecté ; le cleanup devient `0021+`, toujours interdit.**

- **D1** : `create or replace function public.link_team_member_on_signup()` `SET search_path = ''` + `public.team_members` / `public.profiles` qualifiés. Liaison par e-mail **inchangée**. Trigger `on_auth_user_created` conservé (référence par nom).
  Test **vrai `supabase.auth.signUp()`** (parent + gestA + gestB + superadmin pré-invités) : session retournée, `profiles` (4) auto-créés, `team_members` (3) liés par trigger (`user_id` + `commune_id`=`organization_id`), `signInWithOtp` sans erreur DB. `AUTH_SIGNUP_PARENT` / `AUTH_SIGNUP_TEAM_MEMBER` / `AUTH_PROFILE_TRIGGER` / `AUTH_TEAM_LINK_TRIGGER` / `AUTH_OTP_PATH` = **PASS**.
- **D2** : `drop policy` + `create policy audit_log_read` avec `entity_type = 'parks'`.
  `AUDIT_OWNER_READ` (gestA lit l'audit de son parc) / `AUDIT_CROSS_ORG_DENIED` / `AUDIT_PARENT_DENIED` / `AUDIT_SUPER_ADMIN_READ` = **PASS**.
- **D3** : `parks_update` reconnaît `can_edit_park(auth.uid(), id)` (`USING` **et** `WITH CHECK` explicites) ; branche V1 `commune_id` **conservée** (coexistence, OR permissif). `parks_public_read` + `parks_delete` alignées V2 (`parks_delete` : gestionnaire d'une organisation propriétaire via `organization_parks` + `is_org_gestionnaire`). `parks_insert` **inchangée** (`CHECK auth.uid() IS NOT NULL`, aucune dette).
  Matrice testée avec **comptage de lignes** : gestA→parc A `rows=1`, gestA→parc B `rows=0`, gestB→parc B `rows=1`, gestB→parc A `rows=0`, parent→parc géré `rows=0` (contrôle : parent→son parc créé `rows=1`), super_admin→A+B `rows=1`. **Aucun `UPDATE` 0-ligne silencieux pour un acteur autorisé.** `PARK_UPDATE_ORG_A` / `ORG_B` / `CROSS_ORG_DENIED` / `PARENT_DENIED` / `SUPER_ADMIN` = **PASS**.
- **D5** : `seed.sql` (+11 lignes) insère les 2 lignes `communes` miroir (`id` = `organizations.id`, `type` municipality). **`communes` n'est pas canonique V2** ; le seed la garde seulement alignée sur les organisations issues de l'ancien modèle commune. Prouvé : après `db reset`, `team_members` / `maintenance` / triggers `*_v1_compat` fonctionnent **sans INSERT manuel**.
- **D4** : **non corrigé** — `ADDPARK_TRI_STATE_DECISION = OPEN`. Ne bloque pas la Phase 5C.

Reset complet `0001→0020` + `seed` = **PASS** ; définitions LIVE == fichiers vérifiées. Régressions 5B rejouées (v1_compat parks/reviews/reports/maintenance, `organization_parks_guard`, cross-org `park_features`, intégrité) = **PASS**. `typecheck` / `build:mobile` / `build:backoffice` = **PASS**.

`READY_FOR_PHASE_5C = YES`.

### 5C — Tests fonctionnels backoffice + rôles multi-organisation  → **PARTIAL**

Sessions Auth réelles (`auth/v1/signup` — **D1 confirmé, 0 signup 500**) + navigation UI réelle du back-office + matrice REST authentifiée avec **comptage de lignes**. 6 comptes : `super_admin` + `support` (org NULL — staff), `gestA` (Lyon), `gestB` (Bordeaux), `contribA` (Lyon), `parent` (aucun `team_member`).

| Domaine | Résultat |
|---|---|
| Login + routing (admin vs collectivité, scope, pas de sélecteur cross-org) | PASS |
| Dashboard + isolation A/B (gestB ne voit aucune donnée Lyon) | PASS |
| Parcs / « Mes parcs » (écran + modale) | **FAIL (UI)** — P5C-1 |
| Édition parc / features (couche RLS/API) | PASS (`parks_update` 0020 OK, cross-org rows=0, `park_features_write` = `can_edit_park`) |
| Signalements (gestionnaire) | **FAIL** — P5C-2 (0 signalement visible, `PATCH` 0-ligne silencieux) ; admin/support PASS |
| Avis — réponse gestionnaire | **FAIL** — P5C-3 (`PATCH` 204, 0 ligne) ; admin PASS |
| Maintenance (create/update/done/cross-org, `commune_id`=`organization_id`) | PASS |
| Audit / historique parc (`audit_log`, 0020 D2) | PASS (gestA 2 / gestB 0 / admin 2 / parent 0) — mais surface UI dans `ParkModal`, inatteignable admin/gest tant que P5C-1 non corrigé |
| Équipe / invitations (list / invite / signup-link / cross-org) | PASS ; role update = **NOT_IMPLEMENTED** (UI) |
| Contributions / `park_edits` | RLS/API V2 corrects (`manages_park`, cross-org rows=0) ; **aucune UI back-office** → actions NOT_IMPLEMENTED |
| `organization_parks` (claim / steal / guard) | PASS (API) ; pas d'UI dédiée |
| Intégrité (0 orphelin, 0 multi-owner, 0 écart `commune_id`/`organization_id`, feature_status propre, géo complète) | PASS |
| typecheck / build:mobile / build:backoffice | PASS |

**3 défauts :**
- **P5C-1 BLOCKER** — `apps/backoffice/src/screens/Parks.tsx:174` rend `<ParkModal park={modalPark}>` **inconditionnellement**, `modalPark` initial `null`. Dans `ParkModal` : `park=null` ⇒ `isNew=false` ⇒ `existing=null` ⇒ le bloc `{!isNew && canManage && ( … existing!.status … )}` (lignes ~188/198/203) déréférence `null` **au rendu** (l'assertion `existing!` masque l'erreur à `tsc`) → `TypeError`, pas d'error boundary → **écran blanc pour `admin` + `gestionnaire`** (`canManage=true`). `contributeur` non touché (`canManage=false`). **Bug PRÉEXISTANT** (commit initial `5cb0260`), pas une régression du chantier V2 — exposé par la 1re navigation UI en tant qu'utilisateur privilégié. `/map` non touché (rend `<ParkModal>` conditionnellement).
- **P5C-2 IMPORTANT** — `reports_read` / `reports_update` (`0002_rls.sql`) reposent sur `parks.commune_id` (colonne V1, `NULL` dans le modèle V2 canonique — propriété via `organization_parks`). Gestionnaire d'une organisation propriétaire : **voit 0 signalement** (liste + dashboard faux « 0 ») ; `PATCH /reports` → HTTP 200 `[]` = **0-ligne silencieux**. `is_toboggo_staff` non affecté. Même famille que **D3**, NON couverte par `0020` (qui n'a fait que `parks_*`).
- **P5C-3 IMPORTANT** — `reviews_update` (`0002_rls.sql`) repose sur `parks.commune_id` → réponse d'un gestionnaire à un avis = `PATCH` 204 mais **0 ligne**. Même dette.

Mineurs relevés (non corrigés — voir §11) : **M1** badges React Query périmés · **M2** nav contributeur non filtrée + `maintenance_all` ouvert au contributeur · **M3** rate-limit OTP local · **M4** `validateDOMNesting` `<button>/<button>` dans `Parks.tsx` (dev-only) · **M5** `flagReview()` par un tiers non fonctionnel sous RLS.

### 5C.1 — Corrections P5C-1 / P5C-2 / P5C-3  → **PASS**

**Audit legacy RLS (`LEGACY_RLS_AUDIT = PASS`)** — scan `pg_policies` LIVE de toute policy sur `parks.commune_id` / `is_commune_member` / `is_commune_gestionnaire` (14 policies) :

| Policy(s) | Classe | Décision |
|---|---|---|
| `reports_read`, `reports_update`, `reviews_update` | **C** (dette identique P5C-2/P5C-3) | corrigées en `0021` |
| `parks_public_read` / `parks_update` / `parks_delete` | **B** | déjà branche V2 en `0020` |
| `maintenance_all`, `activity_read`, `team_read/write/update/delete` | **B** | filtrent sur le `commune_id` **propre** de la ligne, tenu par les triggers `*_v1_compat` (testé PASS 5C + régression) |
| `park_edit_history.park_history_read` | **D** | **table morte** en V2 (0 ligne, 0 trigger, 0 usage app — l'historique parc passe par `audit_log`, déjà corrigé 0020) → cleanup destructif `0022+` |
| `communes.communes_write` | **D** | **table legacy** (l'app écrit `organizations` / `organizations_update`) → cleanup destructif `0022+` |

`EXTRA_POLICIES_FIXED = NONE` (aucune autre dette démontrable en usage réel).

**P5C-1 — app uniquement, 0 modif DB :**
- `apps/backoffice/src/screens/Parks.tsx` : `<ParkModal … />` → `{modalPark && <ParkModal … />}` (garde de rendu explicite, même schéma que `MapScreen`).
- `apps/backoffice/src/components/ParkModal.tsx` : `{!isNew && …}` → `{existing && …}` (bloc historique + bloc actions statut) ; `existing!.status` → `existing.status` (3×) ; `else` → `else if (existing)` dans `save()`. Assertions `!` supprimées. Aucun `try/catch` global, aucun `any` / `@ts-ignore` / `@ts-expect-error`.
- **UI réelle (avant ET après `db reset`)** : `/parks` + « Mes parcs » chargent pour `super_admin` / `gestA` / `gestB` ; modale ouvre → édite → enregistre (persisté) → réouvre ; historique parc (`audit_log`) rendu dans la modale ; contributeur = **lecture seule préservée** (tous les inputs `disabled`, 0 bouton Enregistrer/statut/suppression). `BO_PARKS_SCREEN_ADMIN` / `BO_PARK_MODAL_ADMIN` / `BO_PARKS_SCREEN_GEST` / `BO_PARK_MODAL_GEST` / `BO_PARK_MODAL_CONTRIB_READONLY` / `BO_NO_REACT_CRASH` = **PASS**.

**`supabase/migrations/0021_fix_remaining_v2_rls.sql`** (NON DESTRUCTIF — 0 `DROP TABLE/COLUMN`, 0 `DELETE/TRUNCATE` ; `DROP POLICY` × 3 chacune recréée aussitôt ; `0001→0020` inchangées). Principe identique à `0020` : **AJOUTER une branche V2 en `OR`, sans retirer la branche V1** `commune_id`.

- **P5C-2** : `reports_read` += `manages_park(auth.uid(), park_id)` (membre d'une org propriétaire **OU** staff). `reports_update` += `exists(organization_parks op WHERE op.park_id = reports.park_id AND is_org_gestionnaire(auth.uid(), op.organization_id))` ; `USING` + `WITH CHECK` explicites et identiques ; branches `is_toboggo_admin` + V1 `commune_id` gestionnaire conservées.
  Tests état propre `0001→0021` : `REPORT_OWNER_READ` (gestA 1 / gestB 1 / contribA 1 / admin 2 / support 2 / parent 2 en tant que reporter) · `REPORT_OWNER_UPDATE` (gestA→Lyon rows=1, gestB→Bordeaux rows=1) · `REPORT_CROSS_ORG_DENIED` (gestA→Bordeaux rows=0, gestB→Lyon rows=0) · `REPORT_STAFF_GLOBAL` (admin rows=1 ; contributeur rows=0 — pas gestionnaire ; parent rows=0 — pas de triage) = **PASS**. UI : gestA voit le signalement Lyon, le rouvre, le résout → persisté.
- **P5C-3** : `reviews_update` — branche `user_id = auth.uid()` **RETIRÉE** (restriction, pas extension : elle n'autorisait que l'auteur à réécrire sa propre ligne d'avis, colonnes `reply*` incluses ; aucun parcours applicatif ne l'utilise). += `is_toboggo_staff` + `exists(organization_parks … is_org_gestionnaire)` ; `USING` + `WITH CHECK` explicites ; branche V1 `commune_id` gestionnaire conservée. `reviews_insert` / `reviews_delete` inchangées.
  Tests état propre : `REVIEW_REPLY_OWNER` (gestA rows=1) · `REVIEW_REPLY_CROSS_ORG_DENIED` (gestB rows=0) · `REVIEW_REPLY_ADMIN` (rows=1) · `REVIEW_REPLY_PARENT_DENIED` (parent — même sur son propre avis — rows=0 ; contributeur rows=0) = **PASS**. Readback `reply` / `reply_by` / `reply_at` OK. UI : gestA répond → « Réponse : … » affichée, persistée (fini le 204/0-row silencieux).
  Observation hors périmètre : `flagReview()` (mobile — signalement d'un avis par un tiers) était **déjà** non fonctionnel sous la policy V1 (seul l'auteur passait) → comportement inchangé par `0021`, dette **M5**.

**Reset + non-régression** : `supabase db reset` (LOCAL, sans `--linked`) → `0001→0021` + `seed` = **PASS** (`MIGRATIONS_0001_0021` / `SEED_AFTER_0021` = PASS). Fixtures recréées via **vrais flux Auth** (`signup` ×6 → 200 ; 5 `team_members` liés par trigger). Corrections re-vérifiées depuis l'état propre → toutes **PASS**. Régressions : `AUTH` / `RLS_MULTI_ORG` (cross-org rows=0, `organization_parks_guard` → 400, steal → 403) / `MAINTENANCE` / `AUDIT` / `TEAM` = **PASS**. `TYPECHECK` / `BACKOFFICE_BUILD` / `MOBILE_BUILD` = **PASS** ; 0 `as any` / `@ts-ignore` / `@ts-expect-error` ajouté (2 assertions `!` supprimées).

`BACKOFFICE_PARKS` / `BACKOFFICE_REPORTS` / `BACKOFFICE_REVIEWS` / `BACKOFFICE_MULTI_ORG` = **PASS**. **`PHASE_5C_1 = PASS`** · **`READY_FOR_PHASE_5D = YES`**.

### 5C.2 — Checkpoint + commit  → **CLOSED / PASS**

Les 4 fichiers du chantier 5C.1 ont été commités **et poussés** :
`e0712f8 fix(backoffice): resolve v2 parks and rls issues` — `0021_fix_remaining_v2_rls.sql`, `apps/backoffice/src/components/ParkModal.tsx`, `apps/backoffice/src/screens/Parks.tsx`, `docs/architecture/database-migration.md` (250 lignes). `git rev-parse HEAD == git rev-parse origin/main == e0712f8`. Fichiers hors chantier (3× `icons-sprite.svg` + `Toboggo-Brand-Guidelines.pdf`) **non stagés**. **Phase 5C = CLOSED.**

---

## 15. Plan de rollback du cutover V1→V2  (Phase 5D — préparation, rien exécuté)

> **But** : rendre le `db push --linked` de `0007→0021` sur la prod `dfzrsygetbhnjzfssgub` réversible.
> Contexte favorable : `0007→0021` sont **non destructives** (§5 #5, confirmé §17) — toutes les
> colonnes/tables/enums V1 restent en place, les triggers `*_v1_compat` maintiennent la
> coexistence, `0022+` (destructif) n'est **pas** appliquée. Le front reste sur `package.json`
> actuel (types V2 depuis `1f0510e`, déjà compatible via la vue `park_public`).

### 15.A — AVANT migration (checklist de préparation)

1. **Backup production — logique, via la CLI (Docker requis, redevenu disponible).**
   `supabase login` est valide (vérifié : `supabase projects list` + `migration list --linked` OK sans prompt).
   Trois dumps, dans `backups/` (déjà gitignored — `.gitignore:11`), horodatés :

   ```
   supabase db dump --linked --schema public          -f backups/prod_v1_schema_YYYYMMDD.sql
   supabase db dump --linked --data-only --use-copy    -f backups/prod_v1_data_YYYYMMDD.sql
   supabase db dump --linked --role-only               -f backups/prod_v1_roles_YYYYMMDD.sql
   ```

   - **Impact** : lecture seule côté prod (`pg_dump`), aucune écriture, aucun lock exclusif.
   - **Auth** : le `--dry-run` montre que la CLI se connecte via le rôle `cli_login_postgres`
     (mot de passe de session généré par `supabase login`) → **aucun credential supplémentaire à saisir**.
     ⚠️ le script `--dry-run` **imprime ce mot de passe de session en clair** dans le terminal —
     ne jamais le copier dans ce doc ni dans un commit.
   - **Portée** : `--schema public` = schéma métier V1 (tables `parks`, `reviews`, `reports`,
     `communes`, `team_members`, `maintenance`, `activity_log`, `park_edit_history`, `profiles`,
     `notifications`, `contact_messages`, …) + RLS + fonctions + triggers. Les schémas
     `auth` / `storage` / `supabase_migrations` sont **exclus** par la CLI (maintenus par la
     plateforme) — acceptable : `0007→0021` ne touchent ni `auth.users` ni `storage.objects`
     (0 objet Storage, §2). `--role-only` capture les rôles cluster.
   - **Vérification post-dump** : `wc -l` non nul sur les 3 fichiers ; `grep -c "CREATE TABLE" schema`
     ≥ 13 ; présence de `parks`, `communes`, `park_edit_history` dans le schema dump ;
     `grep -c "public\".\"parks" data` cohérent avec 17 lignes.

2. **Backup production — physique, côté plateforme Supabase (complémentaire, à privilégier si dispo).**
   Dashboard → *Database → Backups*. Selon le plan :
   - Pro/Team : backup quotidien automatique + rétention 7 j → **noter la date/heure du dernier
     backup** juste avant la fenêtre ; si un bouton *on-demand backup* est présent, le déclencher.
   - PITR (add-on payant) : noter le *recovery window* — permet un retour à un timestamp précis.
   - Free : pas de backup plateforme → le dump logique (point 1) est **le seul filet**, donc obligatoire.
   > Le backup physique plateforme est restaurable en self-service / via support Supabase et
   > couvre `auth` + `storage`, que le dump CLI n'a pas. Faire **les deux**.

3. **Inventaire / counts prod** (SQL Editor, `SELECT` seul) — rejouer `supabase/inventory-pre-v2.sql`
   et **archiver le résultat daté** à côté des dumps. Référence attendue (§2) :
   `communes=2, profiles=4, team_members=3, parks=17 (16 published + 1 pending, 6 avec commune_id),
   reviews=0, reports=0, maintenance=0, park_edit_history=0`, 0 orphelin.
   Sert d'oracle de non-régression post-migration (les backfills 0008/0010/0016 doivent produire
   `organizations=2`, `organization_parks=6`, `park_features=182 dont 46 unknown`).

4. **`supabase migration list --linked`** — capturer la sortie : doit montrer
   `remote 0001→0006` renseigné, `0007→0021` avec `remote` vide. Archiver.

5. **Commit Git exact** — figer le SHA déployé : `git rev-parse HEAD` doit valoir **`e0712f8`**
   (ou le futur commit qui n'aura QUE des changements de doc au-dessus). `git status` : working
   tree propre hormis les fichiers branding hors chantier. Noter le SHA dans le journal de cutover.

6. **Fenêtre de maintenance** — communiquée à l'avance. Pendant la fenêtre :
   - activer une bannière « maintenance » côté front (ou couper le trafic écriture) ;
   - `0007→0021` s'appliquent en quelques secondes (17 parcs, 0 review/report) mais
     `ALTER TYPE … ADD VALUE` (0007) et la recréation de `nearby_parks` (0017) exigent qu'aucune
     transaction longue ne tourne — donc trafic applicatif idéalement à zéro ;
   - durée estimée : < 5 min migration + vérifications.

### 15.B — SI `0007→0021` ÉCHOUE PENDANT L'APPLICATION (`db push --linked` sort en erreur)

1. **Arrêter immédiatement** — ne pas relancer `db push`, ne pas enchaîner une autre commande.
   Chaque migration Supabase s'exécute dans **sa propre transaction** : une migration qui
   échoue est **rollback-ée intégralement** par Postgres ; les migrations précédentes de ce
   push sont, elles, **déjà committées** et enregistrées dans `supabase_migrations.schema_migrations`.
2. **Diagnostiquer sans rien modifier** :
   - lire le message d'erreur complet (numéro de migration + ligne SQL + `SQLSTATE`) ;
   - `supabase migration list --linked` → identifier la **dernière migration réellement
     appliquée** (`NNNN`) ;
   - SQL Editor (`SELECT` seul) : `SELECT version FROM supabase_migrations.schema_migrations
     ORDER BY version;` + inspecter l'objet fautif (`\d+ table`, `pg_policies`, `pg_proc`) ;
   - comparer au comportement local : `supabase db reset` LOCAL rejoue `0001→0021` sans erreur
     (§17) → l'écart est un état prod non reproduit en local (extension manquante, objet
     pré-existant, rôle, donnée). Reproduire d'abord l'écart **en local ou sur le staging (§16)**.
3. **INTERDICTION ABSOLUE d'improviser** :
   - ❌ `supabase migration repair` sur la prod (réécrit l'historique sans toucher le schéma → désync) ;
   - ❌ éditer `0007→0021` puis re-push (migrations figées — §10) ;
   - ❌ patcher le schéma prod à la main dans le SQL Editor ;
   - ❌ `db reset --linked`.
   La correction se fait **en local**, dans une **nouvelle** migration `0022_*` (non destructive)
   validée par `db reset` local + staging, puis re-planifiée.
4. **Quand restaurer** (§15.D) plutôt que corriger en avant :
   - l'échec a laissé la prod dans un état où `0001→NNNN` sont appliquées mais le schéma est
     **incohérent** (ex. une migration a fait un `CREATE` partiel qu'un `IF NOT EXISTS` masquera
     au retry — les `0007→0021` sont écrites idempotentes/`IF EXISTS` mais vérifier au cas par cas) ;
   - **ou** le front commence à voir des erreurs 500 en prod ;
   - **ou** on est hors fenêtre de maintenance et on ne peut pas la prolonger.
   Sinon : geler l'état, corriger à froid, re-planifier.

### 15.C — SI LA MIGRATION DB PASSE MAIS LE FRONT V2 ÉCHOUE

Rappel de l'état après un `0007→0021` réussi :
- **toutes les colonnes V1 sont conservées** (`parks.lat/lng/wc/shade/…`, `reviews.stars/flagged`,
  `reports.reason/equipment/comment`, `*.commune_id`) ;
- **les tables legacy sont conservées** (`communes`, `park_edit_history`) ;
- **les triggers `*_v1_compat` sont actifs** (`parks`/`reviews`/`reports`/`team_members`/
  `maintenance`/`activity_log`) → un INSERT/UPDATE au format V1 **pur** reste valide et
  alimente les colonnes V2, et réciproquement ;
- **`0022+` n'est pas appliquée** → rien n'a été supprimé, `park_public` expose toujours la
  forme plate.

**Conséquence : le front V1 (pré-`1f0510e`) peut être redéployé directement** — la base
post-`0021` est un **sur-ensemble** de la base V1. Procédure :

1. `git revert` / redeploy du build front antérieur à `1f0510e` (dernier tag/commit « front V1 »),
   **ou** simple rollback de la plateforme d'hébergement (Vercel/Netlify → *promote previous deploy*).
2. Le front V1 lit/écrit les colonnes V1 : lectures via `park_public` (compatible), écritures
   parks/reviews/reports/maintenance → triggers `*_v1_compat` remplissent le V2. **RAS attendu.**
3. **Vérifications obligatoires après redeploy front V1** :
   - carte + liste + détail parc (lecture `park_public` / `nearby_parks`) ;
   - `signUp` d'un compte test → 200 (le fix D1 de `0020` est en base, donc **mieux** qu'avant) ;
   - création d'un avis + d'un signalement test → 201, `stars`/`reason` remplis, `rating`/`category`
     remplis par trigger ;
   - back-office : login gestionnaire, liste parcs, ouverture modale (le fix P5C-1 est **front**,
     donc un front V1 antérieur **réintroduit le crash P5C-1** si sa version est < `e0712f8` —
     **choisir un build front qui contient déjà le fix P5C-1**, c.-à-d. `e0712f8` ou plus récent,
     même si on rollback les types : P5C-1 est indépendant des types V2) ;
   - `commune_id` d'un parc édité via back-office → toujours cohérent avec `organization_parks`.
4. Si le front V2 échoue seulement partiellement (un écran) : préférer un **hotfix front** à un
   rollback DB — la DB est saine.

> **Point d'attention** : ne pas rollback le front en-dessous de `e0712f8` (P5C-1). Le
> « front V1 » sûr = **`e0712f8` avec, si besoin, `database.types.ts` regénéré ou reverté** ;
> en pratique le front actuel (`e0712f8`, types V2) fonctionne contre la base post-`0021`,
> donc le scénario le plus probable est **« ne rien rollback, hotfix »**.

### 15.D — SI UNE RESTAURATION DB EST NÉCESSAIRE (procédure générale — NON exécutée)

> À n'utiliser que si 15.B pointe une incohérence de schéma non corrigeable à froid.

**Option 1 — restauration plateforme (préférée si backup physique dispo)** :
1. Fenêtre de maintenance, trafic coupé.
2. Dashboard → *Database → Backups* → restaurer le backup daté pris en 15.A.2
   (ou PITR au timestamp juste avant le `db push`).
3. La restauration Supabase remet `auth` + `storage` + `public` cohérents.
4. `supabase migration list --linked` → doit revenir à `remote 0001→0006`.
   Si l'historique de migration ne correspond plus (la restauration a remis l'ancienne table
   `schema_migrations`), **ne pas** `migration repair` à l'aveugle : ouvrir un ticket support
   Supabase avec l'état constaté.
5. Rejouer l'inventaire (§15.A.3) → comparer aux counts archivés.

**Option 2 — restauration logique depuis les dumps CLI (si pas de backup physique)** :
1. Fenêtre de maintenance, trafic coupé.
2. Cette option **ne peut pas** « défaire » proprement `0007→0021` sur la base en place
   (pas de `DROP` scripté — c'est justement `0022+`). Elle sert à reconstruire une base vierge :
   restaurer `prod_v1_roles`, puis `prod_v1_schema`, puis `prod_v1_data` sur un **nouveau**
   projet Supabase, puis re-pointer le DNS/clients — lourd, à réserver au désastre.
3. Alternative plus légère si le schéma post-`0021` est cohérent mais qu'on veut annuler
   *fonctionnellement* : écrire un `0022_rollback_v2.sql` **dédié** (non prévu au plan, à auditer
   comme les autres) qui `DROP` les objets `0007→0021` dans l'ordre inverse. **Non écrit, non autorisé
   à ce stade.**

**Dans tous les cas** : after restauration, `git` du front revient au commit archivé en 15.A.5,
et on ne retente `db push` qu'après avoir reproduit et corrigé l'échec sur le staging (§16).

### 15.E — Checklist GO / NO-GO avant `db push --linked` production

Tout doit être **coché** ; un seul NO-GO ⇒ on ne pousse pas.

| # | Critère | Comment le prouver | État |
|---|---|---|---|
| G1 | `HEAD == origin/main`, working tree propre (hors branding) | `git rev-parse HEAD origin/main` ; `git status` | ☐ |
| G2 | `0007→0021` présentes, ordonnées, **`0022+` absente** | `ls supabase/migrations/` ; §17 | ☐ |
| G3 | `0001→0021` identiques à leurs commits de validation | `git diff --stat HEAD -- supabase/migrations/` vide ; §17 | ☐ |
| G4 | `db reset` LOCAL `0001→0021` + seed = PASS (rejoué le jour J) | sortie CLI | ☐ |
| G5 | (recommandé) rejeu `0001→0021` + seed synthétique sur **staging jetable** = PASS | §16 | ☐ |
| G6 | `npm run typecheck` + `npm run build` = PASS | sortie CLI | ☐ |
| G7 | Backup prod **logique** (3 dumps) pris, daté, vérifié (`wc -l`, `grep`) | fichiers dans `backups/` | ☐ |
| G8 | Backup prod **physique** plateforme noté (date/heure) OU plan Free assumé | dashboard | ☐ |
| G9 | Inventaire prod daté archivé (oracle de non-régression) | fichier | ☐ |
| G10 | `supabase migration list --linked` = `remote 0001→0006`, `0007→0021` vide | sortie CLI archivée | ☐ |
| G11 | Fenêtre de maintenance planifiée + bannière front prête + trafic écriture maîtrisé | — | ☐ |
| G12 | Plan de rollback (15.B/C/D) relu par le fondateur | — | ☐ |
| G13 | Build front à déployer post-migration ≥ `e0712f8` (fix P5C-1) et types V2 | `git log` | ☐ |
| G14 | Dettes D4 + M1→M5 confirmées non bloquantes pour le cutover DB (§17) | §17 | ☐ |
| G15 | `supabase login` valide, `--dry-run` du dump OK, `cli_login_postgres` fonctionnel | sortie CLI | ☐ |

**Ordre le jour J** : G1–G6 (froid) → fenêtre de maintenance → G7–G10 → `supabase db push --linked`
→ inventaire post-migration vs oracle → smoke tests prod (carte, détail, signup, avis, back-office
login+modale) → lever la bannière. Si un smoke test échoue → 15.C (hotfix front d'abord) ou 15.D.

---

## 16. Procédure staging jetable  (Phase 5D — écrite, NON exécutée)

> **Objectif** : un dernier rejeu de `0001→0021` + seed **synthétique** sur un projet Supabase
> **neuf**, totalement séparé de la prod, avant d'envisager le `db push` prod. Rien n'est créé
> tant que le fondateur n'a pas tranché.

### 16.1 — Procédure exacte

1. **Créer un nouveau projet Supabase** (dashboard, plan Free suffisant) — région au choix,
   nom explicite type `toboggo-staging-cutover`. Il reçoit une **nouvelle project ref** distincte
   (ex. `abcd…` ≠ `dfzrsygetbhnjzfssgub`). Noter la ref **hors Git** (ex. `backups/STAGING_REF.txt`,
   déjà gitignored).
2. **Ne pas relier le repo au staging.** Ne pas faire `supabase link --project-ref <staging>`
   (ça écrirait `supabase/config.toml` / `.supabase/`). À la place, utiliser `--db-url` explicite :

   ```
   # URL récupérée dans le dashboard staging (Settings → Database → Connection string, mode "URI")
   # stockée hors Git, jamais collée dans le doc :
   export STAGING_DB_URL='postgresql://postgres:<pwd>@db.<staging-ref>.supabase.co:5432/postgres'

   supabase db push --db-url "$STAGING_DB_URL"           # applique 0001→0021
   # puis seed synthétique :
   psql "$STAGING_DB_URL" -f supabase/seed.sql           # (ou via docker exec ... psql)
   ```

   > `supabase db push --db-url …` applique le dossier `supabase/migrations/` local (`0001→0021`)
   > sur la cible pointée par l'URL, **sans** toucher au projet lié.
3. **Rejouer l'audit §17 + les tests de non-régression 5C.1** contre `$STAGING_DB_URL`
   (matrice RLS multi-org, comptages de lignes, intégrité, `park_public.water`, `nearby_parks`).
4. **Détruire le projet staging** dès la validation obtenue (dashboard → *Settings → General →
   Delete project*). Supprimer `backups/STAGING_REF.txt` et `unset STAGING_DB_URL`.

### 16.2 — Garde-fous

- ❌ **jamais** réutiliser `dfzrsygetbhnjzfssgub` ni son URL / ses clés.
- ❌ **jamais** `supabase link` vers le staging (aucune modif de `supabase/config.toml`,
  `.supabase/`, `.env`, `.env.local`).
- ❌ **aucune** ref/URL/clé staging committée — tout dans `backups/` (gitignored) ou des variables
  d'environnement de session.
- ❌ **aucune** donnée personnelle de prod : seed **synthétique uniquement** (`supabase/seed.sql`
  + fixtures générées, comme en Phase 3D/5C). Pas de `--data-only` depuis la prod vers le staging.
- ❌ ne pas pointer `.env.local` (front) sur le staging sauf test explicite et temporaire, puis
  restaurer sur `http://127.0.0.1:54321`.
- ✅ le `.env` prod n'est jamais ouvert ni modifié.

### 16.3 — Commandes envisagées (récap)

```
supabase projects create toboggo-staging-cutover --org <org> --region <region> --db-password <gen>
# (ou création via dashboard)
export STAGING_DB_URL='postgresql://postgres:<pwd>@db.<staging-ref>.supabase.co:5432/postgres'
supabase db push --db-url "$STAGING_DB_URL"
psql "$STAGING_DB_URL" -f supabase/seed.sql
# … audit §17 + régression 5C.1 …
supabase projects delete <staging-ref>
```

### 16.4 — Prouver `TARGET_DB = STAGING` et `PROD_TARGETED = NO`

Avant toute commande d'écriture, exécuter et archiver :

1. `echo "$STAGING_DB_URL" | sed -E 's/:[^:@]+@/:***@/'` → l'hôte doit être
   `db.<staging-ref>.supabase.co` avec `<staging-ref> != dfzrsygetbhnjzfssgub`.
2. `grep -R "dfzrsygetbhnjzfssgub" <<<"$STAGING_DB_URL"` → **aucun match**.
3. `supabase status -o json | jq -r .linked_project.project_ref` → doit **rester**
   `dfzrsygetbhnjzfssgub` (le lien n'a pas bougé) **et** aucune commande `--linked` n'est utilisée
   pour le staging (on n'utilise que `--db-url`).
4. `git status --porcelain` → **vide** pour `supabase/config.toml`, `.env`, `.env.local`
   (le staging n'a rien écrit dans le repo).
5. `psql "$STAGING_DB_URL" -c "select current_database(), inet_server_addr();"` → IP ≠ IP prod.
6. Sur la prod, en parallèle : `supabase migration list --linked` → **inchangé**
   (`remote 0001→0006`, `0007→0021` vide) avant/après la session staging.

`STAGING_RECOMMENDED = YES` (Free, ~15 min, filet supplémentaire avant le push prod) —
**création soumise à décision du fondateur.**

---

## 17. Audit pré-cutover  (Phase 5D — exécuté 2026-08-30, READ-ONLY)

| # | Contrôle | Méthode | Résultat |
|---|---|---|---|
| A1 | `0007→0021` présentes et ordonnées | `ls supabase/migrations/` | **PASS** — `0007_v2_enums_extensions` … `0021_fix_remaining_v2_rls`, 21 fichiers `00NN_*.sql` contigus |
| A2 | Aucune migration `0022+` | `ls supabase/migrations/ \| grep -E '^002[2-9]\|^00[3-9][0-9]'` | **PASS** — aucune |
| A3 | `0001→0021` non modifiées depuis leur commit de validation | `git diff --stat HEAD -- supabase/migrations/` ; `git log -1 -- <f>` | **PASS** — diff vide ; dernier commit par fichier : `0001–0016,0018,0019` = `3029c57` (réconciliation 2A/2B, contient déjà les fixes 2C/2D), `0017` = `9b13047` (fix 3E), `0020` = `b530265` (5B.1), `0021` = `e0712f8` (5C.1). Tous == HEAD. |
| A4 | `database.types.ts` = schéma V2 | `grep organizations/organization_parks/park_features/park_public/park_zones` ; `grep in_progress` ; `git diff HEAD` | **PASS** — 5/5 marqueurs V2 présents, `report_status` inclut `in_progress`, fichier == commit `1f0510e`, working tree clean |
| A5 | `typecheck` PASS | `npm run typecheck` | **PASS** — design-system + shared + mobile + backoffice, 0 erreur |
| A6 | builds PASS | `npm run build` | **PASS** — `build:mobile` ✓ (3.38 s), `build:backoffice` ✓ (4.12 s) ; warnings chunk > 500 kB = cosmétiques préexistants |
| A7 | Aucune URL/clé staging ou locale trackée | `git grep -nE '127.0.0.1:54321\|dfzrsygetbhnjzfssgub\|sb_secret_\|sb_publishable_\|SERVICE_ROLE'` (hors ce doc) | **PASS** — 0 match dans le code ; `.env.example` = 3 clés vides ; `supabase/config.toml` `project_id="Toboggo_App"` (nom CLI local, pas la ref prod) |
| A8 | `.env.local` gitignored | `git check-ignore -v .env.local` ; `git ls-files \| grep .env` | **PASS** — `.gitignore:4` ; seul `.env.example` est tracké |
| A9 | Aucun `DROP TABLE/COLUMN`, `DELETE`, `TRUNCATE` hors cas documentés dans `0007→0021` | `grep -niE 'drop table\|drop column\|truncate\|delete from'` + revue de tous les `DROP` | **PASS** — 0 `DROP TABLE/COLUMN`, 0 `DELETE FROM`, 0 `TRUNCATE`. `DROP` présents = `DROP TRIGGER IF EXISTS` (chacun recréé), `DROP POLICY IF EXISTS` (0020 ×4, 0021 ×3 — chacune recréée), `DROP FUNCTION nearby_parks` (0017, recréée). Conforme §5 #5. |
| A10 | Dettes D4 + M1→M5 non bloquantes pour le cutover DB | revue | **PASS** — voir tableau ci-dessous |
| A11 | Prod = V1 confirmé | `supabase migration list --linked` | **PASS** — `remote 0001→0006` renseigné ; `0007→0021` : `remote` vide |
| A12 | Base LOCALE à `0001→0021` (référence de rejeu) | `psql … schema_migrations` | **PASS** — 21 versions `0001…0021` ; dataset `parks=6 / organizations=2 / park_features=35` (seed synthétique) |

### A10 — D4 + M1→M5 : impact cutover DB

| Dette | Nature | Bloquant pour `db push` prod ? | Justification |
|---|---|---|---|
| **D4** | Produit — `AddPark` mappe un équipement non coché → `park_features.status='unavailable'` | **NON** | Bug d'écriture **front**, pas dans les migrations. Le backfill `0010` respecte §5 (`false→unknown`). N'affecte que les parcs créés **après** cutover via l'UI mobile actuelle. À trancher produit avant d'ouvrir AddPark en grand, pas avant le push DB. |
| **M1** | Badges React Query périmés (back-office) | **NON** | Cosmétique front, 0 lien DB. |
| **M2** | Nav collectivité non filtrée par rôle + `maintenance_all` ouvert au contributeur | **NON** (à surveiller) | `maintenance_all = is_commune_member` est une policy **V1 déjà en prod aujourd'hui** — le cutover ne l'aggrave pas. Durcissement = `0022+` ou policy dédiée, post-cutover. |
| **M3** | Rate-limit OTP local 2/h | **NON** | Config **locale** uniquement ; la prod a sa propre config Auth. |
| **M4** | `validateDOMNesting <button>/<button>` dans `Parks.tsx` | **NON** | Warning dev-only, absent du build prod (vérifié §5C). |
| **M5** | `flagReview()` (signalement d'avis par un tiers) non fonctionnel sous `reviews_update` | **NON** | **Déjà cassé en V1 prod aujourd'hui** (seul l'auteur passait). `0021` ne régresse pas, ne corrige pas. Flux modération dédié = chantier séparé, post-cutover. |

**Aucune dette n'est un NO-GO pour l'application de `0007→0021` en production.** Toutes sont soit
front-only, soit local-only, soit un état déjà présent en V1 que le cutover ne dégrade pas.

### Écarts / points de vigilance relevés par l'audit

1. **Dump CLI n'inclut pas `auth` / `storage`** → le backup logique seul ne couvre pas les
   comptes utilisateurs. Mitigation : backup physique plateforme en complément (§15.A.2), et
   `0007→0021` ne touchent pas ces schémas.
2. **Le `--dry-run` du dump imprime le mot de passe de session `cli_login_postgres` en clair.**
   Ne jamais le committer. Rotation possible via `supabase logout` / `login`.
3. **Docker est redevenu disponible** sur cette machine (12 conteneurs Supabase `healthy`,
   `docker info` OK) — la note Phase 2A (« `supabase db dump` exige Docker (indisponible) »)
   est **caduque**. Le backup CLI est faisable ici.
4. **`pg_dump` / `psql` absents du PATH hôte** mais présents dans le conteneur
   `supabase_db_Toboggo_App` (PG 17.6) ; `supabase db dump` utilise sa propre image dockerisée.
   Pour `psql` ad hoc : `docker exec supabase_db_Toboggo_App psql …`.
5. **Un seul projet dans le compte Supabase** (`supabase projects list`) → un staging serait
   bien un projet **neuf** avec une ref distincte (pas de risque de confusion d'alias).

`PRE_CUTOVER_AUDIT = PASS` · `PROD_TOUCHED = NO`.

---

## Historique des mises à jour

| Date | Phase | Résumé |
|---|---|---|
| 2026-08-30 | 2D | Corrections audit ; 13 migrations FIXED ; verdict READY_FOR_LOCAL_TEST ; création de ce fichier. |
| 2026-08-30 | — | `docs(db): refresh migration checkpoint` — §1 Git remis à l'état réel (Phase 2A commitée + poussée dans `3029c57`, working tree clean) ; §10 & §11 : commandes DB clarifiées (interdits = prod/`--linked` uniquement ; autorisés = base locale isolée ou projet staging jetable séparé). |
| 2026-08-30 | 3B–3E | Validation locale complète. 3B : stack Docker PG17, `0001→0019`+seed OK. 3C : DB/RLS PASS, types V2, typecheck ~110→10. 3D : backfill V1→V2 testé sur fixture des 17 parcs réels ; défaut `park_public.water`. 3E : fix (`0017` + `migrations-v2-draft/0002`), 31/31 checks PASS. Verdict : `BACKFILL_READY_FOR_PROD = YES`. Ajout §13. Commité dans `9b13047 fix(db): validate v1 to v2 backfill`. |
| 2026-08-30 | 4A | Checkpoint types V2 avant refactor. Checkpoint Git périmé corrigé : fix Phase 3E désormais **commité** dans `9b13047`. `database.types.ts` du working tree re-vérifié structurellement contre le schéma local V2 validé (17 tables v2, vue `park_public`, ~18 enums v2, `report_status += in_progress`, `nearby_parks` élargi) — conforme ; le fix 3E ne change pas la forme du type. Non régénéré depuis `--linked`. Aucun fichier API modifié. Commité + poussé : `1f0510e chore(types): switch Supabase types to v2 schema` (`database.types.ts` V2 + ce doc). |
| 2026-08-30 | 4B | Alignement `packages/shared/src/api/*` + `types.ts` avec les types V2. `npm run typecheck` : **10 → 0 erreurs** ; `build:mobile` PASS ; `build:backoffice` PASS. Corrections : `contributions` (`ParkEdit.changes → Json`, `find_duplicate_parks.p_exclude` optionnel) ; `maintenance` (payloads `TablesInsert/TablesUpdate` typés, `commune_id` legacy au trigger) ; `nearby_parks` (type RPC dédié `NearbyParkRow` + mapper explicite `nearbyRowToPark`) ; `park_features.status` typé `feature_status` ; `splitParkInput` (payloads parks V2 typés, `lat`/`lng`/`formatted_address` au trigger `parks_v1_compat`, champs requis validés) ; `reviews` (`rating` V2 / `stars` legacy au trigger) ; `reports` (`category` V2 / `reason` legacy au trigger). Aucune modif DB/RLS/migration ; aucun `DEFAULT` legacy ajouté ; aucun `any`/`as any`/`@ts-ignore`/`@ts-expect-error` ajouté. Dette non bloquante : fallbacks applicatifs `country_code="FR"` / `timezone="Europe/Paris"` dans `createPark`. Commité + poussé : `ca18c71 fix(shared): align APIs with Supabase v2 types`. Prochaine phase : **Phase 5** (tests fonctionnels contre Supabase local V2). |
| 2026-08-30 | — | `f270275 docs(db): checkpoint phase 4` — checkpoint §11 mis à jour fin Phase 4B (poussé). |
| 2026-08-30 | 5A / 5A.1 | **PASS.** App mobile + backoffice branchées sur Supabase **local uniquement** via `.env.local` (racine, gitignored, prioritaire sur `.env` ; `.env` prod non touché). PROD_GUARD vérifié (env inliné + trafic réseau, 0 requête prod). Smoke tests read-only mobile/backoffice + API anon (`park_public` 5 published, `nearby_parks`, écriture anon 401) = PASS. 5A.1 : `supabase db reset` LOCAL, `0001→0019` + seed PASS, `park_public.water` LIVE == fix 3E, dataset réaligné (6/2/35/4), port 5174 nettoyé. Ajout §14. |
| 2026-08-30 | 5B | **PARTIAL.** Tests fonctionnels d'écriture (sessions Auth réelles) : mobile PASS, backoffice PARTIAL, `V1_V2_COMPAT_TRIGGERS` PASS, `DATA_INTEGRITY` PASS, typecheck/builds PASS. 5 défauts : **D1** (BLOCKER — `link_team_member_on_signup` sans `search_path` → signup 500), **D2** (audit_log `entity_type` 'parks' vs policy 'park'), **D3** (`parks_update`/`parks_public_read`/`parks_delete` sur `parks.commune_id` NULL → UPDATE 0-ligne silencieux), **D4** (MINOR produit — AddPark non coché → `unavailable`), **D5** (MINOR — table V1 `communes` vide). |
| 2026-08-30 | 5B.1 | **PASS.** Corrections D1/D2/D3/D5. Nouvelle migration **non destructive** `0020_fix_v2_runtime_compat.sql` : D1 (`link_team_member_on_signup` → `SET search_path=''` + objets `public.*` qualifiés), D2 (`audit_log_read` → `entity_type='parks'`), D3 (`parks_update` reconnaît `can_edit_park()` avec `USING`+`WITH CHECK` ; branche V1 `commune_id` conservée ; `parks_public_read`+`parks_delete` alignées V2 ; `parks_insert` inchangée). D5 : `seed.sql` (+11 lignes) crée les `communes` miroir (`communes` **non** canonique V2). Vrai `supabase.auth.signUp()` testé (session + profiles + team link OK). Matrice `parks_update` A/B avec comptage de lignes (aucun 0-row silencieux pour un acteur autorisé). D4 laissé ouvert. `AUTH_RUNTIME`/`PARK_UPDATE_RLS`/`AUDIT_RLS`/`V1_V2_COMPAT`/`DATA_INTEGRITY`/`TYPECHECK`/`MOBILE_BUILD`/`BACKOFFICE_BUILD` = PASS. `READY_FOR_PHASE_5C = YES`. Commité + poussé : `b530265 fix(db): resolve v2 runtime compatibility issues` (`0020` + `seed.sql` + doc). |
| 2026-08-30 | 5C | **PARTIAL.** Tests fonctionnels backoffice + rôles multi-organisation (sessions Auth réelles via `auth/v1/signup` — D1 confirmé, 0 signup 500 — + navigation UI réelle + matrice REST avec comptage de lignes). PASS : login/routing (admin vs collectivité), dashboard + isolation A/B, maintenance, audit (`0020` D2 confirmé), team (list/invite/signup-link/cross-org), `organization_parks` guard, intégrité, typecheck/builds. **3 défauts** : **P5C-1** (BLOCKER — `Parks.tsx` rend `<ParkModal park=null>` inconditionnellement → `existing!.status` déréférencé au rendu → écran blanc admin/gestionnaire ; bug préexistant `5cb0260`), **P5C-2** (IMPORTANT — `reports_read`/`reports_update` sur `parks.commune_id` NULL → gestionnaire aveugle + `PATCH` 0-ligne silencieux), **P5C-3** (IMPORTANT — `reviews_update` sur `parks.commune_id` → réponse avis `PATCH` 204 / 0 ligne). Mineurs M1–M5 relevés. Contributions/`park_edits` + team role update + `organization_parks` : pas d'UI back-office (NOT_IMPLEMENTED). Ajout §14. |
| 2026-08-30 | 5C.1 | **PASS.** `LEGACY_RLS_AUDIT = PASS` : seules `reports_read`/`reports_update`/`reviews_update` (classe C) portent la dette `parks.commune_id` en usage réel ; `maintenance_all`/`activity_read`/`team_*` (classe B) filtrent sur le `commune_id` propre de la ligne (trigger `*_v1_compat`) ; `park_history_read` + `communes_write` (classe D) = tables mortes/legacy laissées au cleanup destructif `0022+`. `EXTRA_POLICIES_FIXED = NONE`. **P5C-1** corrigé côté app (`Parks.tsx` : `{modalPark && …}` ; `ParkModal.tsx` : gardes `{existing && …}`, `existing!.status` → `existing.status`, assertions `!` supprimées ; 0 `try/catch` global, 0 `any`/`ts-ignore`). **P5C-2 / P5C-3** corrigés via **migration non destructive** `0021_fix_remaining_v2_rls.sql` (`DROP POLICY` × 3 recréées aussitôt ; `0001→0020` inchangées) : `reports_read` += `manages_park()` ; `reports_update` += `organization_parks`/`is_org_gestionnaire` (`USING`+`WITH CHECK`) ; `reviews_update` — branche `user_id = auth.uid()` **retirée** (restriction) + `organization_parks`/`is_org_gestionnaire`. Branche V1 `commune_id` conservée sur les 3. `db reset` → `0001→0021` + seed = PASS ; fixtures recréées via vrais flux Auth ; corrections re-vérifiées (rows + UI). Régression AUTH/RLS_MULTI_ORG/MAINTENANCE/AUDIT/TEAM = PASS. `TYPECHECK`/`BACKOFFICE_BUILD`/`MOBILE_BUILD` = PASS. **⚠️ `0021` réaffecté → legacy cleanup destructif = `0022+` (toujours INTERDIT).** `PHASE_5C_1 = PASS` · `READY_FOR_PHASE_5D = YES`. Dettes D4 + M1–M5 documentées, non corrigées. |
| 2026-08-30 | 5C.2 | Checkpoint (ce doc) + staging Git des 4 fichiers du chantier 5C.1 : `supabase/migrations/0021_fix_remaining_v2_rls.sql`, `apps/backoffice/src/components/ParkModal.tsx`, `apps/backoffice/src/screens/Parks.tsx`, `docs/architecture/database-migration.md`. Fichiers hors chantier (3× `icons-sprite.svg` + `Toboggo-Brand-Guidelines.pdf`) NON stagés. **Commité + poussé : `e0712f8 fix(backoffice): resolve v2 parks and rls issues`. `HEAD == origin/main`. Phase 5C = CLOSED / PASS.** |
| 2026-08-30 | 5D (prépa) | **PRÉPARATION AU CUTOVER — préparation seule, `PROD_TOUCHED = NO`.** ÉTAPE 1 : checkpoint réconcilié (`e0712f8` poussé, Phase 5C close). ÉTAPE 2 : analyse backup — **Docker redevenu disponible** (12 conteneurs Supabase `healthy`) → `supabase db dump --linked` viable, `supabase login` valide, `--dry-run` OK via rôle `cli_login_postgres` (aucun credential supplémentaire ; ⚠️ le dry-run imprime ce mdp de session — non committé). `pg_dump`/`psql` absents du PATH hôte mais dans le conteneur. Commande de backup **présentée, NON lancée** (§15.A). ÉTAPE 3 : **§15 plan de rollback** écrit (A avant / B échec pendant — interdiction `migration repair` / C front V2 KO — redeploy front ≥ `e0712f8` possible, base post-`0021` = sur-ensemble V1 / D restauration DB / E checklist GO-NO-GO 15 critères). ÉTAPE 4 : **§16 procédure staging jetable** écrite (nouveau projet, `--db-url` jamais `--linked`, seed synthétique, garde-fous, preuve `TARGET_DB=STAGING`) — `STAGING_RECOMMENDED = YES`, **non créé**. ÉTAPE 5 : **§17 audit pré-cutover = PASS** (A1–A12 ; `0007→0021` présentes/ordonnées, `0022+` absente, `0001→0021` == commits de validation & == HEAD, types V2, `typecheck`+`build` PASS, 0 URL/clé trackée, `.env.local` gitignored, scan destructif conforme §5 #5, D4+M1→M5 non bloquantes). Aucun commit/push effectué. |
