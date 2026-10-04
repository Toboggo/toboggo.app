-- ════════════════════════════════════════════════════════════════════════════
-- Test historique `app_feedback` (migration 0044) — délai 30 j, dernier avis
-- seul modifiable, isolation, note globale = derniers avis.
-- USAGE (base LOCALE ou STAGING — JAMAIS la production) :
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/app_feedback_history.test.sql
-- Transaction terminée par ROLLBACK. (La concurrence réelle est testée à part
-- avec deux sessions psql — voir PR.)
-- ════════════════════════════════════════════════════════════════════════════
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('f0440000-0000-4000-a000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-fh-a-0044@test.local', '', now(), now(), now()),
  ('f0440000-0000-4000-a000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-fh-b-0044@test.local', '', now(), now(), now()),
  ('f0440000-0000-4000-a000-0000000000ad', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-fh-admin-0044@test.local', '', now(), now(), now());
insert into team_members (user_id, organization_id, role, name, email) values ('f0440000-0000-4000-a000-0000000000ad', null, 'super_admin', 'zzz admin 0044', 'zzz-fh-admin-0044@test.local');
-- Ancien avis (format 0039, avec titre) pour A, daté de 40 jours : doit être conservé.
insert into app_feedback (user_id, rating, title, body, created_at) values ('f0440000-0000-4000-a000-00000000000a', 2, 'Ancien titre', 'Ancien texte', now() - interval '40 days');

-- ── A ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0440000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare first_id uuid; second_id uuid; c0 timestamptz;
begin
  -- Le dernier avis a plus de 30 j → un nouvel avis est autorisé ; titre/commentaire facultatifs.
  insert into app_feedback (user_id, rating) values (auth.uid(), 4) returning id, created_at into second_id, c0;
  raise notice 'T1 OK — nouvel avis (note seule) après 40 j, ancien conservé';
  if (select count(*) from app_feedback) <> 2 then raise exception 'T1b FAIL'; end if;
  if (select title from app_feedback where rating = 2) <> 'Ancien titre' then raise exception 'T1c FAIL — titre existant perdu'; end if;

  begin insert into app_feedback (user_id, rating) values (auth.uid(), 5); raise exception 'T2 FAIL — 2e avis < 30 j accepté';
  exception when raise_exception then
    if sqlerrm <> 'app_feedback_too_soon' then raise; end if;
    raise notice 'T2 OK — nouvel avis < 30 j refusé'; end;

  -- Modification du dernier avis : created_at inchangé, edited_at renseigné, délai non redémarré.
  update app_feedback set rating = 5, body = 'Mieux', created_at = now() + interval '1 year' where id = second_id;
  if (select created_at from app_feedback where id = second_id) <> c0 then raise exception 'T3 FAIL — created_at modifié'; end if;
  if (select edited_at from app_feedback where id = second_id) is null then raise exception 'T3b FAIL — edited_at absent'; end if;
  raise notice 'T3 OK — modification du dernier avis (created_at conservé, edited_at posé)';

  -- L'ancien avis n'est plus modifiable (0 ligne).
  update app_feedback set rating = 1 where rating = 2;
  if (select rating from app_feedback where title = 'Ancien titre') <> 2 then raise exception 'T4 FAIL — ancien avis modifié'; end if;
  raise notice 'T4 OK — ancien avis non modifiable';

  begin insert into app_feedback (user_id, rating) values ('f0440000-0000-4000-a000-00000000000b', 5); raise exception 'T5 FAIL';
  exception when insufficient_privilege then raise notice 'T5 OK — insert pour autrui refusé'; end;
  begin delete from app_feedback where id = second_id; if found then raise exception 'T6 FAIL — delete autorisé'; end if;
  exception when insufficient_privilege then null; end;
  raise notice 'T6 OK — pas de DELETE';
end $$;
reset role;

-- ── B : isolation + premier avis ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0440000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from app_feedback) <> 0 then raise exception 'T7 FAIL — B voit les avis de A'; end if;
  update app_feedback set rating = 1;
  if exists (select 1 from app_feedback) then raise exception 'T7b FAIL'; end if;
  begin insert into app_feedback (user_id, rating, body) values (auth.uid(), 0, 'x'); raise exception 'T8 FAIL';
  exception when check_violation then raise notice 'T8 OK — note 0 refusée'; end;
  insert into app_feedback (user_id, rating, body) values (auth.uid(), 3, 'ok');
  if (select rating_count from app_feedback_summary) <> 1 then raise exception 'T9 FAIL — la synthèse de B doit se limiter à lui'; end if;
  raise notice 'T7/T9 OK — isolation entre comptes';
end $$;
reset role;

-- ── anon : aucun accès ──
set local role anon;
do $$ begin
  begin perform 1 from app_feedback; raise exception 'T10 FAIL'; exception when insufficient_privilege then raise notice 'T10 OK — anon refusé (table)'; end;
  begin perform 1 from app_feedback_summary; raise exception 'T10b FAIL'; exception when insufficient_privilege then raise notice 'T10b OK — anon refusé (vue)'; end;
end $$;
reset role;

-- ── admin : voit tout ; moyenne = derniers avis seulement (A:5, B:3 → 4.00) ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0440000-0000-4000-a000-0000000000ad","role":"authenticated"}', true);
do $$
declare s record;
begin
  if (select count(*) from app_feedback where user_id::text like 'f0440000%') <> 3 then raise exception 'T11 FAIL — admin ne voit pas tout'; end if;
  select * into s from app_feedback_summary;
  -- (la base locale peut contenir d'autres avis : on compare sur nos utilisateurs)
  if (select avg(rating) from app_feedback_latest where user_id::text like 'f0440000%') <> 4 then raise exception 'T12 FAIL — moyenne'; end if;
  if (select count(*) from app_feedback_latest where user_id::text like 'f0440000%') <> 2 then raise exception 'T12b FAIL — latest'; end if;
  raise notice 'T11/T12 OK — admin voit tout ; note globale sur les derniers avis (3 soumissions, 2 utilisateurs)';
end $$;
reset role;

rollback;
