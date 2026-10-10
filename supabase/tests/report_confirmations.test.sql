-- ════════════════════════════════════════════════════════════════════════════
-- Test — confirmations communautaires de signalements (migration 0045)
-- ────────────────────────────────────────────────────────────────────────────
-- Couvre : lecture publique limitée (anon), accès direct table refusé, vote /
-- changement de vote / unicité, signalements clos ou parc non publié refusés,
-- aucune écriture directe, isolation entre utilisateurs, lecture staff /
-- gestionnaire du parc, et « résolu » ne clôture jamais le signalement.
--
-- USAGE (base LOCALE ou STAGING — JAMAIS la production) :
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/report_confirmations.test.sql
-- Tout est encapsulé dans une transaction terminée par ROLLBACK.
-- ════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('e0450000-0000-4000-a000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-0045-admin@test.local',  '', now(), now(), now()),
  ('e0450000-0000-4000-a000-00000000a002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-0045-gest-b@test.local', '', now(), now(), now()),
  ('e0450000-0000-4000-a000-00000000a003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-0045-gest-c@test.local', '', now(), now(), now()),
  ('e0450000-0000-4000-a000-00000000a004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-0045-u1@test.local',     '', now(), now(), now()),
  ('e0450000-0000-4000-a000-00000000a005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-0045-u2@test.local',     '', now(), now(), now());

insert into organizations (id, name, type)
values ('e0450000-0000-4000-a000-00000000b001', 'zzz_org_0045_b', 'municipality'),
       ('e0450000-0000-4000-a000-00000000b002', 'zzz_org_0045_c', 'municipality');
insert into communes (id, name)
values ('e0450000-0000-4000-a000-00000000b001', 'zzz_org_0045_b'),
       ('e0450000-0000-4000-a000-00000000b002', 'zzz_org_0045_c');
insert into team_members (user_id, organization_id, name, email, role)
values
  ('e0450000-0000-4000-a000-00000000a001', null, 'Admin', 'zzz-0045-admin@test.local', 'super_admin'),
  ('e0450000-0000-4000-a000-00000000a002', 'e0450000-0000-4000-a000-00000000b001', 'Gest B', 'zzz-0045-gest-b@test.local', 'gestionnaire'),
  ('e0450000-0000-4000-a000-00000000a003', 'e0450000-0000-4000-a000-00000000b002', 'Gest C', 'zzz-0045-gest-c@test.local', 'gestionnaire');

insert into parks (id, name, latitude, longitude, min_age, max_age, country_code, timezone, moderation_status)
values
  ('e0450000-0000-4000-a000-00000000c001', 'zzz_parc_0045_pub',   43.6, 1.44, 3, 10, 'FR', 'Europe/Paris', 'published'),
  ('e0450000-0000-4000-a000-00000000c002', 'zzz_parc_0045_draft', 43.6, 1.44, 3, 10, 'FR', 'Europe/Paris', 'pending');
insert into organization_parks (organization_id, park_id, role)
values ('e0450000-0000-4000-a000-00000000b001', 'e0450000-0000-4000-a000-00000000c001', 'owner');

-- R1 open, R2 in_progress, R3 resolved, R4 parc non publié, R5 dismissed
insert into reports (id, park_id, reported_by_name, category, description, status)
values
  ('e0450000-0000-4000-a000-00000000d001', 'e0450000-0000-4000-a000-00000000c001', 'Secret Reporter', 'broken_equipment', 'Toboggan cassé', 'open'),
  ('e0450000-0000-4000-a000-00000000d002', 'e0450000-0000-4000-a000-00000000c001', 'Secret Reporter', 'cleanliness',      'Verre brisé',    'in_progress'),
  ('e0450000-0000-4000-a000-00000000d003', 'e0450000-0000-4000-a000-00000000c001', 'Secret Reporter', 'safety',           'Déjà réglé',     'resolved'),
  ('e0450000-0000-4000-a000-00000000d004', 'e0450000-0000-4000-a000-00000000c002', 'Secret Reporter', 'safety',           'Parc brouillon', 'open'),
  ('e0450000-0000-4000-a000-00000000d005', 'e0450000-0000-4000-a000-00000000c001', 'Secret Reporter', 'other',            'Rejeté',         'dismissed');

-- ══ ANON ══════════════════════════════════════════════════════════════════
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare n int; r record;
begin
  select count(*) into n from park_active_reports('e0450000-0000-4000-a000-00000000c001');
  if n <> 2 then raise exception 'T1 FAIL — anon attend 2 signalements actifs, a % ', n; end if;
  select * into r from park_active_reports('e0450000-0000-4000-a000-00000000c001') where id = 'e0450000-0000-4000-a000-00000000d001';
  if r.my_response is not null or r.still_present_count <> 0 or r.resolved_count <> 0 then
    raise exception 'T1 FAIL — compteurs/my_response anon'; end if;
  if (select count(*) from park_active_reports('e0450000-0000-4000-a000-00000000c002')) <> 0 then
    raise exception 'T1 FAIL — parc non publié exposé'; end if;
  -- Aucune donnée d'auteur dans le type retourné.
  if exists (select 1 from information_schema.routines r2 join information_schema.parameters p
               on p.specific_name = r2.specific_name
             where r2.routine_name = 'park_active_reports' and p.parameter_mode = 'OUT'
               and p.parameter_name in ('user_id','reported_by_name','photo','resolution_note')) then
    raise exception 'T1 FAIL — champ privé exposé'; end if;
  raise notice 'T1 OK — anon : lecture publique limitée (actifs seulement, parc publié, sans auteur)';
end $$;

do $$
begin
  begin
    perform 1 from report_confirmations;
    raise exception 'T2 FAIL — anon lit la table';
  exception when insufficient_privilege then null; end;
  begin
    perform respond_to_report('e0450000-0000-4000-a000-00000000d001', 'resolved');
    raise exception 'T2 FAIL — anon peut voter';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon', 'public.respond_to_report(uuid,text)', 'execute') then
    raise exception 'T2 FAIL — anon garde EXECUTE sur respond_to_report (0048)';
  end if;
  raise notice 'T2 OK — anon : table et vote refusés (42501), EXECUTE retiré';
end $$;

-- ══ U1 ════════════════════════════════════════════════════════════════════
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0450000-0000-4000-a000-00000000a004","role":"authenticated"}', true);

do $$
declare r record;
begin
  perform respond_to_report('e0450000-0000-4000-a000-00000000d001', 'still_present');
  select * into r from park_active_reports('e0450000-0000-4000-a000-00000000c001') where id = 'e0450000-0000-4000-a000-00000000d001';
  if r.my_response <> 'still_present' or r.still_present_count <> 1 or r.resolved_count <> 0 then
    raise exception 'T3 FAIL — %/%/%', r.my_response, r.still_present_count, r.resolved_count; end if;
  raise notice 'T3 OK — vote « toujours présent » enregistré';

  perform respond_to_report('e0450000-0000-4000-a000-00000000d001', 'resolved');
  select * into r from park_active_reports('e0450000-0000-4000-a000-00000000c001') where id = 'e0450000-0000-4000-a000-00000000d001';
  if r.my_response <> 'resolved' or r.still_present_count <> 0 or r.resolved_count <> 1 then
    raise exception 'T4 FAIL — changement de réponse'; end if;
  if (select count(*) from report_confirmations) <> 1 then raise exception 'T4 FAIL — doublon'; end if;
  raise notice 'T4 OK — réponse modifiable, une seule ligne par (utilisateur, signalement)';
end $$;

do $$
declare sqlstate_seen text;
begin
  begin perform respond_to_report('e0450000-0000-4000-a000-00000000d003', 'resolved'); raise exception 'T5 FAIL — signalement résolu';
  exception when sqlstate 'P0002' then null; end;
  begin perform respond_to_report('e0450000-0000-4000-a000-00000000d005', 'resolved'); raise exception 'T5 FAIL — signalement rejeté';
  exception when sqlstate 'P0002' then null; end;
  begin perform respond_to_report('e0450000-0000-4000-a000-00000000d004', 'resolved'); raise exception 'T5 FAIL — parc non publié';
  exception when sqlstate 'P0002' then null; end;
  begin perform respond_to_report('e0450000-0000-4000-a000-00000000dfff', 'resolved'); raise exception 'T5 FAIL — id inconnu';
  exception when sqlstate 'P0002' then null; end;
  begin perform respond_to_report('e0450000-0000-4000-a000-00000000d001', 'nope'); raise exception 'T6 FAIL — réponse invalide';
  exception when sqlstate '22023' then null; end;
  raise notice 'T5/T6 OK — clos / rejeté / parc non publié / inconnu / réponse invalide refusés';
end $$;

do $$
begin
  begin insert into report_confirmations (report_id, user_id, response)
    values ('e0450000-0000-4000-a000-00000000d002', 'e0450000-0000-4000-a000-00000000a004', 'resolved');
    raise exception 'T7 FAIL — INSERT direct'; exception when insufficient_privilege then null; end;
  begin update report_confirmations set response = 'still_present'; raise exception 'T7 FAIL — UPDATE direct';
  exception when insufficient_privilege then null; end;
  begin delete from report_confirmations; raise exception 'T7 FAIL — DELETE direct';
  exception when insufficient_privilege then null; end;
  raise notice 'T7 OK — aucune écriture directe';
end $$;

-- ══ U2 : voit ses seules lignes ═══════════════════════════════════════════
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0450000-0000-4000-a000-00000000a005","role":"authenticated"}', true);

do $$
declare r record;
begin
  if (select count(*) from report_confirmations) <> 0 then raise exception 'T8 FAIL — U2 voit le vote de U1'; end if;
  perform respond_to_report('e0450000-0000-4000-a000-00000000d001', 'still_present');
  select * into r from park_active_reports('e0450000-0000-4000-a000-00000000c001') where id = 'e0450000-0000-4000-a000-00000000d001';
  if r.still_present_count <> 1 or r.resolved_count <> 1 or r.my_response <> 'still_present' then
    raise exception 'T8 FAIL — compteurs agrégés'; end if;
  if (select count(*) from report_confirmations) <> 1 then raise exception 'T8 FAIL — isolation'; end if;
  raise notice 'T8 OK — compteurs agrégés visibles, votes individuels isolés';
end $$;

-- ══ Staff / gestionnaire / autre organisation ═════════════════════════════
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0450000-0000-4000-a000-00000000a001","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from report_confirmations) <> 2 then raise exception 'T9 FAIL — staff doit voir 2 votes'; end if;
  raise notice 'T9 OK — staff Toboggo lit toutes les confirmations'; end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0450000-0000-4000-a000-00000000a002","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from report_confirmations) <> 2 then raise exception 'T10 FAIL — gestionnaire du parc doit voir 2 votes'; end if;
  raise notice 'T10 OK — gestionnaire du parc lit les confirmations'; end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0450000-0000-4000-a000-00000000a003","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from report_confirmations) <> 0 then raise exception 'T11 FAIL — autre organisation voit des votes'; end if;
  raise notice 'T11 OK — gestionnaire d''une autre organisation : 0 vote'; end $$;

-- ══ Un vote « résolu » ne clôture pas le signalement ══════════════════════
reset role;
do $$ begin
  if (select status from reports where id = 'e0450000-0000-4000-a000-00000000d001') <> 'open' then
    raise exception 'T12 FAIL — le signalement a été modifié par un vote'; end if;
  raise notice 'T12 OK — le statut du signalement reste décidé par la modération'; end $$;

rollback;
