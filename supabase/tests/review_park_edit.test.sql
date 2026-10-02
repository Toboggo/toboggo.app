-- ════════════════════════════════════════════════════════════════════════════
-- Test — `review_park_edit()` (migration 0037, Admin-3A-1)
-- ────────────────────────────────────────────────────────────────────────────
-- `review_park_edit()` rejette tout appel non authentifié dès sa 1ʳᵉ ligne
-- (`auth.uid()` doit déterminer le reviewer) : la quasi-totalité de sa
-- couverture doit donc simuler un acteur réel (même technique que
-- supabase/tests/park_attribute_provenance.test.sql : `set local role
-- authenticated` + `set_config('request.jwt.claims', …)`), pas les
-- assertions structurelles "rôle postgres" déjà embarquées dans 0037.
--
-- USAGE (base LOCALE ou STAGING — JAMAIS la production) :
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/review_park_edit.test.sql
--
-- Tout est encapsulé dans une transaction terminée par ROLLBACK — aucune
-- fixture ni aucun effet ne persiste, y compris sur une base locale partagée
-- avec d'autres worktrees.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── Acteurs ──────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('e0370000-0000-4000-a000-00000000a001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'zzz-0037-admin@test.local', '', now(), now(), now()),
  ('e0370000-0000-4000-a000-00000000a002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'zzz-0037-support@test.local', '', now(), now(), now()),
  ('e0370000-0000-4000-a000-00000000a003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'zzz-0037-gest-b@test.local', '', now(), now(), now()),
  ('e0370000-0000-4000-a000-00000000a004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'zzz-0037-contrib-b@test.local', '', now(), now(), now()),
  ('e0370000-0000-4000-a000-00000000a005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'zzz-0037-gest-c@test.local', '', now(), now(), now());

insert into organizations (id, name, type)
values ('e0370000-0000-4000-a000-00000000b001', 'zzz_org_0037_b', 'municipality'),
       ('e0370000-0000-4000-a000-00000000b002', 'zzz_org_0037_c', 'municipality');
-- `team_members.commune_id` (V1 compat) exige une ligne `communes` du même id
-- que l'organisation (même motif que supabase/tests/park_attribute_provenance.test.sql).
insert into communes (id, name)
values ('e0370000-0000-4000-a000-00000000b001', 'zzz_org_0037_b'),
       ('e0370000-0000-4000-a000-00000000b002', 'zzz_org_0037_c');

insert into team_members (user_id, organization_id, name, email, role)
values
  ('e0370000-0000-4000-a000-00000000a001', null, 'Admin', 'zzz-0037-admin@test.local', 'super_admin'),
  ('e0370000-0000-4000-a000-00000000a002', null, 'Support', 'zzz-0037-support@test.local', 'support'),
  ('e0370000-0000-4000-a000-00000000a003', 'e0370000-0000-4000-a000-00000000b001', 'Gest B', 'zzz-0037-gest-b@test.local', 'gestionnaire'),
  ('e0370000-0000-4000-a000-00000000a004', 'e0370000-0000-4000-a000-00000000b001', 'Contrib B', 'zzz-0037-contrib-b@test.local', 'contributeur'),
  ('e0370000-0000-4000-a000-00000000a005', 'e0370000-0000-4000-a000-00000000b002', 'Gest C', 'zzz-0037-gest-c@test.local', 'gestionnaire');

-- ── Un parc par scénario (isolation totale entre tests) ─────────────────
insert into parks (id, name, latitude, longitude, min_age, max_age, country_code, timezone, moderation_status)
values
  ('e0370000-0000-4000-a000-00000000c001', 'zzz_parc_0037_T1',  43.6, 1.44, 3,  10, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c002', 'zzz_parc_0037_T2',  43.6, 1.44, 5,  12, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c003', 'zzz_parc_0037_T3',  43.6, 1.44, 7,  14, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c004', 'zzz_parc_0037_T4',  43.6, 1.44, 3,  10, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c005', 'zzz_parc_0037_T5',  43.6, 1.44, 3,  10, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c006', 'zzz_parc_0037_T6',  43.6, 1.44, 3,  10, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c008', 'zzz_parc_0037_T8_9','43.6', 1.44, 3, 10, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c010', 'zzz_parc_0037_T10', 43.6, 1.44, 3,  10, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c011', 'zzz_parc_0037_T11', 43.6, 1.44, 3,  10, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c013', 'zzz_parc_0037_T13', 43.6, 1.44, 3,  10, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c014', 'zzz_parc_0037_T14', 43.6, 1.44, 3,  10, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c015', 'zzz_parc_0037_T15_16_17', 43.6, 1.44, 3, 10, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c018', 'zzz_parc_0037_T18', 43.6, 1.44, 3,  10, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c019', 'zzz_parc_0037_T19', 43.6, 1.44, 7,  14, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c020', 'zzz_parc_0037_T20a',43.6, 1.44, 3,  10, 'FR', 'Europe/Paris', 'published'),
  ('e0370000-0000-4000-a000-00000000c021', 'zzz_parc_0037_T20b',43.6, 1.44, 3,  10, 'FR', 'Europe/Paris', 'published');

insert into organization_parks (organization_id, park_id, role)
values
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c001', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c002', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c003', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c004', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c005', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c006', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c008', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c010', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c011', 'owner'), -- T11 : owner = org B, pas org C
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c013', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c014', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c015', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c018', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c019', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c020', 'owner'),
  ('e0370000-0000-4000-a000-00000000b001', 'e0370000-0000-4000-a000-00000000c021', 'owner');

-- Features pour T15/T16/T17 (catalogue réel, code 'slide' — cf. 0010 seed)
insert into park_features (park_id, feature_id, status)
select 'e0370000-0000-4000-a000-00000000c015', id, 'unavailable' from features where code = 'slide';

-- ════════════════════════════════════════════════════════════════════════════
-- Contexte : Gestionnaire B (organisation propriétaire de la plupart des parcs)
-- ════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0370000-0000-4000-a000-00000000a003","role":"authenticated"}', true);

-- T1 — APPLICABLE ages → réellement appliqué + approved
do $$
declare v_edit_id uuid; v_res jsonb; v_min smallint; v_max smallint;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c001', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('kind','correction','target','ages','items', jsonb_build_array(
      jsonb_build_object('field','ages','label','Tranche d''âge',
        'current', jsonb_build_object('min',3,'max',10),
        'proposed', jsonb_build_object('min',4,'max',11))
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if v_res->>'outcome' <> 'approved' then raise exception 'T1 FAIL — outcome=%', v_res->>'outcome'; end if;
  if (v_res->'items'->0->>'result') <> 'APPLICABLE' then raise exception 'T1 FAIL — result=%', v_res->'items'->0->>'result'; end if;

  select min_age, max_age into v_min, v_max from parks where id = 'e0370000-0000-4000-a000-00000000c001';
  if v_min <> 4 or v_max <> 11 then raise exception 'T1 FAIL — parc non mis à jour (min=%, max=%)', v_min, v_max; end if;
  if (select status from park_edits where id = v_edit_id) <> 'approved' then raise exception 'T1 FAIL — status'; end if;

  raise notice 'T1 OK — ages APPLICABLE réellement appliqué, status=approved';
end $$;

-- T2 — ALREADY_APPLIED → pas de réécriture inutile + approved
do $$
declare v_edit_id uuid; v_res jsonb; v_min smallint; v_max smallint;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c002', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','ages','current', jsonb_build_object('min',3,'max',10),
                                         'proposed', jsonb_build_object('min',5,'max',12))
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if v_res->>'outcome' <> 'approved' then raise exception 'T2 FAIL — outcome=%', v_res->>'outcome'; end if;
  if (v_res->'items'->0->>'result') <> 'ALREADY_APPLIED' then raise exception 'T2 FAIL — result=%', v_res->'items'->0->>'result'; end if;

  select min_age, max_age into v_min, v_max from parks where id = 'e0370000-0000-4000-a000-00000000c002';
  if v_min <> 5 or v_max <> 12 then raise exception 'T2 FAIL — parc modifié alors que déjà à jour (min=%, max=%)', v_min, v_max; end if;

  raise notice 'T2 OK — ALREADY_APPLIED, aucune réécriture, status=approved';
end $$;

-- T3 — CONFLICT seul → pas d'application + pending + requires_manual_review
do $$
declare v_edit_id uuid; v_res jsonb; v_min smallint; v_max smallint;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c003', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','ages','current', jsonb_build_object('min',3,'max',10),
                                         'proposed', jsonb_build_object('min',5,'max',12))
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if v_res->>'outcome' <> 'requires_manual_review' then raise exception 'T3 FAIL — outcome=%', v_res->>'outcome'; end if;
  if v_res->>'status' <> 'pending' then raise exception 'T3 FAIL — status=%', v_res->>'status'; end if;
  if (v_res->'items'->0->>'result') <> 'CONFLICT' then raise exception 'T3 FAIL — result=%', v_res->'items'->0->>'result'; end if;

  select min_age, max_age into v_min, v_max from parks where id = 'e0370000-0000-4000-a000-00000000c003';
  if v_min <> 7 or v_max <> 14 then raise exception 'T3 FAIL — parc modifié malgré conflit (min=%, max=%)', v_min, v_max; end if;
  if (select status from park_edits where id = v_edit_id) <> 'pending' then raise exception 'T3 FAIL — park_edits.status'; end if;
  if (select reviewed_by from park_edits where id = v_edit_id) is not null then
    raise exception 'T3 FAIL — reviewed_by renseigné alors que requires_manual_review';
  end if;

  raise notice 'T3 OK — CONFLICT seul : rien appliqué, reste pending, requires_manual_review';
end $$;

-- T4 — free_text seul → pending + requires_manual_review
do $$
declare v_edit_id uuid; v_res jsonb;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c004', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','free_text','current', null, 'proposed', 'Texte libre')
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if v_res->>'outcome' <> 'requires_manual_review' then raise exception 'T4 FAIL — outcome=%', v_res->>'outcome'; end if;
  if (v_res->'items'->0->>'result') <> 'NOT_AUTOMATICALLY_APPLICABLE' then
    raise exception 'T4 FAIL — result=%', v_res->'items'->0->>'result';
  end if;
  if (v_res->'items'->0->>'applied')::boolean then raise exception 'T4 FAIL — applied=true pour free_text'; end if;

  raise notice 'T4 OK — free_text : NOT_AUTOMATICALLY_APPLICABLE, requires_manual_review';
end $$;

-- T5 — ages applicable + location conflict → ages appliqué, location non
-- appliquée, proposition approved, résultat détaillé
do $$
declare v_edit_id uuid; v_res jsonb; v_min smallint; v_lat numeric; v_lng numeric;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c005', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','ages','current', jsonb_build_object('min',3,'max',10),
                                         'proposed', jsonb_build_object('min',6,'max',13)),
      jsonb_build_object('field','location',
        'current',  jsonb_build_object('latitude', 40.0, 'longitude', 2.0),
        'proposed', jsonb_build_object('lat', 41.0, 'lng', 3.0))
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if v_res->>'outcome' <> 'approved' then raise exception 'T5 FAIL — outcome=%', v_res->>'outcome'; end if;
  if (v_res->'items'->0->>'result') <> 'APPLICABLE' then raise exception 'T5 FAIL — item ages result=%', v_res->'items'->0->>'result'; end if;
  if (v_res->'items'->1->>'result') <> 'CONFLICT' then raise exception 'T5 FAIL — item location result=%', v_res->'items'->1->>'result'; end if;

  select min_age into v_min from parks where id = 'e0370000-0000-4000-a000-00000000c005';
  if v_min <> 6 then raise exception 'T5 FAIL — ages non appliqué (min=%)', v_min; end if;
  select latitude, longitude into v_lat, v_lng from parks where id = 'e0370000-0000-4000-a000-00000000c005';
  if v_lat <> 43.6 or v_lng <> 1.44 then raise exception 'T5 FAIL — location appliquée malgré conflit (%, %)', v_lat, v_lng; end if;

  raise notice 'T5 OK — combinaison : ages appliqué, location en conflit non appliquée, approved';
end $$;

-- T6 — reject → parc inchangé + rejected
do $$
declare v_edit_id uuid; v_res jsonb; v_min smallint;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c006', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','ages','current', jsonb_build_object('min',3,'max',10),
                                         'proposed', jsonb_build_object('min',9,'max',15))
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'reject', 'Non pertinent');
  if v_res->>'outcome' <> 'rejected' then raise exception 'T6 FAIL — outcome=%', v_res->>'outcome'; end if;

  select min_age into v_min from parks where id = 'e0370000-0000-4000-a000-00000000c006';
  if v_min <> 3 then raise exception 'T6 FAIL — parc modifié malgré reject (min=%)', v_min; end if;
  if (select status from park_edits where id = v_edit_id) <> 'rejected' then raise exception 'T6 FAIL — status'; end if;
  if (select reviewed_by from park_edits where id = v_edit_id) <> 'e0370000-0000-4000-a000-00000000a003' then
    raise exception 'T6 FAIL — reviewed_by';
  end if;

  raise notice 'T6 OK — reject : parc inchangé, status=rejected, reviewed_by renseigné';

  -- T7 — second traitement de LA MÊME proposition → already_reviewed
  v_res := review_park_edit(v_edit_id, 'approve', null);
  if v_res->>'outcome' <> 'already_reviewed' then raise exception 'T7 FAIL — outcome=%', v_res->>'outcome'; end if;
  if v_res->>'status' <> 'rejected' then raise exception 'T7 FAIL — status renvoyé=%', v_res->>'status'; end if;

  raise notice 'T7 OK — second traitement : already_reviewed, aucune réécriture silencieuse';
end $$;

-- T13 — field inconnu (ni ages/location/feature:*/free_text) → traitement
-- manuel, jamais appliqué
do $$
declare v_edit_id uuid; v_res jsonb;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c013', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','mystery_field','current','x','proposed','y')
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if (v_res->'items'->0->>'result') <> 'NOT_AUTOMATICALLY_APPLICABLE' then
    raise exception 'T13 FAIL — result=%', v_res->'items'->0->>'result';
  end if;
  if (v_res->'items'->0->>'applied')::boolean then raise exception 'T13 FAIL — un field inconnu a été appliqué'; end if;
  if v_res->>'outcome' <> 'requires_manual_review' then raise exception 'T13 FAIL — outcome=%', v_res->>'outcome'; end if;

  raise notice 'T13 OK — field inconnu : traitement manuel, jamais appliqué';
end $$;

-- T14 — location avec tolérance flottante (diff 5e-7 ≤ 1e-6 → APPLICABLE)
do $$
declare v_edit_id uuid; v_res jsonb; v_lat numeric; v_lng numeric;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c014', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','location',
        'current',  jsonb_build_object('latitude', 43.6000005, 'longitude', 1.4400005),
        'proposed', jsonb_build_object('lat', 44.0, 'lng', 2.0))
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if (v_res->'items'->0->>'result') <> 'APPLICABLE' then
    raise exception 'T14 FAIL — diff sous tolérance classée %, attendu APPLICABLE', v_res->'items'->0->>'result';
  end if;

  select latitude, longitude into v_lat, v_lng from parks where id = 'e0370000-0000-4000-a000-00000000c014';
  if v_lat <> 44.0 or v_lng <> 2.0 then raise exception 'T14 FAIL — location non appliquée (%, %)', v_lat, v_lng; end if;

  raise notice 'T14 OK — tolérance 1e-6 respectée, location appliquée';
end $$;

-- T15/T16/T17 — feature:<code> (park 'slide' status initial = 'unavailable')
do $$
declare v_edit_id uuid; v_res jsonb; v_status text;
begin
  -- T15 : applicable
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c015', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','feature:slide','current','unavailable','proposed','available')
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if (v_res->'items'->0->>'result') <> 'APPLICABLE' then raise exception 'T15 FAIL — result=%', v_res->'items'->0->>'result'; end if;

  select pf.status::text into v_status from park_features pf
  join features f on f.id = pf.feature_id
  where pf.park_id = 'e0370000-0000-4000-a000-00000000c015' and f.code = 'slide';
  if v_status <> 'available' then raise exception 'T15 FAIL — status réel = %', v_status; end if;
  raise notice 'T15 OK — feature APPLICABLE réellement appliquée (available)';

  -- T16 : already applied (B est maintenant 'available' suite à T15)
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c015', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','feature:slide','current','unknown','proposed','available')
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if (v_res->'items'->0->>'result') <> 'ALREADY_APPLIED' then raise exception 'T16 FAIL — result=%', v_res->'items'->0->>'result'; end if;
  raise notice 'T16 OK — feature ALREADY_APPLIED';

  -- T17 : conflict (B='available', A='unavailable', C='temporarily_unavailable')
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c015', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','feature:slide','current','unavailable','proposed','temporarily_unavailable')
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if (v_res->'items'->0->>'result') <> 'CONFLICT' then raise exception 'T17 FAIL — result=%', v_res->'items'->0->>'result'; end if;

  select pf.status::text into v_status from park_features pf
  join features f on f.id = pf.feature_id
  where pf.park_id = 'e0370000-0000-4000-a000-00000000c015' and f.code = 'slide';
  if v_status <> 'available' then raise exception 'T17 FAIL — feature modifiée malgré conflit (status=%)', v_status; end if;
  raise notice 'T17 OK — feature CONFLICT, non appliquée';
end $$;

-- T18 — erreur technique (code de feature invalide) pendant l'application
-- d'une proposition qui contient AUSSI un item ages valide → ROLLBACK intégral
do $$
declare v_edit_id uuid; v_min smallint; v_caught boolean := false;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c018', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','ages','current', jsonb_build_object('min',3,'max',10),
                                         'proposed', jsonb_build_object('min',8,'max',16)),
      jsonb_build_object('field','feature:code_qui_nexiste_pas','current','unknown','proposed','available')
    )))
  returning id into v_edit_id;

  begin
    perform review_park_edit(v_edit_id, 'approve', null);
    raise exception 'T18 FAIL — aucune erreur levée malgré le code de feature invalide';
  exception when others then
    v_caught := true;
  end;
  if not v_caught then raise exception 'T18 FAIL — exception non interceptée'; end if;

  -- L'item "ages", pourtant individuellement APPLICABLE, ne doit PAS être
  -- resté appliqué : toute la transaction de la fonction a été annulée.
  select min_age into v_min from parks where id = 'e0370000-0000-4000-a000-00000000c018';
  if v_min <> 3 then raise exception 'T18 FAIL — ages appliqué malgré rollback attendu (min=%)', v_min; end if;
  if (select status from park_edits where id = v_edit_id) <> 'pending' then
    raise exception 'T18 FAIL — park_edits marqué malgré rollback attendu';
  end if;

  raise notice 'T18 OK — erreur technique => rollback intégral (ages NON appliqué, park_edits toujours pending)';
end $$;

-- T19 — répétition : proposition uniquement CONFLICT, 2 appels approve
-- successifs. requires_manual_review n'est PAS une décision finale : aucune
-- accumulation d'état ni d'audit_log "review" ; reste retraitable plus tard.
do $$
declare v_edit_id uuid; v_res jsonb; v_min smallint; v_n_audit int;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c019', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','ages','current', jsonb_build_object('min',3,'max',10),
                                         'proposed', jsonb_build_object('min',5,'max',12))
    )))
  returning id into v_edit_id;

  -- Appel #1
  v_res := review_park_edit(v_edit_id, 'approve', null);
  if v_res->>'outcome' <> 'requires_manual_review' then raise exception 'T19 FAIL — appel#1 outcome=%', v_res->>'outcome'; end if;
  if (select status from park_edits where id = v_edit_id) <> 'pending' then raise exception 'T19 FAIL — appel#1 status'; end if;
  if (select reviewed_by from park_edits where id = v_edit_id) is not null then raise exception 'T19 FAIL — appel#1 reviewed_by non null'; end if;
  if (select reviewed_at from park_edits where id = v_edit_id) is not null then raise exception 'T19 FAIL — appel#1 reviewed_at non null'; end if;

  -- Appel #2 — même résultat, aucune accumulation
  v_res := review_park_edit(v_edit_id, 'approve', null);
  if v_res->>'outcome' <> 'requires_manual_review' then raise exception 'T19 FAIL — appel#2 outcome=%', v_res->>'outcome'; end if;
  if (select status from park_edits where id = v_edit_id) <> 'pending' then raise exception 'T19 FAIL — appel#2 status'; end if;
  if (select reviewed_by from park_edits where id = v_edit_id) is not null then raise exception 'T19 FAIL — appel#2 reviewed_by non null'; end if;
  if (select reviewed_at from park_edits where id = v_edit_id) is not null then raise exception 'T19 FAIL — appel#2 reviewed_at non null'; end if;
  if (select review_note from park_edits where id = v_edit_id) is not null then raise exception 'T19 FAIL — appel#2 review_note non null'; end if;

  select min_age into v_min from parks where id = 'e0370000-0000-4000-a000-00000000c019';
  if v_min <> 7 then raise exception 'T19 FAIL — parc modifié (min=%)', v_min; end if;

  select count(*) into v_n_audit from audit_log
  where entity_type = 'park_edits' and entity_id = v_edit_id and action = 'review';
  if v_n_audit <> 0 then raise exception 'T19 FAIL — % entrée(s) audit_log "review" alors qu''aucune décision n''a été prise', v_n_audit; end if;

  raise notice 'T19 OK — répétition sur CONFLICT : requires_manual_review stable ×2, pending, 0 audit_log "review"';
end $$;

-- T20 — audit success : une vraie décision (approved / rejected) produit
-- exactement UNE trace audit_log "review" ; un already_reviewed ultérieur
-- n'en ajoute PAS une deuxième.
-- Exécuté sous identité STAFF (admin) : `audit_log_read` (0018) n'autorise
-- la lecture non-staff que pour `entity_type = 'parks'`, jamais
-- `'park_edits'` — un gestionnaire ne verrait donc pas sa propre entrée pour
-- compter dessus (même constat déjà fait pour l'historique des signalements,
-- Admin-2). L'écriture, elle, réussirait aussi bien sous Gest B
-- (`audit_log_insert` n'a pas cette restriction) ; seule la RELECTURE de
-- vérification exige le staff ici.
select set_config('request.jwt.claims',
  '{"sub":"e0370000-0000-4000-a000-00000000a001","role":"authenticated"}', true);
do $$
declare v_edit_id uuid; v_res jsonb; v_n_audit int;
begin
  -- 20a : approved — user_id = l'acteur actif (admin, cf. park_edits_insert)
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c020', 'e0370000-0000-4000-a000-00000000a001',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','ages','current', jsonb_build_object('min',3,'max',10),
                                         'proposed', jsonb_build_object('min',4,'max',11))
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if v_res->>'outcome' <> 'approved' then raise exception 'T20a FAIL — outcome=%', v_res->>'outcome'; end if;

  select count(*) into v_n_audit from audit_log
  where entity_type = 'park_edits' and entity_id = v_edit_id and action = 'review';
  if v_n_audit <> 1 then raise exception 'T20a FAIL — %  entrée(s) audit_log "review" après approved (attendu 1)', v_n_audit; end if;

  -- Second appel -> already_reviewed, ne doit RIEN ajouter
  v_res := review_park_edit(v_edit_id, 'approve', null);
  if v_res->>'outcome' <> 'already_reviewed' then raise exception 'T20a FAIL — 2e appel outcome=%', v_res->>'outcome'; end if;

  select count(*) into v_n_audit from audit_log
  where entity_type = 'park_edits' and entity_id = v_edit_id and action = 'review';
  if v_n_audit <> 1 then raise exception 'T20a FAIL — % entrée(s) audit_log "review" après already_reviewed (attendu toujours 1)', v_n_audit; end if;

  raise notice 'T20a OK — approved : exactement 1 trace audit "review", already_reviewed n''en ajoute pas une 2e';

  -- 20b : rejected (même vérification, chemin reject)
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c021', 'e0370000-0000-4000-a000-00000000a001',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','ages','current', jsonb_build_object('min',3,'max',10),
                                         'proposed', jsonb_build_object('min',9,'max',15))
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'reject', 'Test T20b');
  if v_res->>'outcome' <> 'rejected' then raise exception 'T20b FAIL — outcome=%', v_res->>'outcome'; end if;

  select count(*) into v_n_audit from audit_log
  where entity_type = 'park_edits' and entity_id = v_edit_id and action = 'review';
  if v_n_audit <> 1 then raise exception 'T20b FAIL — % entrée(s) audit_log "review" après rejected (attendu 1)', v_n_audit; end if;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if v_res->>'outcome' <> 'already_reviewed' then raise exception 'T20b FAIL — 2e appel outcome=%', v_res->>'outcome'; end if;

  select count(*) into v_n_audit from audit_log
  where entity_type = 'park_edits' and entity_id = v_edit_id and action = 'review';
  if v_n_audit <> 1 then raise exception 'T20b FAIL — % entrée(s) audit_log "review" après already_reviewed (attendu toujours 1)', v_n_audit; end if;

  raise notice 'T20b OK — rejected : exactement 1 trace audit "review", already_reviewed n''en ajoute pas une 2e';
end $$;

-- T12 — park_id null → unsupported_edit_type (staff admin : seul rôle dont
-- la RLS park_edits_read couvre un park_id null)
select set_config('request.jwt.claims',
  '{"sub":"e0370000-0000-4000-a000-00000000a001","role":"authenticated"}', true);
do $$
declare v_edit_id uuid;
begin
  -- user_id = l'acteur actif (admin) : park_edits_insert exige
  -- `user_id = auth.uid()`, indépendamment de qui "devrait" être l'auteur.
  insert into park_edits (park_id, user_id, changes)
  values (null, 'e0370000-0000-4000-a000-00000000a001', jsonb_build_object('items', '[]'::jsonb))
  returning id into v_edit_id;

  begin
    perform review_park_edit(v_edit_id, 'approve', null);
    raise exception 'T12 FAIL — park_id null accepté';
  exception when check_violation then
    raise notice 'T12 OK — park_id null => unsupported_edit_type (check_violation)';
  end;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Permissions — T8, T9, T10, T11
-- ════════════════════════════════════════════════════════════════════════════

-- Fixture partagée T8/T9 : une proposition pending sur le parc T8_9 (org B).
-- Identité explicitement refixée à Gest B (l'admin de T12 est restée active
-- sinon) : park_edits_insert exige `user_id = auth.uid()`, sans exception
-- staff.
select set_config('request.jwt.claims',
  '{"sub":"e0370000-0000-4000-a000-00000000a003","role":"authenticated"}', true);
do $$
declare v_edit_id uuid;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c008', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','ages','current', jsonb_build_object('min',3,'max',10),
                                         'proposed', jsonb_build_object('min',4,'max',11))
    )))
  returning id into v_edit_id;
  perform set_config('zzz.edit_t8_9', v_edit_id::text, false);
end $$;

-- T8 — support (staff) → refusé
select set_config('request.jwt.claims',
  '{"sub":"e0370000-0000-4000-a000-00000000a002","role":"authenticated"}', true);
do $$
declare v_edit_id uuid := current_setting('zzz.edit_t8_9')::uuid;
begin
  begin
    perform review_park_edit(v_edit_id, 'approve', null);
    raise exception 'T8 FAIL — support a pu reviewer';
  exception when insufficient_privilege then
    raise notice 'T8 OK — support refusé (insufficient_privilege)';
  end;
  if (select status from park_edits where id = v_edit_id) <> 'pending' then
    raise exception 'T8 FAIL — statut modifié malgré le refus';
  end if;
end $$;

-- T9 — contributeur de l'organisation propriétaire → refusé
select set_config('request.jwt.claims',
  '{"sub":"e0370000-0000-4000-a000-00000000a004","role":"authenticated"}', true);
do $$
declare v_edit_id uuid := current_setting('zzz.edit_t8_9')::uuid;
begin
  begin
    perform review_park_edit(v_edit_id, 'approve', null);
    raise exception 'T9 FAIL — contributeur a pu reviewer';
  exception when insufficient_privilege then
    raise notice 'T9 OK — contributeur refusé (insufficient_privilege)';
  end;
  if (select status from park_edits where id = v_edit_id) <> 'pending' then
    raise exception 'T9 FAIL — statut modifié malgré le refus';
  end if;
end $$;

-- T10 — gestionnaire du BON parc (organisation propriétaire réelle) → autorisé
select set_config('request.jwt.claims',
  '{"sub":"e0370000-0000-4000-a000-00000000a003","role":"authenticated"}', true);
do $$
declare v_edit_id uuid; v_res jsonb; v_src text;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c010', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','ages','current', jsonb_build_object('min',3,'max',10),
                                         'proposed', jsonb_build_object('min',6,'max',13))
    )))
  returning id into v_edit_id;

  v_res := review_park_edit(v_edit_id, 'approve', null);
  if v_res->>'outcome' <> 'approved' then raise exception 'T10 FAIL — outcome=%', v_res->>'outcome'; end if;

  -- bonus : la provenance appliquée par apply_park_attribute doit être
  -- dérivée du rôle réel (gestionnaire => 'municipality'), pas devinée.
  select ps.source_type::text into v_src
  from park_attribute_sources pas join park_sources ps on ps.id = pas.source_id
  where pas.park_id = 'e0370000-0000-4000-a000-00000000c010' and pas.attribute_key = 'min_age' and pas.is_current;
  if v_src <> 'municipality' then raise exception 'T10 FAIL — source dérivée=% (attendu municipality)', v_src; end if;

  raise notice 'T10 OK — gestionnaire du bon parc autorisé, source dérivée municipality';
end $$;

-- T11 — gestionnaire d'une AUTRE organisation (ne gère pas ce parc) → refusé
-- Identité explicitement refixée à Gest B : c'est *lui* qui doit créer la
-- proposition (park_edits_insert : `with check (user_id = auth.uid())`,
-- échouerait sous l'identité de Gest C).
select set_config('request.jwt.claims',
  '{"sub":"e0370000-0000-4000-a000-00000000a003","role":"authenticated"}', true);
do $$
declare v_edit_id uuid;
begin
  insert into park_edits (park_id, user_id, changes)
  values ('e0370000-0000-4000-a000-00000000c011', 'e0370000-0000-4000-a000-00000000a003',
    jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('field','ages','current', jsonb_build_object('min',3,'max',10),
                                         'proposed', jsonb_build_object('min',4,'max',11))
    )))
  returning id into v_edit_id;
  perform set_config('zzz.edit_t11', v_edit_id::text, false);
end $$;

-- Bascule vers Gest C (organisation SANS lien avec ce parc) pour la tentative.
select set_config('request.jwt.claims',
  '{"sub":"e0370000-0000-4000-a000-00000000a005","role":"authenticated"}', true);
do $$
declare v_edit_id uuid := current_setting('zzz.edit_t11')::uuid;
begin
  -- La proposition existe (créée par le gestionnaire légitime), mais
  -- park_edits_read (RLS) ne matche pour Gest C ni user_id=auth.uid() ni
  -- manages_park() ni is_toboggo_staff() : la ligne lui est invisible avant
  -- même d'atteindre le contrôle de rôle interne de la fonction.
  begin
    perform review_park_edit(v_edit_id, 'approve', null);
    raise exception 'T11 FAIL — gestionnaire hors périmètre a pu reviewer';
  exception when no_data_found then
    raise notice 'T11 OK — gestionnaire hors périmètre refusé (no_data_found — RLS masque la ligne)';
  when insufficient_privilege then
    raise notice 'T11 OK — gestionnaire hors périmètre refusé (insufficient_privilege)';
  end;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
reset role;
select set_config('request.jwt.claims', null, true);

do $$ begin raise notice 'review_park_edit.test.sql — 20 scénarios PASS'; end $$;

rollback;
