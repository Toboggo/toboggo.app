# Toboggo — Chantier de migration Supabase V1 → V2 (BDD mondiale)

> **SOURCE DE VÉRITÉ du chantier.** À mettre à jour à la fin de chaque phase.
> Aucun secret / token / mot de passe ici.
> Dernière mise à jour : **2026-08-30** — **Phase 5B.1 terminée**. Tests fonctionnels d'écriture contre Supabase **local V2** : Phase 5A/5A.1 PASS (app branchée local uniquement, reset local, fix 3E `park_public.water` live), Phase 5B PARTIAL (5 défauts D1–D5), **Phase 5B.1 PASS** (D1/D2/D3/D5 corrigés via nouvelle migration **`0020_fix_v2_runtime_compat.sql`** — non destructive). `AUTH_RUNTIME` / `PARK_UPDATE_RLS` / `AUDIT_RLS` / `V1_V2_COMPAT` / `DATA_INTEGRITY` / `typecheck` / `build:mobile` / `build:backoffice` = PASS. **Le numéro `0020` est désormais pris ; le legacy cleanup destructif devient `0021+` (toujours INTERDIT).** Prod toujours V1 (`0001→0006`). `READY_FOR_PHASE_5C = YES`. Prochaine étape : **Phase 5C** — tests backoffice / rôles / multi-organisation. Dette produit ouverte : **D4** (`ADDPARK_TRI_STATE_DECISION = OPEN`).

Ce document permet à une nouvelle session Claude Code (sans accès à l'historique
de conversation) de reprendre le chantier sans reperdre une décision ni refaire
les audits. Lire **§11 CHECKPOINT** en premier.

---

## 1. État actuel

| Élément | État |
|---|---|
| **Production Supabase** (projet lié `dfzrsygetbhnjzfssgub`) | **V1** — schéma plat pré-PDF, jamais migré vers v2 |
| **Migrations réellement déployées** | `0001 → 0006` = les 6 fichiers historiques (voir §3) |
| `supabase/migrations/` | Historique réel `0001_init … 0006_admin_user_moderation` **+** migrations incrémentales `0007 → 0019` (**TESTED en local 3B–3E**) **+ `0020_fix_v2_runtime_compat.sql`** (Phase 5B.1 : corrections runtime coexistence D1/D2/D3, non destructif — voir §14). Non déployées en prod. |
| `supabase/migrations-v2-draft/` | Architecture cible **from-scratch de référence uniquement** (`0001_schema … 0005_fix_signup_trigger`). **NE PAS appliquer.** Sert de spec + de cible pour `supabase gen types` post-cutover. |
| `packages/shared/src/types/database.types.ts` | Version V2 générée en local (`gen types --local`, Phase 3C), **commitée en `1f0510e` (Phase 4A)** après re-vérification structurelle contre le schéma local V2 validé (17 tables v2 + vue `park_public`, ~18 enums v2, `report_status += in_progress`, `nearby_parks` élargi). Le fix Phase 3E (`park_public.water`) ne change pas la forme du type (`water: boolean` inchangé). Sauvegarde V1 volatile : `/tmp/database.types.v1.backup.ts`. Régénérer post-cutover via `gen types --linked` une fois la prod en V2. |
| `packages/shared/src/api/*.ts` + `packages/shared/src/types.ts` | **Phase 4B (`ca18c71`)** : alignés avec `database.types.ts` V2. `npm run typecheck` : **10 → 0 erreurs** ; `build:mobile` + `build:backoffice` PASS. Aucun `any` / `as any` / `@ts-ignore` / `@ts-expect-error` ajouté ; aucun `DEFAULT` ajouté aux colonnes legacy ; DB/RLS/migrations inchangées. Colonnes legacy NOT NULL (`parks.lat/lng/formatted_address`, `reviews.stars`, `reports.reason`, `maintenance.commune_id`) laissées aux triggers `*_v1_compat`. |
| `packages/shared/src/supabaseClient.ts` | `createClient<Database>` typé contre `database.types.ts` (V2 depuis `1f0510e`). Typecheck applicatif : **0 erreur** (Phase 4B). |
| `supabase/inventory-pre-v2.sql` | Script READ-ONLY d'inventaire prod, déjà exécuté (résultats en §2). |
| **Git** | Repo `github.com/Toboggo/toboggo.app` branche `main`. Commits du chantier poussés (du plus récent au plus ancien) : `f270275 docs(db): checkpoint phase 4` · `ca18c71 fix(shared): align APIs with Supabase v2 types` (Phase 4B) · `1f0510e chore(types): switch Supabase types to v2 schema` (Phase 4A) · `9b13047 fix(db): validate v1 to v2 backfill` (Phases 3B→3E) · `d0e1875 docs(db): refresh migration checkpoint` · `c0da9a2 chore(types): type Supabase client from remote schema` · `3029c57 chore(db): prepare incremental Supabase v2 migration` (réconciliation Phase 2A). **Non commité (Phase 5B.1, à commiter) : `supabase/migrations/0020_fix_v2_runtime_compat.sql` + `supabase/seed.sql`.** Non commité hors chantier (NE PAS toucher) : 3× `icons-sprite.svg` + `docs/Toboggo-Brand-Guidelines.pdf`. Voir §11 « ÉTAT GIT ». |

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
5. **Aucun `DROP TABLE` / `DROP COLUMN` / `DELETE` / `TRUNCATE`** dans `0007→0020`. Seuls `DROP` admis : `DROP FUNCTION nearby_parks` (0017, changement de type de retour, recréée immédiatement) ; `DROP TRIGGER IF EXISTS x` (chacun recréé aussitôt) ; `DROP POLICY` en 0020 sur `audit_log_read` / `parks_*` (chacune **recréée aussitôt**, coexistence préservée).
6. **Le nettoyage legacy destructif = migration `0021+`** (le `0020` initialement prévu est réaffecté à `0020_fix_v2_runtime_compat.sql`, non destructif — Phase 5B.1). À écrire **seulement après cutover du front V2**. Contient tous les `DROP` de colonnes/tables/policies V1 (`communes` incluse), `DROP` des triggers `*_v1_compat`, retour `park_public` à `p.*`. Destructif, irréversible.
7. **`recalculate_park_score`** : `SECURITY INVOKER` (pas DEFINER) → soumis à la policy `park_scores_write` (moindre privilège).
8. **`nearby_parks`** : stratégie `DROP + CREATE` retenue (auditée sûre) — pas de `nearby_parks_v2`.

---

## 6. Migrations 0007 → 0020

Toutes en `supabase/migrations/`. État `0007→0019` : **DRAFT → AUDITED (2C) → FIXED (2D) → TESTED (3B–3E)**. `0001→0019` appliquées sans erreur, toutes assertions `RAISE` passées, sur base locale V2 (seed) **et** sur fixture V1 réaliste (backfill). `0020` ajoutée en **Phase 5B.1** (corrections runtime coexistence, non destructif).

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
| 0020 | `0020_fix_v2_runtime_compat.sql` | **corrections runtime coexistence (Phase 5B.1)** : D1 `link_team_member_on_signup` `SET search_path=''` + objets `public.*` qualifiés ; D2 `audit_log_read` → `entity_type='parks'` ; D3 `parks_update` (+ `can_edit_park()`, `USING`+`WITH CHECK`), `parks_public_read` + `parks_delete` alignées V2 | TESTED (SAFE) — Phase 5B.1 | 0018 | **NON DESTRUCTIF** : 0 `DROP TABLE/COLUMN`, 0 `DELETE/TRUNCATE`. Branche V1 `commune_id` **conservée** (coexistence, OR permissif). `parks_insert` inchangée. ⚠️ ce `0020` **n'est pas** le legacy cleanup du plan (§5 #6) → devient `0021+`. |

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
- ❌ toute application de `0007 → 0020` sur la **production**
- ❌ créer la migration **`0021+` de legacy cleanup destructif** (`0020` est maintenant pris par `0020_fix_v2_runtime_compat.sql`, non destructif — voir §14 ; le cleanup destructif reste conditionné au cutover)
- ❌ supprimer / altérer les colonnes ou tables V1
- ❌ modifier le schéma distant de production de quelque manière que ce soit
- ❌ committer un secret / token / mot de passe DB

**AUTORISÉ** :

- ✅ lecture seule sur la production distante : `supabase migration list --linked`, `supabase gen types typescript --linked`, SQL Editor `SELECT`
- ✅ édition locale des fichiers de migration (`supabase/migrations/0007→0020`, `migrations-v2-draft/`)
- ✅ `supabase db reset` / application des migrations sur une base **LOCALE explicitement isolée** (Postgres local jetable)
- ✅ application des migrations sur un projet **STAGING jetable, explicitement séparé de la production**

---

## 11. CHECKPOINT ACTUEL

> **⚠️ Section critique — lire en premier, mettre à jour à chaque phase.**

```
DERNIÈRE PHASE :
  Phase 5B.1 terminée.

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

VERDICT DB :
  BACKFILL_READY_FOR_PROD = YES

ÉTAT APPLICATION :
  TYPECHECK_V2     = PASS
  MOBILE_BUILD     = PASS
  BACKOFFICE_BUILD = PASS

PRODUCTION :
  toujours V1 — 0001→0006 uniquement.
  0007→0020 JAMAIS appliquées en production.

DETTE NON BLOQUANTE / OUVERTE :
  - createPark (packages/shared/src/api/parks.ts) conserve des fallbacks
    APPLICATIFS country_code="FR" / timezone="Europe/Paris" quand le caller
    ne les fournit pas. Ni DEFAULT de colonne ni trigger (conforme §5 #2),
    à revoir avant déploiement mondial. Confirmé UTILISÉ en 5B (AddPark ne
    passe pas ces champs).
  - D4 — ADDPARK_TRI_STATE_DECISION = OPEN. AddPark : équipement non coché
    → park_features.status='unavailable'. Le modèle permet unknown / available
    / unavailable. Décision produit ; ne bloque pas la Phase 5C.

PROCHAINE PHASE :
  Phase 5C — tests fonctionnels complets backoffice / rôles / parcours
  multi-organisation contre Supabase LOCAL V2 (0001→0020 + seed). Prod jamais
  touchée. NE PAS commencer Phase 5C sans instruction.

ÉTAT GIT :
  DÉJÀ COMMITÉ ET POUSSÉ sur origin/main (jusqu'à Phase 4B / checkpoint 4) :
  - f270275 docs(db): checkpoint phase 4
  - ca18c71 fix(shared): align APIs with Supabase v2 types      (Phase 4B)
  - 1f0510e chore(types): switch Supabase types to v2 schema    (Phase 4A)
  - 9b13047 fix(db): validate v1 to v2 backfill                 (Phases 3B→3E)

  NON COMMITÉ — produit par ce chantier (Phase 5B.1), À COMMITER :
  - supabase/migrations/0020_fix_v2_runtime_compat.sql  (nouveau — D1/D2/D3)
  - supabase/seed.sql                                   (+11 lignes — D5 communes)

  NON COMMITÉ, hors chantier DB — NE PAS toucher, NE PAS stager :
  - apps/backoffice/public/icons-sprite.svg
  - apps/mobile/public/icons-sprite.svg
  - packages/design-system/src/icons/icons-sprite.svg
  - docs/Toboggo-Brand-Guidelines.pdf (non tracé)
    modifs de branding hors chantier DB, NON produites par ce chantier.

  LOCAL, hors Git : .env.local (racine, gitignored — URL locale + clé anon
  LOCALE), scripts de test 5B/5B.1 (scratchpad de session), données de test
  dans la base locale (non resetée en fin de 5B.1).

FICHIERS À LIRE (dans l'ordre) :
  1. docs/architecture/database-migration.md  (ce fichier — §13 Phase 3, §14 Phase 5)
  2. supabase/migrations/0007_v2_*.sql → 0019_v2_*.sql + 0020_fix_v2_runtime_compat.sql
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
  - édition des fichiers supabase/migrations/0007→0020 et migrations-v2-draft/
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
  - toute application de 0007→0020 sur la production
  - toute écriture sur le schéma distant de production
  - création de la migration 0021+ de legacy cleanup destructif
    (0020 est pris par 0020_fix_v2_runtime_compat.sql, non destructif)
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
- [x] **Phase 5B.1** — corrections D1/D2/D3/D5 via `0020_fix_v2_runtime_compat.sql` (non destructif) + `seed.sql` ; rejeu des tests = PASS ; `READY_FOR_PHASE_5C = YES`. D4 laissé ouvert (décision produit). Voir §14.
- [ ] **Phase 5C** — tests fonctionnels complets backoffice / rôles / parcours multi-organisation contre Supabase local V2 (`0001→0020` + seed)
- [ ] backup production (Docker/psql sur une autre machine, ou dump SQL Editor)
- [ ] plan rollback documenté
- [ ] migration production (`db push` du projet lié, fenêtre de maintenance)
- [ ] validation production (parcours critiques + assertions)
- [ ] période de coexistence (front v2 déployé, colonnes V1 encore là)
- [ ] cutover (front v2 = seul en prod)
- [ ] **seulement ensuite** : migration **`0021+`** — legacy cleanup destructif (DROP colonnes/tables/policies V1, DROP triggers `*_v1_compat`, retour `park_public` à `p.*`, DROP enums V1 obsolètes). ⚠️ le numéro `0020` initialement prévu pour ce lot est désormais pris par `0020_fix_v2_runtime_compat.sql` (non destructif).

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
| 2026-08-30 | 5B.1 | **PASS.** Corrections D1/D2/D3/D5. Nouvelle migration **non destructive** `0020_fix_v2_runtime_compat.sql` : D1 (`link_team_member_on_signup` → `SET search_path=''` + objets `public.*` qualifiés), D2 (`audit_log_read` → `entity_type='parks'`), D3 (`parks_update` reconnaît `can_edit_park()` avec `USING`+`WITH CHECK` ; branche V1 `commune_id` conservée ; `parks_public_read`+`parks_delete` alignées V2 ; `parks_insert` inchangée). D5 : `seed.sql` (+11 lignes) crée les `communes` miroir (`communes` **non** canonique V2). **⚠️ Le numéro `0020` initialement réservé au legacy cleanup destructif est réaffecté → cleanup destructif = `0021+` (toujours INTERDIT).** Vrai `supabase.auth.signUp()` testé (session + profiles + team link OK). Matrice `parks_update` A/B avec comptage de lignes (aucun 0-row silencieux pour un acteur autorisé). D4 laissé ouvert (décision produit). `AUTH_RUNTIME`/`PARK_UPDATE_RLS`/`AUDIT_RLS`/`V1_V2_COMPAT`/`DATA_INTEGRITY`/`TYPECHECK`/`MOBILE_BUILD`/`BACKOFFICE_BUILD` = PASS. `READY_FOR_PHASE_5C = YES`. Non commité (checkpoint) : `supabase/migrations/0020_fix_v2_runtime_compat.sql` + `supabase/seed.sql`. |
