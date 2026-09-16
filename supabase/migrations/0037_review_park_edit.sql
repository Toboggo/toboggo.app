-- ════════════════════════════════════════════════════════════════════════════
-- 0037 — review_park_edit() : moteur transactionnel d'acceptation/rejet d'une
--        proposition `park_edits`, avec APPLICATION RÉELLE au parc.
-- ────────────────────────────────────────────────────────────────────────────
-- CONTEXTE (Admin-3A, conception validée — décisions 1, 2, 3)
-- ---------------------------------------------------------------------------
-- Aujourd'hui `reviewParkEdit()` (packages/shared/src/api/contributions.ts)
-- se contente de changer `park_edits.status` — vérifié en lisant le repo :
-- `apply_park_attribute` (0032) n'a aucun lien avec `park_edits`, et
-- `reviewParkEdit()` n'a 0 appelant réel (0 écran BO, 0 écran mobile).
-- Décision produit : APPROUVÉ doit signifier "réellement appliqué au parc",
-- jamais "juste marqué traité".
--
-- NUMÉROTATION — au moment d'écrire ce fichier, la base locale PARTAGÉE
-- (Docker `supabase_db_Toboggo_App`, utilisée par tous les worktrees) porte
-- déjà `0035_notifications_insert_hardening` et `0036_parks_moderation_guard`,
-- appliquées par une AUTRE session sur un AUTRE worktree — ces fichiers
-- n'existent PAS dans `feature/admin-foundation` (supabase/migrations/
-- s'arrête à 0034 dans ce worktree au moment de cette écriture). `0037` est
-- choisi volontairement pour ne pas entrer en collision de nom avec ce
-- travail concurrent sur la base locale partagée.
-- AUCUNE dépendance fonctionnelle sur 0035/0036 : leur contenu réel a été lu
-- (lecture seule, via `supabase_migrations.schema_migrations.statements`)
-- avant d'écrire ce fichier — 0035 ne touche que `notifications` ; 0036
-- ajoute un trigger sur `parks` qui ne garde QUE les colonnes
-- `moderation_status`/`status`, jamais touchées par `review_park_edit()`
-- (qui ne modifie que `min_age`/`max_age`/`latitude`/`longitude` via
-- `apply_park_attribute`, et `park_features.status`). Cette migration ne
-- référence que des objets déjà présents en 0001→0034.
--
-- MODÈLE A/B/C (par item de `park_edits.changes.items[]`)
-- ---------------------------------------------------------------------------
--   A = valeur "current" au moment de la soumission (snapshot mobile, figé)
--   B = valeur RÉELLE actuelle du parc, relue EN DIRECT dans cette transaction
--   C = valeur "proposed"
-- Classification (ordre important — ALREADY_APPLIED testé AVANT APPLICABLE,
-- pour couvrir A == B == C sans ambiguïté) :
--   B == C             → ALREADY_APPLIED        (rien à écrire)
--   B == A (donc B≠C)  → APPLICABLE              (C est appliqué)
--   sinon (B≠A et B≠C) → CONFLICT                (jamais appliqué auto)
--   free_text / field inconnu → NOT_AUTOMATICALLY_APPLICABLE
--
-- 4 formes réelles de `field` (seul producteur : apps/mobile/…/EditInfo.tsx) :
--   "ages"           → parks.min_age / parks.max_age (clé "min"/"max" des
--                       DEUX côtés — pas d'incohérence ici).
--   "location"       → parks.latitude/longitude. INCOHÉRENCE RÉELLE des
--                       données existantes : current = {latitude,longitude},
--                       proposed = {lat,lng} — normalisée explicitement ici.
--                       Comparaison avec tolérance 1e-6 (flottants).
--   "feature:<code>" → park_features.status, résolu via features.code.
--                       Absence de ligne park_features = "unknown" implicite.
--   "free_text"      → aucune colonne cible, jamais appliqué.
--
-- ATOMICITÉ (décision 2) — résultats MÉTIER vs erreurs TECHNIQUES :
--   CONFLICT / NOT_AUTOMATICALLY_APPLICABLE sont des résultats métier
--   normaux : la boucle continue avec les items suivants.
--   Un échec SQL, un code de feature introuvable, un échec interne
--   d'apply_park_attribute (gate de priorité, cast invalide, etc.) N'EST PAS
--   intercepté ici (aucun bloc BEGIN/EXCEPTION autour des applications,
--   volontairement) : il remonte tel quel et fait échouer toute la fonction
--   — comportement PL/pgSQL par défaut = ROLLBACK complet de la transaction,
--   y compris les items déjà appliqués plus tôt dans la même boucle.
--
-- STATUT FINAL (décision 3) :
--   `approved` seulement si au moins un item est APPLICABLE (et donc
--   effectivement appliqué) ou ALREADY_APPLIED. Si `approve` est demandé
--   mais que TOUS les items sont CONFLICT et/ou NOT_AUTOMATICALLY_APPLICABLE,
--   le statut RESTE `pending` et le résultat est `requires_manual_review` —
--   `reviewed_by`/`reviewed_at`/`review_note` NE sont PAS écrits dans ce cas
--   (rien n'a été décidé ; la proposition doit rester réellement "en attente"
--   et retraitable plus tard, pas dans un demi-état "revue mais pas revue").
--   `reject` passe toujours à `rejected`, quels que soient les items (aucune
--   application n'est jamais tentée pour un rejet).
--
-- PERMISSIONS — imposées PAR LA FONCTION, pas seulement par la RLS table :
--   Staff  : is_toboggo_admin() uniquement (super_admin/moderation).
--            `support` est staff (is_toboggo_staff) mais explicitement REFUSÉ
--            ici — is_toboggo_admin() l'exclut par construction (0002/0018).
--   Collectivité : is_org_gestionnaire() sur l'organisation RÉELLEMENT
--            propriétaire du parc (résolue via `organization_parks` à partir
--            de `park_edits.park_id` — JAMAIS depuis `park_edits.
--            organization_id`, qui n'est qu'une métadonnée fournie par le
--            client au moment de la soumission, non fiable pour une décision
--            de sécurité — même principe que `apply_park_attribute` (0032)
--            qui ignore `p_source_type` en contexte authentifié).
--            `contributeur` explicitement refusé (is_org_gestionnaire filtre
--            sur `role = 'gestionnaire'`, pas `manages_park()` qui accepte
--            tout membre sans filtre de rôle — 0018_v2_rls.sql:69-75).
--   Aligné sur `apps/backoffice/src/lib/permissions.ts` (`canEditPark` :
--   "the product intends only gestionnaire+/staff to edit...") et sur le
--   garde-fou 0036 (`parks_moderation_guard`) qui applique la MÊME
--   distinction rôle-strict pour un besoin voisin (confirmé en lisant son
--   contenu réel sur la base locale avant d'écrire ce fichier).
--
-- SECURITY INVOKER (pas DEFINER) — analyse, pas un choix mécanique :
--   Chaque écriture interne de cette fonction a été vérifiée contre la RLS
--   RÉELLEMENT active (pas supposée) :
--     parks                  → parks_update (0020)      : can_edit_park()
--     park_features           → park_features_write (0018): can_edit_park()
--     park_sources/park_attribute_sources (via apply_park_attribute)
--                              → *_write (0018)           : can_edit_park()
--     park_edits               → park_edits_update (0018) : manages_park()
--     audit_log                → audit_log_insert (0018)  : auth.uid() is not null
--   `can_edit_park()` = `created_by = uid OR manages_park()`, et
--   `manages_park()` inclut déjà tout membre de l'organisation propriétaire
--   OU le staff. Un gestionnaire légitime de l'organisation propriétaire, ou
--   un staff éligible, dispose donc DÉJÀ de tous les droits RLS nécessaires
--   sous SA PROPRE session — aucune RLS ne bloque un appelant légitime.
--   Le filtre plus strict que la RLS (support/contributeur exclus) est donc
--   imposé PAR CETTE FONCTION, EN PLUS de la RLS — pas à sa place.
--   SECURITY DEFINER supprimerait cette 2ᵉ couche de défense (RLS totalement
--   contournée pour toutes les écritures) sans lever aucun blocage réel,
--   puisqu'aucun n'existe pour un appelant légitime : ce serait un privilège
--   élevé inutile, contraire au principe de moindre privilège déjà suivi par
--   `apply_park_attribute`/`recalculate_park_score` (0017/0032) et à
--   CLAUDE.md §5 (élever les privilèges seulement quand strictement
--   nécessaire). SECURITY INVOKER retenu.
--
-- NON DESTRUCTIF : aucune ancienne migration modifiée, aucune policy RLS
-- touchée, aucune table/colonne supprimée. Un seul objet nouveau :
-- la fonction `review_park_edit()`.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function review_park_edit(
  p_edit_id uuid,
  p_decision text,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid                 uuid := auth.uid();
  v_edit                record;
  v_org_id               uuid;
  v_authorized           boolean := false;

  v_item                 jsonb;
  v_field                text;
  v_label                text;
  v_result               text;
  v_applied              boolean;
  v_items_out            jsonb := '[]'::jsonb;
  v_applied_fields        jsonb := '[]'::jsonb;
  v_already_fields        jsonb := '[]'::jsonb;
  v_conflict_fields       jsonb := '[]'::jsonb;
  v_manual_fields         jsonb := '[]'::jsonb;
  v_has_applied_or_already boolean := false;
  v_final_status         edit_status;
  v_outcome              text;
  v_b_eq_a               boolean;
  v_b_eq_c               boolean;

  -- ages
  v_b_min smallint; v_b_max smallint;
  v_a_min smallint; v_a_max smallint;
  v_c_min smallint; v_c_max smallint;

  -- location (normalisation current={latitude,longitude} / proposed={lat,lng})
  v_b_lat numeric; v_b_lng numeric;
  v_a_lat numeric; v_a_lng numeric;
  v_c_lat numeric; v_c_lng numeric;

  -- feature:<code>
  v_feature_code text;
  v_feature_id   uuid;
  v_b_status     text;
  v_a_status     text;
  v_c_status     text;
begin
  if v_uid is null then
    raise exception 'review_park_edit: authentification requise (reviewer déterminé par auth.uid())'
      using errcode = 'insufficient_privilege';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'review_park_edit: décision invalide «%» (attendu approve|reject)', p_decision
      using errcode = 'check_violation';
  end if;

  -- ── Verrouillage + lecture ────────────────────────────────────────────────
  -- `FOR UPDATE` : un 2ᵉ appelant concurrent sur la MÊME proposition bloque
  -- ici jusqu'au commit/rollback du premier, puis relit le statut à jour.
  select * into v_edit from park_edits where id = p_edit_id for update;
  if not found then
    -- Peut aussi être le résultat d'un filtrage RLS (park_edits_read) plutôt
    -- que d'une absence réelle — comportement voulu : ne pas distinguer
    -- "n'existe pas" de "hors de votre périmètre" (pas de fuite d'info).
    raise exception 'review_park_edit: proposition % introuvable ou hors périmètre', p_edit_id
      using errcode = 'no_data_found';
  end if;

  if v_edit.status <> 'pending' then
    return jsonb_build_object(
      'outcome', 'already_reviewed',
      'status', v_edit.status,
      'reviewed_by', v_edit.reviewed_by,
      'reviewed_at', v_edit.reviewed_at
    );
  end if;

  if v_edit.park_id is null then
    raise exception 'review_park_edit: proposition % sans park_id — type de proposition non supporté (aucun producteur actuel)', p_edit_id
      using errcode = 'check_violation', hint = 'unsupported_edit_type';
  end if;

  -- ── Permissions imposées ici, en plus de la RLS (voir en-tête) ───────────
  if is_toboggo_admin(v_uid) then
    v_authorized := true;
  else
    select op.organization_id into v_org_id
    from organization_parks op
    where op.park_id = v_edit.park_id and is_org_gestionnaire(v_uid, op.organization_id)
    limit 1;
    v_authorized := v_org_id is not null;
  end if;

  if not v_authorized then
    raise exception 'review_park_edit: acteur % non autorisé à traiter les propositions du parc %', v_uid, v_edit.park_id
      using errcode = 'insufficient_privilege';
  end if;

  -- ── REJECT : aucune application, changement de statut uniquement ─────────
  if p_decision = 'reject' then
    update park_edits set
      status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
    where id = p_edit_id;

    insert into audit_log (entity_type, entity_id, action, new_value, actor_id)
    values ('park_edits', p_edit_id, 'review', jsonb_build_object(
      'reviewer', v_uid, 'decision', 'reject', 'outcome', 'rejected',
      'applied', '[]'::jsonb, 'already_applied', '[]'::jsonb,
      'conflicts', '[]'::jsonb, 'manual', '[]'::jsonb
    ), v_uid);

    return jsonb_build_object('outcome', 'rejected', 'status', 'rejected', 'items', '[]'::jsonb);
  end if;

  -- ── APPROVE : classification + application item par item ────────────────
  for v_item in select * from jsonb_array_elements(coalesce(v_edit.changes -> 'items', '[]'::jsonb))
  loop
    v_field   := v_item ->> 'field';
    v_label   := coalesce(v_item ->> 'label', v_field);
    v_applied := false;

    if v_field = 'ages' then
      v_a_min := (v_item -> 'current'  ->> 'min')::smallint;
      v_a_max := (v_item -> 'current'  ->> 'max')::smallint;
      v_c_min := (v_item -> 'proposed' ->> 'min')::smallint;
      v_c_max := (v_item -> 'proposed' ->> 'max')::smallint;
      select min_age, max_age into v_b_min, v_b_max from parks where id = v_edit.park_id;

      v_b_eq_c := (v_b_min is not distinct from v_c_min) and (v_b_max is not distinct from v_c_max);
      v_b_eq_a := (v_b_min is not distinct from v_a_min) and (v_b_max is not distinct from v_a_max);

      if v_b_eq_c then
        v_result := 'ALREADY_APPLIED'; v_applied := true;
      elsif v_b_eq_a then
        v_result := 'APPLICABLE'; v_applied := true;
        -- deux attributs séparés (comme applyProvenanceAttributes côté TS) ;
        -- une moitié absente du JSON (clé manquante OU null) n'est pas
        -- envoyée — apply_park_attribute rejette explicitement un JSON null.
        if v_c_min is not null then perform apply_park_attribute(v_edit.park_id, 'min_age', to_jsonb(v_c_min), null, null); end if;
        if v_c_max is not null then perform apply_park_attribute(v_edit.park_id, 'max_age', to_jsonb(v_c_max), null, null); end if;
      else
        v_result := 'CONFLICT';
      end if;

    elsif v_field = 'location' then
      v_a_lat := (v_item -> 'current'  ->> 'latitude')::numeric;
      v_a_lng := (v_item -> 'current'  ->> 'longitude')::numeric;
      v_c_lat := (v_item -> 'proposed' ->> 'lat')::numeric;
      v_c_lng := (v_item -> 'proposed' ->> 'lng')::numeric;
      select latitude, longitude into v_b_lat, v_b_lng from parks where id = v_edit.park_id;

      v_b_eq_c := v_b_lat is not null and v_b_lng is not null and v_c_lat is not null and v_c_lng is not null
                  and abs(v_b_lat - v_c_lat) <= 0.000001 and abs(v_b_lng - v_c_lng) <= 0.000001;
      v_b_eq_a := v_b_lat is not null and v_b_lng is not null and v_a_lat is not null and v_a_lng is not null
                  and abs(v_b_lat - v_a_lat) <= 0.000001 and abs(v_b_lng - v_a_lng) <= 0.000001;

      if v_b_eq_c then
        v_result := 'ALREADY_APPLIED'; v_applied := true;
      elsif v_b_eq_a then
        v_result := 'APPLICABLE'; v_applied := true;
        perform apply_park_attribute(v_edit.park_id, 'location', jsonb_build_object('lat', v_c_lat, 'lng', v_c_lng), null, null);
      else
        v_result := 'CONFLICT';
      end if;

    elsif v_field like 'feature:%' then
      v_feature_code := substring(v_field from 9); -- après 'feature:' (8 car.)
      select id into v_feature_id from features where code = v_feature_code;
      if v_feature_id is null then
        -- Code de feature invalide sur un item censé être traité : erreur
        -- TECHNIQUE (décision 2), pas un résultat métier — non interceptée,
        -- fait échouer/rollback toute la fonction.
        raise exception 'review_park_edit: code de feature inconnu «%» (proposition %)', v_feature_code, p_edit_id;
      end if;

      v_a_status := v_item ->> 'current';
      v_c_status := v_item ->> 'proposed';
      select status::text into v_b_status from park_features where park_id = v_edit.park_id and feature_id = v_feature_id;
      v_b_status := coalesce(v_b_status, 'unknown');

      v_b_eq_c := v_b_status is not distinct from v_c_status;
      v_b_eq_a := v_b_status is not distinct from v_a_status;

      if v_b_eq_c then
        v_result := 'ALREADY_APPLIED'; v_applied := true;
      elsif v_b_eq_a then
        v_result := 'APPLICABLE'; v_applied := true;
        insert into park_features (park_id, feature_id, status, verified_at)
        values (
          v_edit.park_id, v_feature_id, v_c_status::feature_status,
          case when v_c_status in ('available', 'unavailable') then now() else null end
        )
        on conflict (park_id, feature_id) do update
          set status = excluded.status, verified_at = excluded.verified_at, updated_at = now();
      else
        v_result := 'CONFLICT';
      end if;

    else
      -- "free_text" ou tout field non reconnu (robustesse vers un futur
      -- client mobile différent) : jamais appliqué automatiquement.
      v_result := 'NOT_AUTOMATICALLY_APPLICABLE';
    end if;

    v_items_out := v_items_out || jsonb_build_object(
      'field', v_field, 'label', v_label, 'result', v_result, 'applied', v_applied
    );

    if v_result = 'APPLICABLE' then
      v_has_applied_or_already := true;
      v_applied_fields := v_applied_fields || to_jsonb(v_field);
    elsif v_result = 'ALREADY_APPLIED' then
      v_has_applied_or_already := true;
      v_already_fields := v_already_fields || to_jsonb(v_field);
    elsif v_result = 'CONFLICT' then
      v_conflict_fields := v_conflict_fields || to_jsonb(v_field);
    else
      v_manual_fields := v_manual_fields || to_jsonb(v_field);
    end if;
  end loop;

  if v_has_applied_or_already then
    v_final_status := 'approved';
    v_outcome := 'approved';
    update park_edits set
      status = v_final_status, reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
    where id = p_edit_id;

    -- Trace d'audit UNIQUEMENT pour une vraie décision finale (approved).
    -- `requires_manual_review` n'en est pas une : voir branche `else`
    -- ci-dessous — aucune entrée n'y est créée, pour qu'un Admin qui
    -- retente "Approuver" plusieurs fois sur une proposition toujours en
    -- conflit n'accumule pas d'entrées audit_log donnant l'illusion d'une
    -- décision prise. Les triggers génériques (`park_edits_audit`, `parks_
    -- audit_upd`) ne s'en chargeraient pas non plus : ils ne réagissent qu'à
    -- un véritable UPDATE, qui n'a lieu que dans cette branche.
    insert into audit_log (entity_type, entity_id, action, new_value, actor_id)
    values ('park_edits', p_edit_id, 'review', jsonb_build_object(
      'reviewer', v_uid, 'decision', 'approve', 'outcome', v_outcome,
      'applied', v_applied_fields, 'already_applied', v_already_fields,
      'conflicts', v_conflict_fields, 'manual', v_manual_fields
    ), v_uid);
  else
    -- decision 3 : rien n'a été résolu -> reste "pending", PAS de
    -- reviewed_by/reviewed_at/review_note (rien n'a été décidé), pour rester
    -- retraitable plus tard sans faux air de "déjà revu". PAS d'entrée
    -- audit_log explicite non plus (même raisonnement) : un `outcome =
    -- requires_manual_review` n'est pas une décision, juste une tentative
    -- sans effet — pas de bruit dans l'audit pour ce V1.
    v_final_status := 'pending';
    v_outcome := 'requires_manual_review';
  end if;

  return jsonb_build_object('outcome', v_outcome, 'status', v_final_status, 'items', v_items_out);
end;
$$;

comment on function review_park_edit(uuid, text, text) is
  'Admin-3A — accepte/rejette une proposition park_edits. approve applique '
  'réellement les items APPLICABLE/ALREADY_APPLIED (ages/location via '
  'apply_park_attribute, feature:<code> via park_features), jamais les '
  'CONFLICT/NOT_AUTOMATICALLY_APPLICABLE. status=approved seulement si au '
  'moins un item a été appliqué ou l''était déjà, sinon reste pending avec '
  'outcome=requires_manual_review. SECURITY INVOKER : RLS de l''appelant + '
  'filtre de rôle strict (is_toboggo_admin / is_org_gestionnaire) imposé en '
  'interne.';

-- ════════════════════════════════════════════════════════════════════════════
-- Assertions structurelles (rôle `postgres`, pas d'auth.uid() — comme 0032).
-- La couverture fonctionnelle/permissions complète (18 scénarios, tous
-- dépendants d'un `auth.uid()` réel puisque la fonction rejette l'appel
-- anonyme dès sa 1ʳᵉ ligne) vit dans supabase/tests/review_park_edit.test.sql
-- — même split que apply_park_attribute (0032) / park_attribute_provenance
-- .test.sql : ce qui se vérifie sans session utilisateur reste ici, ce qui
-- dépend d'un acteur authentifié va dans supabase/tests/.
-- ════════════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regprocedure('review_park_edit(uuid,text,text)') is null then
    raise exception '0037: review_park_edit(uuid,text,text) absente';
  end if;

  -- SECURITY INVOKER (jamais DEFINER) — voir en-tête "SECURITY INVOKER"
  if (select prosecdef from pg_proc
      where oid = 'review_park_edit(uuid,text,text)'::regprocedure) then
    raise exception '0037: review_park_edit ne doit pas être SECURITY DEFINER';
  end if;

  -- search_path épinglé
  if not exists (
    select 1 from pg_proc p, unnest(coalesce(p.proconfig, array[]::text[])) c
    where p.oid = 'review_park_edit(uuid,text,text)'::regprocedure
      and c like 'search_path=%'
  ) then
    raise exception '0037: review_park_edit sans search_path épinglé';
  end if;

  -- les primitives réutilisées existent toujours (aucune recréation ici)
  if to_regprocedure('apply_park_attribute(uuid,text,jsonb,source_type,numeric)') is null
     or to_regprocedure('is_toboggo_admin(uuid)') is null
     or to_regprocedure('is_org_gestionnaire(uuid,uuid)') is null then
    raise exception '0037: primitives réutilisées (0002/0018/0032) manquantes';
  end if;

  raise notice '0037 OK — assertions structurelles PASS';
end $$;
