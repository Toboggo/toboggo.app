-- ════════════════════════════════════════════════════════════════════════════
-- 0053 — audit_log : plus aucune écriture directe par le client (P1-B)
-- ────────────────────────────────────────────────────────────────────────────
-- ADDITIF / NON DESTRUCTIF : aucune donnée supprimée ou modifiée, aucune colonne
-- retirée. Une policy retirée, un privilège retiré, une fonction réécrite à
-- l'identique sauf deux appels (voir 3.).
--
-- CAUSE
--   `audit_log_insert` (0018) vaut `with check (auth.uid() is not null)` et
--   `authenticated` a INSERT sur la table : tout utilisateur connecté peut écrire une
--   entrée d'audit sur n'importe quelle ressource (ex. un parc d'une autre collectivité),
--   avec `actor_id` (n'importe quel utilisateur, ex. un admin) et `source` de son choix.
--   Ces entrées sont ensuite lues par les gestionnaires du parc et par le staff
--   (`audit_log_read`) comme des traces authentiques.
--
-- ÉCRITURES LÉGITIMES (inventaire du code, voir la PR)
--   • trigger `audit_row()` (parks, park_equipment, reports, organizations, park_edits…) :
--     SECURITY DEFINER, propriétaire de la table → INSERT hors RLS : INCHANGÉ ;
--   • `review_park_edit()` (0037) : SECURITY INVOKER, insère DEUX entrées « review » sous les
--     droits de l'appelant (policy aujourd'hui) → passe désormais par une fonction serveur
--     dédiée (3.) ;
--   • scripts postgres / maintenance : rôle propriétaire, hors RLS : inchangé ;
--   • aucun appel client direct (`from("audit_log")` = lecture seule), aucune écriture back-office.
--
-- CORRECTION
--   1. DROP de la policy `audit_log_insert` + REVOKE INSERT pour `authenticated` : plus aucun
--      INSERT client, ni par REST, ni par RETURNING / upsert (la table reste lisible).
--   2. Fonction serveur `private.audit_review_park_edit(edit_id, detail)` (SECURITY DEFINER,
--      schéma `private` NON exposé par l'API) : entité et action FIXES (`park_edits` / `review`),
--      `actor_id` = auth.uid(), `source` = 'app', et seulement si l'appelant est bien celui qui
--      vient de traiter la proposition DANS LA TRANSACTION EN COURS (`reviewed_by = auth.uid()`
--      ET `reviewed_at = now()` : `review_park_edit()` pose les deux dans la même transaction que
--      l'appel, alors qu'un appel REST est une transaction à part — on ne peut donc pas s'attribuer
--      une revue puis appeler la fonction) ET gère le parc (ou est staff).
--   3. `review_park_edit()` : strictement identique à 0037 / prod, SAUF que ses deux
--      `insert into audit_log` deviennent `perform private.audit_review_park_edit(...)`.
--      Elle reste SECURITY INVOKER (même raisonnement que 0037).
--
-- ROLLBACK : recréer la policy `audit_log_insert` (0018), `grant insert on audit_log to
-- authenticated`, ré-appliquer `review_park_edit` de 0037, supprimer `private.audit_review_park_edit`.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 2. Fonction serveur (schéma privé, non exposé par PostgREST) ───────────
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.audit_review_park_edit(p_edit_id uuid, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_edit record;
begin
  if v_uid is null then
    raise exception 'audit_review_park_edit: authentification requise' using errcode = '42501';
  end if;
  select pe.park_id, pe.reviewed_by, pe.reviewed_at into v_edit from park_edits pe where pe.id = p_edit_id;
  -- reviewed_at = now() : now() est l'instant de début de transaction ; review_park_edit() écrit
  -- `reviewed_at = now()` dans la MÊME transaction que cet appel. Une revue antérieure ou
  -- auto-attribuée dans une autre transaction ne correspond donc jamais.
  if not found or v_edit.reviewed_by is distinct from v_uid or v_edit.reviewed_at is distinct from now() then
    raise exception 'audit_review_park_edit: proposition non traitée par l''appelant dans cette transaction' using errcode = '42501';
  end if;
  if not (is_toboggo_staff(v_uid) or (v_edit.park_id is not null and manages_park(v_uid, v_edit.park_id))) then
    raise exception 'audit_review_park_edit: appelant non autorisé sur ce parc' using errcode = '42501';
  end if;
  insert into audit_log (entity_type, entity_id, action, new_value, actor_id, source)
  values ('park_edits', p_edit_id, 'review', p_detail, v_uid, 'app');
end $$;

revoke all on function private.audit_review_park_edit(uuid, jsonb) from public, anon;
grant execute on function private.audit_review_park_edit(uuid, jsonb) to authenticated;

-- ── 3. review_park_edit() : identique à 0037 sauf les 2 appels d'audit ─────
CREATE OR REPLACE FUNCTION public.review_park_edit(p_edit_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

    perform private.audit_review_park_edit(p_edit_id, jsonb_build_object(
      'reviewer', v_uid, 'decision', 'reject', 'outcome', 'rejected',
      'applied', '[]'::jsonb, 'already_applied', '[]'::jsonb,
      'conflicts', '[]'::jsonb, 'manual', '[]'::jsonb
    ));

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
    perform private.audit_review_park_edit(p_edit_id, jsonb_build_object(
      'reviewer', v_uid, 'decision', 'approve', 'outcome', v_outcome,
      'applied', v_applied_fields, 'already_applied', v_already_fields,
      'conflicts', v_conflict_fields, 'manual', v_manual_fields
    ));
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
$function$;


-- ── 1. Plus d'écriture directe dans audit_log ──────────────────────────────
drop policy if exists audit_log_insert on public.audit_log;
revoke insert on table public.audit_log from authenticated;

-- ── Vérification structurelle ──────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and cmd in ('INSERT', 'ALL')) then
    raise exception '0053 FAIL — une policy d''insertion existe encore sur audit_log';
  end if;
  if has_table_privilege('authenticated', 'public.audit_log', 'insert,update,delete,truncate')
     or has_table_privilege('anon', 'public.audit_log', 'insert,update,delete,truncate') then
    raise exception '0053 FAIL — privilège d''écriture client résiduel sur audit_log';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.review_park_edit(uuid,text,text)'::regprocedure) then
    raise exception '0053 FAIL — review_park_edit doit rester SECURITY INVOKER';
  end if;
  if (select prosrc from pg_proc where oid = 'public.review_park_edit(uuid,text,text)'::regprocedure) ilike '%insert into audit_log%' then
    raise exception '0053 FAIL — review_park_edit écrit encore directement dans audit_log';
  end if;
  if not (select prosecdef from pg_proc where oid = 'private.audit_review_park_edit(uuid,jsonb)'::regprocedure) then
    raise exception '0053 FAIL — private.audit_review_park_edit doit être SECURITY DEFINER';
  end if;
  raise notice '0053 OK — audit_log : écritures réservées au système (trigger audit_row + fonction serveur)';
end $$;
