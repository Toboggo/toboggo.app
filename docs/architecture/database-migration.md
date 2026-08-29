# Toboggo — Chantier de migration Supabase V1 → V2 (BDD mondiale)

> **SOURCE DE VÉRITÉ du chantier.** À mettre à jour à la fin de chaque phase.
> Aucun secret / token / mot de passe ici.
> Dernière mise à jour : **2026-08-30** — fin de Phase 2D.

Ce document permet à une nouvelle session Claude Code (sans accès à l'historique
de conversation) de reprendre le chantier sans reperdre une décision ni refaire
les audits. Lire **§11 CHECKPOINT** en premier.

---

## 1. État actuel

| Élément | État |
|---|---|
| **Production Supabase** (projet lié `dfzrsygetbhnjzfssgub`) | **V1** — schéma plat pré-PDF, jamais migré vers v2 |
| **Migrations réellement déployées** | `0001 → 0006` = les 6 fichiers historiques (voir §3) |
| `supabase/migrations/` | Historique réel `0001_init … 0006_admin_user_moderation` **+** migrations incrémentales `0007 → 0019` (DRAFT, non déployées) |
| `supabase/migrations-v2-draft/` | Architecture cible **from-scratch de référence uniquement** (`0001_schema … 0005_fix_signup_trigger`). **NE PAS appliquer.** Sert de spec + de cible pour `supabase gen types` post-cutover. |
| `packages/shared/src/types/database.types.ts` | Généré depuis la **vraie DB distante V1** (`supabase gen types --linked`). Reflète donc le schéma V1 (table `communes`, `parks` plat, `park_edit_history`, etc.). |
| `packages/shared/src/supabaseClient.ts` | `createClient<Database>` typé contre V1 → révèle 110 incompatibilités code↔schéma (voir §7 Phase 1B). **Volontairement laissé en erreur** — c'est l'instrument de mesure jusqu'au cutover. |
| `supabase/inventory-pre-v2.sql` | Script READ-ONLY d'inventaire prod, déjà exécuté (résultats en §2). |
| **Git** | Repo `github.com/Toboggo/toboggo.app` branche `main`. **La réconciliation de l'historique (Phase 2A) n'a jamais été commitée** : `supabase/migrations/*` et `supabase/migrations-v2-draft/*` sont **untracked** ; HEAD contient encore les anciens `migrations/0001_schema.sql…0005` (v2 from-scratch). Le disque est correct ; il faut committer l'état. |

### Reconstruction de l'historique (fait en Phase 2A/2B, non commité)

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
5. **Aucun `DROP TABLE` / `DROP COLUMN` / `DELETE` / `TRUNCATE`** dans `0007→0019`. Seuls `DROP` admis : `DROP FUNCTION nearby_parks` (changement de type de retour, recréée immédiatement) et `DROP TRIGGER IF EXISTS x` (chacun recréé aussitôt).
6. **Le nettoyage legacy = migration `0020`**, à écrire **seulement après cutover du front V2**. Contient tous les `DROP` de colonnes/tables/policies V1. Destructif, irréversible.
7. **`recalculate_park_score`** : `SECURITY INVOKER` (pas DEFINER) → soumis à la policy `park_scores_write` (moindre privilège).
8. **`nearby_parks`** : stratégie `DROP + CREATE` retenue (auditée sûre) — pas de `nearby_parks_v2`.

---

## 6. Migrations 0007 → 0019

Toutes en `supabase/migrations/`. État : **DRAFT → AUDITED (2C) → FIXED (2D)**. Prochaine étape : **TESTED** (sur DB locale/staging).

| # | Fichier | Objectif | État | Dépend de | Points particuliers |
|---|---|---|---|---|---|
| 0007 | `0007_v2_enums_extensions.sql` | 18 enums v2 manquants ; `pg_trgm` ; `report_status += in_progress` | FIXED (SAFE_WITH_NOTE) | — | `ALTER TYPE ADD VALUE` in-transaction : OK PG≥12, **à confirmer au 1er `db push --dry-run`** |
| 0008 | `0008_v2_organizations.sql` | `organizations` + `organization_parks` ; backfill communes/6 relations | FIXED (SAFE) | 0007 | UUID communes préservés |
| 0009 | `0009_v2_parks_columns.sql` | +21 colonnes v2 sur `parks` ; `location` généré ; index ; trigger `parks_v1_compat` | FIXED (SAFE_WITH_NOTE) | 0007 | trigger **bidirectionnel** ; `country_code`/`timezone` NOT NULL **sans DEFAULT** ; INSERT V1 exige quand même ces 2 champs (voulu) |
| 0010 | `0010_v2_features.sql` | `features` + seed catalogue + `park_features` + backfill (règles §5) | FIXED (SAFE) | 0009 | assertions : 0 `unavalaible`, value domains, tout code play mappé ; 182 lignes attendues |
| 0011 | `0011_v2_media.sql` | `park_media` + backfill `parks.photos[]` (0 ligne) | FIXED (SAFE) | 0009 | requête générique sûre si array vide |
| 0012 | `0012_v2_park_details.sql` | 11 tables filles v2 (vides) ; FK différées `park_features.source_id`, `park_media.zone_id` ; `maintenance.zone_id/equipment_id` | FIXED (SAFE) | 0008, 0010, 0011 | assertion `c_rows=0` **retirée** → intégrité référentielle (portable staging) |
| 0013 | `0013_v2_reviews.sql` | +9 colonnes v2 sur `reviews` ; `rating NOT NULL` ; check ; trigger `reviews_v1_compat` | FIXED (SAFE) | 0007 | trigger **bidirectionnel** `rating↔stars`, `status↔flagged` |
| 0014 | `0014_v2_reports.sql` | +7 colonnes v2 sur `reports` ; `category NOT NULL` ; trigger `reports_v1_compat` | FIXED (SAFE) | 0007, 0012 | trigger **bidirectionnel** `category↔reason`, `equipment↔equipment_label`, `comment↔description` |
| 0015 | `0015_v2_audit.sql` | `audit_log` + backfill `park_edit_history` (0 ligne) | FIXED (SAFE) | — | perte connue : `actor` texte → `source` |
| 0016 | `0016_v2_organization_columns.sql` | `organization_id` sur team_members/maintenance/activity_log + FK + triggers | FIXED (SAFE) | 0008 | triggers `IS DISTINCT FROM` → `SET organization_id = NULL` possible en UPDATE ; backfill : 2 super_admin → NULL, gestionnaire → même UUID |
| 0017 | `0017_v2_functions.sql` | triggers recompute/audit ; `fstatus`/`fvalue` ; vue `park_public` ; `nearby_parks` v2 ; `find_duplicate_parks` ; `recalculate_park_score` | FIXED (SAFE) | 0008–0015 | `park_public` = **liste explicite** (pas `p.*`, collision colonnes V1) ; `has_score` = `coalesce(...,false)` ; `nearby_parks` DROP+CREATE ; `SET search_path` sur 5 SECDEF ; `recalculate_park_score` en INVOKER |
| 0018 | `0018_v2_rls.sql` | helpers v2 (`org_role` priorisé) ; RLS + policies sur les 17 tables nouvelles ; faille `organization_parks` corrigée | FIXED (SAFE) | 0016, 0017 | `SET search_path` sur 8 helpers ; policies `organization_parks` séparées + trigger `organization_parks_guard` ; **ne touche PAS** les policies V1 de parks/reviews/reports (coexistence) |
| 0019 | `0019_v2_grants.sql` | `REVOKE ALL` + `GRANT` ciblé (Supabase grant-all par défaut) ; re-grant `nearby_parks` post-DROP | FIXED (SAFE) | 0017, 0018 | anon = lecture seule ; `audit_log` append-only ; `park_duplicate_candidates` lecture seule (écritures = `service_role`) |

**`migrations-v2-draft/`** aussi corrigé en Phase 2D (cohérence du schéma cible) : `0002_functions.sql` (`search_path` sur 6 SECDEF + `delete_own_account` ; `recalculate_park_score` INVOKER ; `has_score` coalesce) et `0003_rls.sql` (faille `organization_parks` + `search_path` sur 8 helpers).

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

**NE PAS**, tant que les étapes de test ne sont pas validées :

- ❌ `supabase db push`
- ❌ `supabase db reset` (local ou linked)
- ❌ `supabase migration repair`
- ❌ appliquer `0007 → 0019` en **production**
- ❌ créer la migration `0020` (legacy cleanup)
- ❌ supprimer / altérer les colonnes ou tables V1
- ❌ modifier le schéma distant de quelque manière que ce soit
- ❌ committer un secret / token / mot de passe DB

**Autorisé** : lecture seule distante (`supabase migration list --linked`, `supabase gen types --linked`, SQL Editor `SELECT`), édition locale des fichiers de migration, tests sur une DB **locale/staging jetable**.

---

## 11. CHECKPOINT ACTUEL

> **⚠️ Section critique — lire en premier, mettre à jour à chaque phase.**

```
DERNIÈRE ÉTAPE TERMINÉE :
  Phase 2D — corrections de l'audit statique sur 0007→0019
  (+ alignement migrations-v2-draft/0002 & 0003).
  Tous les FIX_REQUIRED (0013, 0014) résolus.

VERDICT :
  READY_FOR_LOCAL_TEST
  (1 point à confirmer au 1er `db push --dry-run` : ALTER TYPE ADD VALUE
   in-transaction en 0007 — OK PostgreSQL >= 12, Supabase = 15/17.)

PROCHAINE ÉTAPE :
  Tester l'application de 0001→0019 + seed.sql sur une base
  LOCALE/STAGING JETABLE (jamais la prod). Vérifier que toutes les
  assertions RAISE EXCEPTION passent. Puis, contre cette base v2 :
  regénérer database.types.ts, relancer le typecheck du monorepo
  (les 110 erreurs Phase 1B doivent disparaître), puis attaquer la
  correction des APIs shared restantes (GROUPE 3).

FICHIERS À LIRE (dans l'ordre) :
  1. docs/architecture/database-migration.md  (ce fichier)
  2. supabase/migrations/0007_v2_*.sql → 0019_v2_*.sql
  3. supabase/migrations/0001_init.sql → 0006_admin_user_moderation.sql (V1 déployé)
  4. supabase/migrations-v2-draft/0001_schema.sql → 0003_rls.sql (cible de référence)
  5. supabase/inventory-pre-v2.sql  (+ résultats en §2 de ce doc)
  6. packages/shared/src/types/database.types.ts (schéma V1 actuel)
  7. packages/shared/src/api/*.ts + packages/shared/src/types.ts

COMMANDES AUTORISÉES :
  - supabase migration list --linked            (read-only)
  - supabase gen types typescript --linked ...   (read-only)
  - SQL Editor : SELECT uniquement
  - npm run typecheck / npm run build            (local)
  - édition des fichiers supabase/migrations/0007→0019 et migrations-v2-draft/
  - git add / git commit  (état local à figer)
  - sur une DB LOCALE/STAGING jetable : supabase db reset / db push / psql

COMMANDES INTERDITES (voir §10) :
  - supabase db push / db reset / migration repair CONTRE LE PROJET LIÉ (prod)
  - toute écriture sur le schéma distant
  - création de 0020
```

---

## 12. Roadmap restante

- [x] Phase 2D corrections
- [x] nouvel audit statique (Phase 2D → READY_FOR_LOCAL_TEST)
- [ ] **test migrations sur DB locale/staging** (0001→0019 + seed)
- [ ] assertions post-migration (toutes les `RAISE EXCEPTION` passent)
- [ ] génération `database.types.ts` **V2** (depuis la staging v2)
- [ ] typecheck frontend (les 110 erreurs Phase 1B doivent tomber à ~0)
- [ ] correction des APIs shared restantes (GROUPE 3 : parks, parkDetails, features, contributions, team, maintenance, communityFeed…)
- [ ] tests mobile (carte, détail parc, filtres, ajout parc, avis, signalement)
- [ ] tests backoffice (login/routing org, Parks, Dashboard, Reports, Maintenance…)
- [ ] tests RLS multi-organizations (isolation A/B, super_admin, `organization_parks_guard`)
- [ ] backup production (Docker/psql sur une autre machine, ou dump SQL Editor)
- [ ] plan rollback documenté
- [ ] migration production (`db push` du projet lié, fenêtre de maintenance)
- [ ] validation production (parcours critiques + assertions)
- [ ] période de coexistence (front v2 déployé, colonnes V1 encore là)
- [ ] cutover (front v2 = seul en prod)
- [ ] **seulement ensuite** : migration `0020` — legacy cleanup (DROP colonnes/tables/policies V1, DROP triggers `*_v1_compat`, retour `park_public` à `p.*`, DROP enums V1 obsolètes)

---

## Historique des mises à jour

| Date | Phase | Résumé |
|---|---|---|
| 2026-08-30 | 2D | Corrections audit ; 13 migrations FIXED ; verdict READY_FOR_LOCAL_TEST ; création de ce fichier. |
