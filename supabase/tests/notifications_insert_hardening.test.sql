-- ════════════════════════════════════════════════════════════════════════════
-- Test `notifications_insert_hardening` (migration 0054)
-- ────────────────────────────────────────────────────────────────────────────
-- Vérifie, sous les vrais rôles `anon` / `authenticated` (+ JWT), que :
--   • un utilisateur peut s'écrire une notification à lui-même ;
--   • il ne peut PAS en écrire une pour un autre ;
--   • `anon` n'a aucun privilège (écriture, lecture) ;
--   • la lecture / le marquage « lu » restent limités à ses propres lignes ;
--   • un utilisateur ne peut ni supprimer ni détourner une notification (UPDATE du user_id).
-- 11 scénarios. Nécessite un accès privilégié (création d'`auth.users`) : base LOCALE ou
-- connexion admin STAGING, JAMAIS la production.
--
-- USAGE : docker exec -i supabase_db_<project> psql -U postgres -d <db> \
--           -v ON_ERROR_STOP=1 < supabase/tests/notifications_insert_hardening.test.sql
-- Tout est encapsulé dans une transaction terminée par ROLLBACK : aucune donnée persistée.
-- Avant 0054 : les scénarios 2, 7, 8, 9 échouent (l'exploit fonctionne). Après : 11/11.
-- ════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('e0540054-0000-4000-a000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'notif-a-0054@test.local', '', now(), now(), now()),
  ('e0540054-0000-4000-a000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'notif-b-0054@test.local', '', now(), now(), now());

-- Une notification légitime de B, créée par le système (postgres), pour tester l'isolation en lecture.
insert into notifications (id, user_id, type, title, description)
values ('e0540054-0000-4000-a000-0000000000d2', 'e0540054-0000-4000-a000-00000000000b',
        'thanks', 'zzz_test_0054_b', 'zzz_test_0054_b');

-- ── Utilisateur A ────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0540054-0000-4000-a000-00000000000a","role":"authenticated"}', true);

do $$ begin
  insert into notifications (id, user_id, type, title, description)
  values ('e0540054-0000-4000-a000-0000000000d1', 'e0540054-0000-4000-a000-00000000000a',
          'thanks', 'zzz_test_0054_a', 'zzz_test_0054_a');
  raise notice '1 OK — auto-insertion autorisée';
end $$;

do $$ begin
  begin
    insert into notifications (user_id, type, title, description)
    values ('e0540054-0000-4000-a000-00000000000b', 'thanks', 'zzz_test_0054_spam', 'zzz_test_0054_spam');
    raise exception '2 FAIL — insertion pour autrui acceptée';
  exception when insufficient_privilege then
    raise notice '2 OK — insertion pour un autre utilisateur refusée';
  end;
end $$;

do $$ declare n int; begin
  select count(*) into n from notifications;
  if n <> 1 then raise exception '3 FAIL — A voit % notification(s) au lieu de 1 (la sienne)', n; end if;
  raise notice '3 OK — A ne voit que ses propres notifications';
end $$;

do $$ declare touched int; begin
  update notifications set read = true where id = 'e0540054-0000-4000-a000-0000000000d1';
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception '4 FAIL — marquage lu de sa notification : % ligne(s)', touched; end if;
  update notifications set read = true where id = 'e0540054-0000-4000-a000-0000000000d2';
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception '4 FAIL — A a modifié la notification de B (% ligne(s))', touched; end if;
  raise notice '4 OK — marquage « lu » limité à ses propres notifications';
end $$;

-- 8. A ne peut pas supprimer (plus de DELETE)
do $$ begin
  begin
    delete from notifications where id = 'e0540054-0000-4000-a000-0000000000d1';
    raise exception '5 FAIL — DELETE accepté';
  exception when insufficient_privilege then
    raise notice '5 OK — DELETE refusé (aucun flux ne l''utilise)';
  end;
end $$;

-- 9. A ne peut pas « donner » sa notification à B par UPDATE du user_id (déplacement)
do $$ begin
  begin
    update notifications set user_id = 'e0540054-0000-4000-a000-00000000000b'
     where id = 'e0540054-0000-4000-a000-0000000000d1';
    raise exception '6 FAIL — A a pu réaffecter sa notification à B';
  exception when insufficient_privilege then
    raise notice '6 OK — réaffectation du user_id refusée';
  end;
end $$;

reset role;
select set_config('request.jwt.claims', null, true);

-- ── anon (clé publique, sans session) ───────────────────────────────────────
set local role anon;

do $$ begin
  begin
    insert into notifications (user_id, type, title, description)
    values ('e0540054-0000-4000-a000-00000000000a', 'thanks', 'zzz_test_0054_anon', 'zzz_test_0054_anon');
    raise exception '7 FAIL — anon a pu insérer une notification';
  exception when insufficient_privilege then
    raise notice '7 OK — anon sans privilège INSERT';
  end;
end $$;

do $$ declare n int; begin
  begin
    select count(*) into n from notifications;
    raise exception '8 FAIL — anon a pu lire % ligne(s)', n;
  exception when insufficient_privilege then
    raise notice '8 OK — anon sans privilège SELECT';
  end;
end $$;

do $$ begin
  begin
    update notifications set read = true;
    raise exception '9 FAIL — anon a pu modifier des notifications';
  exception when insufficient_privilege then
    raise notice '9 OK — anon sans privilège UPDATE';
  end;
end $$;

reset role;

-- ── Contrôles de catalogue ──────────────────────────────────────────────────
do $$ begin
  if has_table_privilege('authenticated', 'public.notifications', 'DELETE,TRUNCATE,TRIGGER,REFERENCES') then
    raise exception '10 FAIL — authenticated a des privilèges excédentaires';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass) then
    raise exception '10 FAIL — RLS désactivée';
  end if;
  raise notice '10 OK — privilèges authenticated minimaux, RLS active';
end $$;

-- ── Non-régression : service_role / postgres (envois côté serveur) inchangés ─
set local role service_role;
do $$ begin
  insert into notifications (user_id, type, title, description)
  values ('e0540054-0000-4000-a000-00000000000b', 'thanks', 'zzz_test_0054_srv', 'zzz_test_0054_srv');
  raise notice '11 OK — service_role peut toujours notifier un utilisateur';
end $$;
reset role;

do $$ begin raise notice '━━━ notifications_insert_hardening : 11/11 OK ━━━'; end $$;

rollback;
