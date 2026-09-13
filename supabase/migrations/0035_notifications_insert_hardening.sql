-- ════════════════════════════════════════════════════════════════════════════
-- 0035 — notifications : anon ne doit plus pouvoir insérer pour autrui
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. Aucune donnée réécrite, aucune table/colonne supprimée,
-- aucune migration figée (0001→0034) modifiée. `DROP POLICY` uniquement pour
-- recréer immédiatement la policy corrigée (même méthode que 0026/0027).
--
-- CONTEXTE (audit de confirmation V1 hardening, §2)
-- --------------------------------------------------
-- `notifications_insert` (0002_rls.sql) = `with check (true)` : aucune
-- contrainte, pas même `auth.uid() is not null`. `0019_v2_grants.sql`
-- REVOKE/re-GRANT les 17 tables du modèle v2 mais NE TOUCHE PAS aux tables v1
-- (`notifications`, `group_members`, `activity_log`, …), qui conservent donc
-- le GRANT ALL par défaut Supabase à `anon`/`authenticated`
-- (auto_expose_new_tables — cf. le commentaire de 0019 lui-même à ce sujet).
-- Combiné, un rôle `anon` (sans aucune session) peut aujourd'hui
-- `INSERT INTO notifications (user_id, ...)` pour N'IMPORTE QUEL `user_id` —
-- capacité de spam/hameçonnage dans la boîte de n'importe quel utilisateur.
--
-- Aucun appel `.insert()` sur `notifications` n'existe dans le code
-- applicatif actuel (`packages/shared/src/api/notifications.ts` ne fait que
-- lire et marquer "lu" ; aucun trigger SQL n'insère non plus dans cette
-- table) : resserrer l'INSERT ne casse donc aucun mécanisme existant.
--
-- CORRECTIF
-- ---------
--  1. RLS : `notifications_insert` exige désormais `user_id = auth.uid()`
--     (au lieu de `true`) — un utilisateur ne peut créer une notification que
--     pour lui-même. `anon` (`auth.uid()` toujours NULL) en est de fait
--     exclu, comme `notifications_own`/`notifications_update_own` déjà.
--  2. GRANT (2ᵉ ligne de défense, même principe que 0019) : `REVOKE ALL` sur
--     `notifications` pour `anon`/`authenticated`, puis re-`GRANT` du strict
--     nécessaire — `anon` : aucun privilège (donnée privée, jamais publique,
--     contrairement aux tables v2 où anon garde un SELECT) ; `authenticated` :
--     SELECT + INSERT + UPDATE (pas de DELETE : aucun flux applicatif ne
--     supprime de notification aujourd'hui).
--
-- HORS PÉRIMÈTRE — group_members (analysé, non modifié)
-- -------------------------------------------------------
-- `group_members` (0001_init.sql/0002_rls.sql) n'a AUCUNE colonne d'identité
-- (`id`, `group_id`, `name` texte libre, `status`) et ses policies sont
-- `using(true)` / `with check(true)`, sans même `auth.uid() is not null`. Le
-- code applicatif (`packages/shared/src/api/groups.ts` : `joinGroup`)
-- confirme que rejoindre un groupe par code n'est PAS pensé comme lié à un
-- compte : le commentaire produit d'origine (0002_rls.sql, "any authenticated
-- user can create/join — low sensitivity — a live-location meetup code
-- shared voluntarily by parents") documente un choix fonctionnel volontaire
-- de faible sensibilité, pas un oubli. Le seul écart réel avec ce commentaire
-- est que `group_members` fonctionne aussi pour `anon` (pas seulement
-- `authenticated`), faute de REVOKE — mais la donnée exposée/écrite reste un
-- simple nom choisi par l'utilisateur + un statut, jamais un identifiant de
-- compte, et l'accès reste borné à un `group_id` déjà connu (obtenu via le
-- code de partage à 5 caractères). Ce n'est pas une vulnérabilité
-- supplémentaire démontrée qui imposerait une correction immédiate : AUCUNE
-- policy ni GRANT de `group_members` n'est modifiée par cette migration. Si ce
-- périmètre doit un jour être resserré (ex. exiger `auth.uid() is not null`
-- pour rejoindre), ce sera une décision produit explicite, pas un effet de
-- bord du durcissement de `notifications`.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. RLS ──────────────────────────────────────────────────────────────────
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications for insert
  with check (user_id = auth.uid());

-- ── 2. GRANT (2ᵉ ligne de défense) ──────────────────────────────────────────
revoke all on notifications from anon, authenticated;
grant select, insert, update on notifications to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Assertions structurelles
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare ins text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass) then
    raise exception '0035: RLS désactivée sur public.notifications';
  end if;

  select with_check into ins from pg_policies
   where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_insert';
  if ins is null or ins !~ 'user_id = auth\.uid\(\)' then
    raise exception '0035: notifications_insert ne borne pas user_id = auth.uid() : %', ins;
  end if;

  -- anon : plus aucun privilège de table sur notifications
  if has_table_privilege('anon', 'public.notifications', 'SELECT')
     or has_table_privilege('anon', 'public.notifications', 'INSERT')
     or has_table_privilege('anon', 'public.notifications', 'UPDATE')
     or has_table_privilege('anon', 'public.notifications', 'DELETE') then
    raise exception '0035: anon conserve un privilège de table sur notifications';
  end if;

  -- authenticated : exactement SELECT + INSERT + UPDATE
  if not (has_table_privilege('authenticated', 'public.notifications', 'SELECT')
          and has_table_privilege('authenticated', 'public.notifications', 'INSERT')
          and has_table_privilege('authenticated', 'public.notifications', 'UPDATE')) then
    raise exception '0035: authenticated devrait avoir SELECT+INSERT+UPDATE sur notifications';
  end if;
  if has_table_privilege('authenticated', 'public.notifications', 'DELETE') then
    raise exception '0035: authenticated ne devrait pas avoir DELETE sur notifications (aucun flux ne l''utilise)';
  end if;

  raise notice '0035 OK — assertions structurelles (policy + GRANT) passées';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Assertions comportementales
-- ────────────────────────────────────────────────────────────────────────────
-- Fixtures éphémères (2 comptes), tout est nettoyé en fin de script.
-- ════════════════════════════════════════════════════════════════════════════
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00350035-0000-4000-a000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'notif-a-0035@test.local', '', now(), now(), now()),
  ('00350035-0000-4000-a000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'notif-b-0035@test.local', '', now(), now(), now());

-- ── Utilisateur A ────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00350035-0000-4000-a000-00000000000a","role":"authenticated"}', true);

-- 1. A peut s'insérer une notification à lui-même
do $$
begin
  insert into notifications (id, user_id, type, title, description)
  values ('00350035-0000-4000-a000-0000000000d1', '00350035-0000-4000-a000-00000000000a',
          'thanks', 'zzz_test_0035', 'zzz_test_0035');
  raise notice '1 OK — auto-insertion autorisée';
end $$;

-- 2. A ne peut PAS insérer une notification pour B
do $$
begin
  begin
    insert into notifications (user_id, type, title, description)
    values ('00350035-0000-4000-a000-00000000000b', 'thanks', 'zzz_test_0035', 'zzz_test_0035');
    raise exception '2 FAIL — insertion pour autrui acceptée';
  exception when insufficient_privilege then
    raise notice '2 OK — insertion pour un autre utilisateur refusée';
  end;
end $$;

reset role;
select set_config('request.jwt.claims', null, true);

-- ── anon ────────────────────────────────────────────────────────────────────
-- 3. anon ne peut rien insérer (GRANT révoqué -> insufficient_privilege avant
--    même l'évaluation de la policy).
set local role anon;
do $$
begin
  begin
    insert into notifications (user_id, type, title, description)
    values ('00350035-0000-4000-a000-00000000000a', 'thanks', 'zzz_test_0035', 'zzz_test_0035');
    raise exception '3 FAIL — anon a pu insérer une notification';
  exception when insufficient_privilege then
    raise notice '3 OK — anon sans privilège INSERT sur notifications';
  end;
end $$;

-- 4. anon ne peut rien lire non plus (donnée privée, pas de SELECT public ici)
do $$
declare n int;
begin
  select count(*) into n from notifications where title = 'zzz_test_0035';
  raise exception '4 FAIL — anon a pu lire % ligne(s) de notifications', n;
exception when insufficient_privilege then
  raise notice '4 OK — anon sans privilège SELECT sur notifications';
end $$;
reset role;

-- ── Nettoyage des fixtures ───────────────────────────────────────────────────
delete from notifications where user_id in
  ('00350035-0000-4000-a000-00000000000a', '00350035-0000-4000-a000-00000000000b');
delete from auth.users where id in
  ('00350035-0000-4000-a000-00000000000a', '00350035-0000-4000-a000-00000000000b');

do $$ begin
  raise notice '0035 OK — notifications : auto-insertion seule autorisée, anon sans privilège (RLS + GRANT) ; group_members analysé, non modifié';
end $$;
