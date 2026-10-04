-- ════════════════════════════════════════════════════════════════════════════
-- Test `app_feedback` (migration 0039) — validation, RLS, cascade
-- USAGE (base LOCALE ou STAGING — JAMAIS la production) :
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/app_feedback.test.sql
-- Tout est encapsulé dans une transaction terminée par ROLLBACK.
-- ════════════════════════════════════════════════════════════════════════════
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('f0390000-0000-4000-a000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-fb-a-0039@test.local', '', now(), now(), now()),
  ('f0390000-0000-4000-a000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-fb-b-0039@test.local', '', now(), now(), now()),
  ('f0390000-0000-4000-a000-0000000000ad', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-fb-admin-0039@test.local', '', now(), now(), now());
insert into team_members (user_id, organization_id, role, name, email) values ('f0390000-0000-4000-a000-0000000000ad', null, 'super_admin', 'zzz admin 0039', 'zzz-fb-admin-0039@test.local');

-- ── A ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0390000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
begin
  insert into app_feedback (user_id, rating, title, body) values (auth.uid(), 5, 'Top', 'Très bien');
  raise notice 'T1 OK — A insère son avis';
  begin insert into app_feedback (user_id, rating, title, body) values (auth.uid(), 4, 'x', 'y');
    raise exception 'T2 FAIL — 2e avis accepté';
  exception
    when unique_violation then raise notice 'T2 OK — 2e avis refusé (unique, 0039→0044)';
    when raise_exception then
      if sqlerrm <> 'app_feedback_too_soon' then raise; end if;
      raise notice 'T2 OK — 2e avis < 30 j refusé (0045)'; end;
  begin insert into app_feedback (user_id, rating, title, body) values ('f0390000-0000-4000-a000-00000000000b', 5, 'x', 'y');
    raise exception 'T3 FAIL — insert pour autrui accepté';
  exception when insufficient_privilege then raise notice 'T3 OK — insert pour autrui refusé (RLS)'; end;
  update app_feedback set rating = 3, title = 'Modifié' where user_id = auth.uid();
  if (select rating from app_feedback where user_id = auth.uid()) <> 3 then raise exception 'T4 FAIL — update refusé'; end if;
  raise notice 'T4 OK — A modifie son avis';
  if (select count(*) from app_feedback) <> 1 then raise exception 'T5 FAIL — A voit % lignes', (select count(*) from app_feedback); end if;
  raise notice 'T5 OK — A ne voit que le sien';
end $$;
reset role;

-- ── B (note/champs invalides, isolation) ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0390000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$
begin
  begin insert into app_feedback (user_id, rating, title, body) values (auth.uid(), 0, 't', 'b'); raise exception 'T6 FAIL — note 0';
  exception when check_violation then raise notice 'T6 OK — note 0 refusée'; end;
  begin insert into app_feedback (user_id, rating, title, body) values (auth.uid(), 6, 't', 'b'); raise exception 'T7 FAIL — note 6';
  exception when check_violation then raise notice 'T7 OK — note 6 refusée'; end;
  begin insert into app_feedback (user_id, rating, title, body) values (auth.uid(), 3, '   ', 'b'); raise exception 'T8 FAIL — titre vide';
  exception when check_violation then raise notice 'T8 OK — titre vide refusé'; end;
  begin insert into app_feedback (user_id, rating, title, body) values (auth.uid(), 3, 't', repeat('x', 2001)); raise exception 'T9 FAIL — texte trop long';
  exception when check_violation then raise notice 'T9 OK — texte trop long refusé'; end;
  if (select count(*) from app_feedback) <> 0 then raise exception 'T10 FAIL — B voit l''avis de A'; end if;
  raise notice 'T10 OK — B ne voit pas l''avis de A';
  update app_feedback set rating = 1;
  if exists (select 1 from app_feedback) then raise exception 'T11 FAIL'; end if;
  raise notice 'T11 OK — B ne peut pas modifier l''avis de A (0 ligne)';
end $$;
reset role;
do $$ begin
  if (select rating from app_feedback where user_id = 'f0390000-0000-4000-a000-00000000000a') <> 3 then raise exception 'T11b FAIL — avis de A altéré'; end if;
end $$;

-- ── anon ──
set local role anon;
do $$
begin
  begin perform 1 from app_feedback; raise exception 'T12 FAIL — anon lit';
  exception when insufficient_privilege then raise notice 'T12 OK — anon sans accès'; end;
end $$;
reset role;

-- ── admin ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0390000-0000-4000-a000-0000000000ad","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from app_feedback) <> 1 then raise exception 'T13 FAIL — admin ne voit pas'; end if;
  raise notice 'T13 OK — admin lit les avis';
end $$;
reset role;

-- ── cascade ──
do $$
begin
  delete from auth.users where id = 'f0390000-0000-4000-a000-00000000000a';
  if exists (select 1 from app_feedback where user_id = 'f0390000-0000-4000-a000-00000000000a') then raise exception 'T14 FAIL — avis conservé'; end if;
  raise notice 'T14 OK — avis supprimé avec le compte';
end $$;
rollback;
