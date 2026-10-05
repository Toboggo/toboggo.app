-- ════════════════════════════════════════════════════════════════════════════
-- Test historique `app_feedback` (migration 0044) — RPC give_app_feedback,
-- délai 30 j, archivage, upserts d'anciens clients, permissions, moyenne.
-- USAGE (base LOCALE ou STAGING — JAMAIS la production) :
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/app_feedback_history.test.sql
-- Transaction terminée par ROLLBACK. (La concurrence réelle est testée à part
-- avec plusieurs sessions psql — voir la PR.)
-- ════════════════════════════════════════════════════════════════════════════
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('f0440000-0000-4000-a000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-fh-a-0044@test.local', '', now(), now(), now()),
  ('f0440000-0000-4000-a000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-fh-b-0044@test.local', '', now(), now(), now()),
  ('f0440000-0000-4000-a000-0000000000ad', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-fh-admin-0044@test.local', '', now(), now(), now());
insert into team_members (user_id, organization_id, role, name, email) values ('f0440000-0000-4000-a000-0000000000ad', null, 'super_admin', 'zzz admin 0044', 'zzz-fh-admin-0044@test.local');

-- ── A : ancien client puis RPC ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0440000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare c0 timestamptz; r app_feedback;
begin
  -- Ancien client : upsert(onConflict user_id) avec titre + texte.
  insert into app_feedback (user_id, rating, title, body) values (auth.uid(), 2, 'Ancien titre', 'Ancien texte')
    on conflict (user_id) do update set rating = excluded.rating, title = excluded.title, body = excluded.body;
  select created_at into c0 from app_feedback where user_id = auth.uid();
  raise notice 'T1 OK — ancien client : création par upsert';
  insert into app_feedback (user_id, rating, title, body) values (auth.uid(), 3, 'Titre 2', 'Texte 2')
    on conflict (user_id) do update set rating = excluded.rating, title = excluded.title, body = excluded.body;
  if (select rating from app_feedback where user_id = auth.uid()) <> 3 then raise exception 'T2 FAIL'; end if;
  if (select created_at from app_feedback where user_id = auth.uid()) <> c0 then raise exception 'T2b FAIL — created_at modifié'; end if;
  if (select edited_at from app_feedback where user_id = auth.uid()) is null then raise exception 'T2c FAIL — edited_at'; end if;
  if (select count(*) from app_feedback_history) <> 0 then raise exception 'T2d FAIL — historique touché'; end if;
  raise notice 'T2 OK — ancien client : modification par upsert (created_at conservé, edited_at posé, historique intact)';

  begin perform give_app_feedback(5::smallint, 'trop tôt'); raise exception 'T3 FAIL — nouvel avis < 30 j accepté';
  exception when raise_exception then
    if sqlerrm <> 'app_feedback_too_soon' then raise; end if;
    raise notice 'T3 OK — nouvel avis < 30 j refusé'; end;
  begin insert into app_feedback_history (user_id, rating, created_at) values (auth.uid(), 5, now()); raise exception 'T4 FAIL';
  exception when insufficient_privilege then raise notice 'T4 OK — pas d''écriture directe dans l''historique'; end;
  begin delete from app_feedback_history; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A a maintenant > 30 j (on antidate la création, trigger de garde suspendu en superuser).
alter table app_feedback disable trigger app_feedback_guard;
update app_feedback set created_at = now() - interval '40 days' where user_id = 'f0440000-0000-4000-a000-00000000000a';
alter table app_feedback enable trigger app_feedback_guard;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0440000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare r app_feedback; old_created timestamptz;
begin
  select created_at into old_created from app_feedback where user_id = auth.uid();
  begin perform give_app_feedback(0::smallint, 'x'); raise exception 'T5 FAIL — note 0';
  exception when check_violation then raise notice 'T5 OK — note 0 refusée (rien archivé)'; end;
  if (select count(*) from app_feedback_history) <> 0 then raise exception 'T5b FAIL — archivage malgré l''échec'; end if;

  r := give_app_feedback(4::smallint, '  ');
  if r.rating <> 4 or r.body is not null or r.title is not null then raise exception 'T6 FAIL — nouvel avis'; end if;
  if r.created_at < now() - interval '1 minute' then raise exception 'T6b FAIL — created_at'; end if;
  if (select count(*) from app_feedback_history where rating = 3 and title = 'Titre 2' and body = 'Texte 2' and created_at = old_created) <> 1 then
    raise exception 'T6c FAIL — ancien avis non archivé avec ses dates d''origine'; end if;
  raise notice 'T6 OK — nouvel avis après 40 j : ancien archivé (dates conservées), commentaire facultatif';

  -- Ancien client après renouvellement : modifie le COURANT, n'abîme pas l'historique.
  insert into app_feedback (user_id, rating, title, body) values (auth.uid(), 5, 'Titre 3', 'Texte 3')
    on conflict (user_id) do update set rating = excluded.rating, title = excluded.title, body = excluded.body;
  if (select count(*) from app_feedback_history) <> 1 then raise exception 'T7 FAIL — historique altéré'; end if;
  if (select rating from app_feedback) <> 5 or (select created_at from app_feedback) <> r.created_at then raise exception 'T7b FAIL'; end if;
  raise notice 'T7 OK — upsert d''un ancien client après renouvellement : courant modifié, historique intact, délai non redémarré';

  begin perform give_app_feedback(1::smallint, 'immédiat'); raise exception 'T8 FAIL';
  exception when raise_exception then
    if sqlerrm <> 'app_feedback_too_soon' then raise; end if;
    raise notice 'T8 OK — second nouvel avis immédiat refusé'; end;
  if (select count(*) from app_feedback_all where user_id = auth.uid()) <> 2 then raise exception 'T9 FAIL — app_feedback_all'; end if;
  raise notice 'T9 OK — app_feedback_all = courant + historique';
end $$;
reset role;

-- ── B : isolation + premier avis par RPC ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0440000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from app_feedback_all) <> 0 or (select count(*) from app_feedback_history) <> 0 then raise exception 'T10 FAIL — B voit A'; end if;
  update app_feedback set rating = 1; if exists (select 1 from app_feedback) then raise exception 'T10b FAIL'; end if;
  perform give_app_feedback(3::smallint, 'premier avis de B');
  if (select count(*) from app_feedback_all) <> 1 then raise exception 'T11 FAIL'; end if;
  if (select rating_count from app_feedback_summary) <> 1 then raise exception 'T11b FAIL — synthèse limitée à B'; end if;
  raise notice 'T10/T11 OK — isolation ; premier avis via RPC';
end $$;
reset role;

-- ── anon ──
set local role anon;
do $$ begin
  begin perform 1 from app_feedback_history; raise exception 'T12 FAIL'; exception when insufficient_privilege then raise notice 'T12 OK — anon refusé (historique)'; end;
  begin perform give_app_feedback(5::smallint, null); raise exception 'T12b FAIL'; exception when insufficient_privilege then raise notice 'T12b OK — anon refusé (RPC)'; end;
end $$;
reset role;

-- ── admin : voit tout ; moyenne = avis COURANTS (A:5, B:3 → 4.00) ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0440000-0000-4000-a000-0000000000ad","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from app_feedback_all where user_id::text like 'f0440000%') <> 3 then raise exception 'T13 FAIL'; end if;
  if (select avg(rating) from app_feedback where user_id::text like 'f0440000%') <> 4 then raise exception 'T14 FAIL — moyenne'; end if;
  if (select count(*) from app_feedback_all where is_current and user_id::text like 'f0440000%') <> 2 then raise exception 'T14b FAIL'; end if;
  raise notice 'T13/T14 OK — admin voit tout ; note globale sur les avis courants (3 envois, 2 utilisateurs)';
end $$;
reset role;

-- ── suppression du compte : historique supprimé en cascade ──
delete from auth.users where id = 'f0440000-0000-4000-a000-00000000000a';
do $$ begin
  if exists (select 1 from app_feedback_history where user_id = 'f0440000-0000-4000-a000-00000000000a') then raise exception 'T15 FAIL'; end if;
  raise notice 'T15 OK — historique supprimé avec le compte';
end $$;
rollback;
