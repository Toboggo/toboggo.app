-- ════════════════════════════════════════════════════════════════════════════
-- Test suppression de compte — `delete_own_account()` + `audit_row()` (0038)
-- ────────────────────────────────────────────────────────────────────────────
-- Couvre la matrice de la Phase 1 (cas 1→20) : cascades / anonymisations
-- attendues, audit (acteur supprimé → NULL, source 'account_deletion'),
-- permissions, isolation, atomicité, et non-régression de l'audit normal.
-- Nécessite un accès privilégié (création d'`auth.users`).
--
-- USAGE (base LOCALE uniquement — JAMAIS staging/prod, jamais --linked) :
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/account_deletion.test.sql
--
-- Tout est encapsulé dans une transaction terminée par ROLLBACK : aucune
-- donnée persistée. Un cas en échec lève `N FAIL — …` et stoppe le script.
--
-- Impersonation : rôle + `request.jwt.claims` posés au niveau SQL (hors bloc
-- `do`), puis `reset role` + claims vidés avant chaque vérification (postgres).
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── Fixtures (postgres) ───────────────────────────────────────────────────
-- Utilisateurs : d0380000-0000-4000-a000-0000000000NN (NN = n° de cas).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
select ('d0380000-0000-4000-a000-0000000000' || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'zzz-qa-0038-' || n || '@test.local',
       jsonb_build_object('name', 'ZZZ QA ' || n), '', now(), now(), now()
from unnest(array['01','02','03','04','05','06','07','08','09',
                  '12','13','14','16','1b']) as n;
-- 12 = utilisateur A, 1b = utilisateur B (isolation) ; 16 = staff vivant.

-- Parc QA (publié, créé hors rôle authenticated → garde-fous non concernés).
insert into parks (id, name, formatted_address, lat, lng, latitude, longitude,
                   country_code, timezone, moderation_status, status)
values ('d0380000-0000-4000-a000-00000000aa01', 'ZZZ QA 0038 park', 'QA', 45.75, 4.85,
        45.75, 4.85, 'FR', 'Europe/Paris', 'published', 'published');

-- Staff : 14 = modération (également cas 15 team_members), 16 = super_admin.
insert into team_members (id, user_id, organization_id, name, email, role)
values ('d0380000-0000-4000-a000-00000000cc14', 'd0380000-0000-4000-a000-000000000014',
        null, 'ZZZ QA Modo', 'zzz-qa-0038-14@test.local', 'moderation'),
       ('d0380000-0000-4000-a000-00000000cc16', 'd0380000-0000-4000-a000-000000000016',
        null, 'ZZZ QA Admin', 'zzz-qa-0038-16@test.local', 'super_admin');

-- Instantané des lignes d'audit préexistantes (pour 18).
create temp table qa_audit_before as select id from audit_log;

-- ════════════════════════════════════════════════════════════════════════════
-- Contributions créées PAR les utilisateurs (RLS + triggers réels)
-- ════════════════════════════════════════════════════════════════════════════
set local role authenticated;

-- 02 favoris
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000002","role":"authenticated"}', true) is not null as _;
update profiles set favorites = array['d0380000-0000-4000-a000-00000000aa01'::uuid]
 where id = 'd0380000-0000-4000-a000-000000000002';

-- 03 enfants
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000003","role":"authenticated"}', true) is not null as _;
insert into children (parent_id, birth_month, birth_year)
values ('d0380000-0000-4000-a000-000000000003', 4, 2021),
       ('d0380000-0000-4000-a000-000000000003', 9, 2023);

-- 04 avis
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000004","role":"authenticated"}', true) is not null as _;
insert into reviews (id, park_id, user_id, author_name, stars, rating, comment)
values ('d0380000-0000-4000-a000-00000000bb04', 'd0380000-0000-4000-a000-00000000aa01',
        'd0380000-0000-4000-a000-000000000004', 'ZZZ QA 04', 4, 4, 'qa');

-- 05 photo
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000005","role":"authenticated"}', true) is not null as _;
insert into park_media (id, park_id, url, user_id, source, status, is_cover)
values ('d0380000-0000-4000-a000-00000000bb05', 'd0380000-0000-4000-a000-00000000aa01',
        'https://qa.test/0038.jpg', 'd0380000-0000-4000-a000-000000000005', 'user', 'pending', false);

-- 06 parc ajouté
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000006","role":"authenticated"}', true) is not null as _;
insert into parks (id, name, formatted_address, lat, lng, latitude, longitude,
                   country_code, timezone, created_by)
values ('d0380000-0000-4000-a000-00000000bb06', 'ZZZ QA 0038 added', 'QA', 45.76, 4.86,
        45.76, 4.86, 'FR', 'Europe/Paris', 'd0380000-0000-4000-a000-000000000006');

-- 07 signalement
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000007","role":"authenticated"}', true) is not null as _;
insert into reports (id, park_id, user_id, reported_by_name, reason, category, description)
values ('d0380000-0000-4000-a000-00000000bb07', 'd0380000-0000-4000-a000-00000000aa01',
        'd0380000-0000-4000-a000-000000000007', 'ZZZ QA 07', 'other', 'other', 'qa desc 07');

-- 08 park_edit
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000008","role":"authenticated"}', true) is not null as _;
insert into park_edits (id, park_id, user_id, changes)
values ('d0380000-0000-4000-a000-00000000bb08', 'd0380000-0000-4000-a000-00000000aa01',
        'd0380000-0000-4000-a000-000000000008', '{"name":"qa"}');

-- 09 combinaison (tous types)
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000009","role":"authenticated"}', true) is not null as _;
update profiles set favorites = array['d0380000-0000-4000-a000-00000000aa01'::uuid]
 where id = 'd0380000-0000-4000-a000-000000000009';
insert into children (parent_id, birth_month, birth_year)
values ('d0380000-0000-4000-a000-000000000009', 1, 2020);
insert into reviews (id, park_id, user_id, author_name, stars, rating)
values ('d0380000-0000-4000-a000-00000000b904', 'd0380000-0000-4000-a000-00000000aa01',
        'd0380000-0000-4000-a000-000000000009', 'ZZZ QA 09', 5, 5);
insert into park_media (id, park_id, url, user_id, source, status, is_cover)
values ('d0380000-0000-4000-a000-00000000b905', 'd0380000-0000-4000-a000-00000000aa01',
        'https://qa.test/0038-09.jpg', 'd0380000-0000-4000-a000-000000000009', 'user', 'pending', false);
insert into parks (id, name, formatted_address, lat, lng, latitude, longitude,
                   country_code, timezone, created_by)
values ('d0380000-0000-4000-a000-00000000b906', 'ZZZ QA 0038 added 09', 'QA', 45.77, 4.87,
        45.77, 4.87, 'FR', 'Europe/Paris', 'd0380000-0000-4000-a000-000000000009');
insert into reports (id, park_id, user_id, reported_by_name, reason, category)
values ('d0380000-0000-4000-a000-00000000b907', 'd0380000-0000-4000-a000-00000000aa01',
        'd0380000-0000-4000-a000-000000000009', 'ZZZ QA 09', 'other', 'other');
insert into park_edits (id, park_id, user_id, changes)
values ('d0380000-0000-4000-a000-00000000b908', 'd0380000-0000-4000-a000-00000000aa01',
        'd0380000-0000-4000-a000-000000000009', '{"name":"qa09"}');
insert into groups (id, park_id, code, created_by)
values ('d0380000-0000-4000-a000-00000000b909', 'd0380000-0000-4000-a000-00000000aa01',
        'QA0038', 'd0380000-0000-4000-a000-000000000009');
insert into notifications (id, user_id, type, title, description)
values ('d0380000-0000-4000-a000-00000000b910', 'd0380000-0000-4000-a000-000000000009',
        'thanks', 'qa', 'qa');

-- 12 A et B : chacun un signalement + un enfant
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000012","role":"authenticated"}', true) is not null as _;
insert into reports (id, park_id, user_id, reported_by_name, reason, category)
values ('d0380000-0000-4000-a000-00000000b120', 'd0380000-0000-4000-a000-00000000aa01',
        'd0380000-0000-4000-a000-000000000012', 'ZZZ QA A', 'other', 'other');
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-00000000001b","role":"authenticated"}', true) is not null as _;
insert into reports (id, park_id, user_id, reported_by_name, reason, category)
values ('d0380000-0000-4000-a000-00000000b12b', 'd0380000-0000-4000-a000-00000000aa01',
        'd0380000-0000-4000-a000-00000000001b', 'ZZZ QA B', 'other', 'other');
insert into children (parent_id, birth_month, birth_year)
values ('d0380000-0000-4000-a000-00000000001b', 2, 2022);

-- 13 échec intermédiaire : signalement + enfant
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000013","role":"authenticated"}', true) is not null as _;
insert into reports (id, park_id, user_id, reported_by_name, reason, category)
values ('d0380000-0000-4000-a000-00000000b130', 'd0380000-0000-4000-a000-00000000aa01',
        'd0380000-0000-4000-a000-000000000013', 'ZZZ QA 13', 'other', 'other');
insert into children (parent_id, birth_month, birth_year)
values ('d0380000-0000-4000-a000-000000000013', 5, 2019);

-- 14 modérateur : relit une proposition (audit acteur = modérateur)
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000014","role":"authenticated"}', true) is not null as _;
update park_edits set status = 'approved', reviewed_by = 'd0380000-0000-4000-a000-000000000014',
       reviewed_at = now()
 where id = 'd0380000-0000-4000-a000-00000000bb08';

reset role;
select set_config('request.jwt.claims', '', true) is not null as _;

-- 14 modérateur : signalement résolu par lui (fixture directe, autre auteur)
insert into reports (id, park_id, reported_by_name, reason, category, status, resolved_by, resolved_at)
values ('d0380000-0000-4000-a000-00000000b140', 'd0380000-0000-4000-a000-00000000aa01',
        'Autre personne', 'other', 'other', 'resolved',
        'd0380000-0000-4000-a000-000000000014', now());

-- Pré-conditions audit (10) : des lignes existent avec actor = l'utilisateur.
do $$
begin
  if (select count(*) from audit_log
      where actor_id in ('d0380000-0000-4000-a000-000000000007',
                         'd0380000-0000-4000-a000-000000000008',
                         'd0380000-0000-4000-a000-000000000009',
                         'd0380000-0000-4000-a000-000000000014')) < 4 then
    raise exception '10 FAIL (pré-condition) — lignes audit_log avec actor utilisateur absentes';
  end if;
  raise notice '10 (pré-condition) OK — audit_log existant rattaché aux utilisateurs';
end $$;

-- Rafraîchit l'instantané avec les lignes d'audit des fixtures.
truncate qa_audit_before;
insert into qa_audit_before select id from audit_log;

-- ════════════════════════════════════════════════════════════════════════════
-- 11. anon ne peut pas appeler la RPC ; authenticated sans uid refusé
-- ════════════════════════════════════════════════════════════════════════════
set local role anon;
do $$
begin
  begin
    perform public.delete_own_account();
    raise exception '11 FAIL — anon a pu exécuter delete_own_account';
  exception when insufficient_privilege then
    raise notice '11 OK — anon : EXECUTE refusé (42501)';
  end;
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin
    perform public.delete_own_account();
    raise exception '11b FAIL — authenticated sans auth.uid() accepté';
  exception when insufficient_privilege then
    raise notice '11b OK — authenticated sans JWT sub : refus explicite (42501)';
  end;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 → 9 : suppression par l'utilisateur lui-même
-- ════════════════════════════════════════════════════════════════════════════
\echo '— cas 01 à 09 : appels delete_own_account()'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000001","role":"authenticated"}', true) is not null as _;
select public.delete_own_account();
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000002","role":"authenticated"}', true) is not null as _;
select public.delete_own_account();
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000003","role":"authenticated"}', true) is not null as _;
select public.delete_own_account();
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000004","role":"authenticated"}', true) is not null as _;
select public.delete_own_account();
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000005","role":"authenticated"}', true) is not null as _;
select public.delete_own_account();
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000006","role":"authenticated"}', true) is not null as _;
select public.delete_own_account();
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000007","role":"authenticated"}', true) is not null as _;
select public.delete_own_account();
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000008","role":"authenticated"}', true) is not null as _;
select public.delete_own_account();
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000009","role":"authenticated"}', true) is not null as _;
select public.delete_own_account();
reset role;
select set_config('request.jwt.claims', '', true) is not null as _;

do $$
declare u text := 'd0380000-0000-4000-a000-0000000000';
begin
  -- 1 compte vide
  if exists (select 1 from auth.users where id = (u || '01')::uuid)
     or exists (select 1 from profiles where id = (u || '01')::uuid) then
    raise exception '1 FAIL — compte vide non supprimé';
  end if;
  raise notice '1 OK — compte vide : auth.users + profil supprimés';

  -- 2 favoris (portés par profiles.favorites)
  if exists (select 1 from profiles where id = (u || '02')::uuid)
     or exists (select 1 from auth.users where id = (u || '02')::uuid) then
    raise exception '2 FAIL — profil/favoris encore présents';
  end if;
  raise notice '2 OK — favoris supprimés avec le profil';

  -- 3 enfants
  if exists (select 1 from children where parent_id = (u || '03')::uuid) then
    raise exception '3 FAIL — enfants encore présents';
  end if;
  raise notice '3 OK — enfants supprimés (CASCADE)';

  -- 4 avis
  if exists (select 1 from reviews where id = 'd0380000-0000-4000-a000-00000000bb04') then
    raise exception '4 FAIL — avis encore présent';
  end if;
  raise notice '4 OK — avis supprimé (CASCADE)';

  -- 5 photo
  if not exists (select 1 from park_media where id = 'd0380000-0000-4000-a000-00000000bb05'
                 and user_id is null and url = 'https://qa.test/0038.jpg') then
    raise exception '5 FAIL — photo absente ou non anonymisée';
  end if;
  raise notice '5 OK — photo conservée, user_id NULL';

  -- 6 parc ajouté
  if not exists (select 1 from parks where id = 'd0380000-0000-4000-a000-00000000bb06'
                 and created_by is null and name = 'ZZZ QA 0038 added'
                 and moderation_status = 'pending') then
    raise exception '6 FAIL — parc absent, non anonymisé ou statut modifié';
  end if;
  raise notice '6 OK — parc conservé, created_by NULL, modération inchangée';

  -- 7 signalement
  if not exists (select 1 from reports where id = 'd0380000-0000-4000-a000-00000000bb07'
                 and user_id is null) then
    raise exception '7 FAIL — signalement absent ou user_id non NULL';
  end if;
  raise notice '7 OK — signalement conservé, user_id NULL';

  -- 17 reported_by_name vidé, reste du signalement intact
  if not exists (select 1 from reports where id = 'd0380000-0000-4000-a000-00000000bb07'
                 and reported_by_name = '' and description = 'qa desc 07'
                 and category = 'other' and status = 'open'
                 and park_id = 'd0380000-0000-4000-a000-00000000aa01') then
    raise exception '17 FAIL — reported_by_name non vidé ou données métier modifiées';
  end if;
  raise notice '17 OK — reported_by_name = '''' (colonne V1 NOT NULL), description/catégorie/statut/parc inchangés';

  -- 8 park_edit
  if not exists (select 1 from park_edits where id = 'd0380000-0000-4000-a000-00000000bb08'
                 and user_id is null and changes = '{"name":"qa"}') then
    raise exception '8 FAIL — park_edit absent ou non anonymisé';
  end if;
  raise notice '8 OK — park_edit conservé, user_id NULL';

  -- 9 combinaison
  if exists (select 1 from auth.users where id = (u || '09')::uuid)
     or exists (select 1 from profiles where id = (u || '09')::uuid)
     or exists (select 1 from children where parent_id = (u || '09')::uuid)
     or exists (select 1 from reviews where id = 'd0380000-0000-4000-a000-00000000b904')
     or exists (select 1 from groups where id = 'd0380000-0000-4000-a000-00000000b909')
     or exists (select 1 from notifications where id = 'd0380000-0000-4000-a000-00000000b910')
     or not exists (select 1 from park_media where id = 'd0380000-0000-4000-a000-00000000b905' and user_id is null)
     or not exists (select 1 from parks where id = 'd0380000-0000-4000-a000-00000000b906' and created_by is null)
     or not exists (select 1 from reports where id = 'd0380000-0000-4000-a000-00000000b907'
                    and user_id is null and reported_by_name = '')
     or not exists (select 1 from park_edits where id = 'd0380000-0000-4000-a000-00000000b908' and user_id is null)
  then
    raise exception '9 FAIL — combinaison : état final incorrect';
  end if;
  raise notice '9 OK — combinaison : perso/avis/groupes/notifs supprimés ; photo/parc/signalement/park_edit anonymisés';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 10 / 18 / 19 : audit
-- ════════════════════════════════════════════════════════════════════════════
do $$
begin
  -- 18 : aucune ligne (ancienne ou nouvelle) ne pointe encore vers un compte supprimé
  if exists (select 1 from audit_log where actor_id in (
      select ('d0380000-0000-4000-a000-0000000000' || n)::uuid
      from unnest(array['01','02','03','04','05','06','07','08','09']) n)) then
    raise exception '18 FAIL — audit_log référence encore un compte supprimé';
  end if;
  -- 10 : les lignes préexistantes sont toutes conservées
  if (select count(*) from audit_log a join qa_audit_before b using (id))
     <> (select count(*) from qa_audit_before) then
    raise exception '10 FAIL — des lignes audit_log préexistantes ont disparu';
  end if;
  raise notice '10 OK — audit_log existant conservé (aucune ligne supprimée)';
  -- 18 : les anciennes lignes des utilisateurs 07/08/09 sont passées à NULL
  if not exists (select 1 from audit_log a join qa_audit_before b using (id)
                 where a.entity_id = 'd0380000-0000-4000-a000-00000000bb07'
                   and a.action = 'insert' and a.actor_id is null and a.source = 'app') then
    raise exception '18 FAIL — ancienne ligne d''audit du signalement 07 non passée à NULL';
  end if;
  raise notice '18 OK — ancien audit_log.actor_id → NULL (source d''origine ''app'' conservée)';

  -- 19 : lignes créées pendant la suppression
  if not exists (select 1 from audit_log a
                 where a.id not in (select id from qa_audit_before)
                   and a.entity_type = 'reports' and a.entity_id = 'd0380000-0000-4000-a000-00000000bb07'
                   and a.action = 'update' and a.source = 'account_deletion'
                   and a.actor_id is null and a.new_value->>'user_id' is null) then
    raise exception '19 FAIL — pas de ligne d''audit account_deletion (reports, user_id → NULL)';
  end if;
  if not exists (select 1 from audit_log a
                 where a.id not in (select id from qa_audit_before)
                   and a.entity_type = 'park_edits' and a.entity_id = 'd0380000-0000-4000-a000-00000000bb08'
                   and a.source = 'account_deletion' and a.actor_id is null) then
    raise exception '19 FAIL — pas de ligne d''audit account_deletion (park_edits)';
  end if;
  if exists (select 1 from audit_log a
             where a.id not in (select id from qa_audit_before)
               and a.source = 'account_deletion' and a.actor_id is not null) then
    raise exception '19 FAIL — ligne account_deletion avec actor_id non NULL';
  end if;
  -- cohérence de l'UPDATE d'anonymisation : une seule ligne par signalement
  -- anonymisé pour reported_by_name, pas de boucle
  if (select count(*) from audit_log a
      where a.id not in (select id from qa_audit_before)
        and a.entity_id = 'd0380000-0000-4000-a000-00000000bb07') <> 2 then
    raise exception '19 FAIL — nombre inattendu de lignes d''audit pour le signalement 07 (attendu 2 : nom vidé, puis user_id NULL)';
  end if;
  raise notice '19 OK — audit généré pendant la suppression : actor_id NULL, source account_deletion ; 2 lignes pour le signalement (nom vidé, user_id NULL), sans boucle';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 12. isolation : A se supprime, B intact ; aucun argument possible
-- ════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000012","role":"authenticated"}', true) is not null as _;
do $$
begin
  begin
    execute 'select public.delete_own_account(''d0380000-0000-4000-a000-00000000001b''::uuid)';
    raise exception '12 FAIL — delete_own_account accepte un argument';
  exception when undefined_function then
    raise notice '12 OK — aucune signature avec user_id : impossible de cibler un autre compte';
  end;
end $$;
select public.delete_own_account();
reset role;
select set_config('request.jwt.claims', '', true) is not null as _;
do $$
begin
  if exists (select 1 from auth.users where id = 'd0380000-0000-4000-a000-000000000012') then
    raise exception '12 FAIL — A non supprimé';
  end if;
  if not exists (select 1 from auth.users where id = 'd0380000-0000-4000-a000-00000000001b')
     or not exists (select 1 from profiles where id = 'd0380000-0000-4000-a000-00000000001b')
     or not exists (select 1 from children where parent_id = 'd0380000-0000-4000-a000-00000000001b')
     or not exists (select 1 from reports where id = 'd0380000-0000-4000-a000-00000000b12b'
                    and user_id = 'd0380000-0000-4000-a000-00000000001b'
                    and reported_by_name = 'ZZZ QA B') then
    raise exception '12 FAIL — B affecté par la suppression de A';
  end if;
  raise notice '12 OK — seul le compte appelant est supprimé ; B (compte, profil, enfant, signalement nominatif) intact';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 13. échec intermédiaire → rien de partiellement supprimé
-- ════════════════════════════════════════════════════════════════════════════
-- Trigger de sabotage (transaction de test uniquement) : échoue quand la
-- cascade passe reports.user_id à NULL, c.-à-d. APRÈS l'anonymisation du nom
-- et APRÈS le DELETE auth.users.
create function pg_temp.qa_0038_fail() returns trigger language plpgsql as $$
begin
  if old.user_id = 'd0380000-0000-4000-a000-000000000013' and new.user_id is null then
    raise exception 'qa_0038 sabotage' using errcode = 'P0013';
  end if;
  return new;
end $$;
create trigger qa_0038_fail before update on reports
  for each row execute function pg_temp.qa_0038_fail();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000013","role":"authenticated"}', true) is not null as _;
do $$
begin
  begin
    perform public.delete_own_account();
    raise exception '13 FAIL — le sabotage n''a pas interrompu la suppression';
  exception when sqlstate 'P0013' then
    raise notice '13 (déclenchement) — échec intermédiaire provoqué';
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true) is not null as _;
drop trigger qa_0038_fail on reports;
do $$
begin
  if not exists (select 1 from auth.users where id = 'd0380000-0000-4000-a000-000000000013')
     or not exists (select 1 from profiles where id = 'd0380000-0000-4000-a000-000000000013')
     or not exists (select 1 from children where parent_id = 'd0380000-0000-4000-a000-000000000013')
     or not exists (select 1 from reports where id = 'd0380000-0000-4000-a000-00000000b130'
                    and user_id = 'd0380000-0000-4000-a000-000000000013'
                    and reported_by_name = 'ZZZ QA 13')
     or exists (select 1 from audit_log where source = 'account_deletion'
                and entity_id = 'd0380000-0000-4000-a000-00000000b130') then
    raise exception '13 FAIL — état partiellement supprimé après échec';
  end if;
  if coalesce(current_setting('toboggo.audit_source', true), '') <> '' then
    raise exception '13 FAIL — toboggo.audit_source a fui après échec';
  end if;
  raise notice '13 OK — échec intermédiaire : compte, profil, enfant, nom du signalement et audit intacts (rollback complet)';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 14 / 15. modérateur (resolved_by / reviewed_by) ; team_members inchangé
-- ════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000014","role":"authenticated"}', true) is not null as _;
select public.delete_own_account();
reset role;
select set_config('request.jwt.claims', '', true) is not null as _;
do $$
begin
  if exists (select 1 from auth.users where id = 'd0380000-0000-4000-a000-000000000014') then
    raise exception '14 FAIL — modérateur non supprimé';
  end if;
  if not exists (select 1 from reports where id = 'd0380000-0000-4000-a000-00000000b140'
                 and resolved_by is null and status = 'resolved'
                 and reported_by_name = 'Autre personne') then
    raise exception '14 FAIL — signalement résolu : resolved_by non NULL ou données modifiées';
  end if;
  if not exists (select 1 from park_edits where id = 'd0380000-0000-4000-a000-00000000bb08'
                 and reviewed_by is null and status = 'approved') then
    raise exception '14 FAIL — park_edit relu : reviewed_by non NULL ou statut modifié';
  end if;
  raise notice '14 OK — modérateur supprimé ; resolved_by / reviewed_by → NULL, décisions conservées, nom du signalant tiers intact';

  -- 15 : comportement team_members INCHANGÉ (ligne conservée, user_id NULL via FK)
  if not exists (select 1 from team_members where id = 'd0380000-0000-4000-a000-00000000cc14'
                 and user_id is null and email = 'zzz-qa-0038-14@test.local'
                 and role = 'moderation' and organization_id is null) then
    raise exception '15 FAIL — cycle de vie team_members modifié';
  end if;
  raise notice '15 OK — team_members : comportement actuel conservé (ligne gardée, user_id NULL) — réattribution par e-mail = chantier sécurité séparé';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 16 / 20. audit normal d'un utilisateur vivant (et pas de fuite de source
-- après les suppressions précédentes dans la même transaction)
-- ════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0380000-0000-4000-a000-000000000016","role":"authenticated"}', true) is not null as _;
insert into reports (id, park_id, user_id, reported_by_name, reason, category)
values ('d0380000-0000-4000-a000-00000000b160', 'd0380000-0000-4000-a000-00000000aa01',
        'd0380000-0000-4000-a000-000000000016', 'ZZZ QA 16', 'other', 'other');
update reports set status = 'in_progress'
 where id = 'd0380000-0000-4000-a000-00000000b160';
reset role;
select set_config('request.jwt.claims', '', true) is not null as _;
do $$
begin
  if not exists (select 1 from audit_log where entity_id = 'd0380000-0000-4000-a000-00000000b160'
                 and action = 'insert' and actor_id = 'd0380000-0000-4000-a000-000000000016'
                 and source = 'app') then
    raise exception '16 FAIL — INSERT d''un vivant : actor_id/source incorrects';
  end if;
  raise notice '16 OK — audit normal (INSERT) : actor_id = uid, source = app';
  if not exists (select 1 from audit_log where entity_id = 'd0380000-0000-4000-a000-00000000b160'
                 and action = 'update' and actor_id = 'd0380000-0000-4000-a000-000000000016'
                 and source = 'app' and new_value->>'status' = 'in_progress') then
    raise exception '20 FAIL — UPDATE reports d''un vivant : actor_id/source incorrects';
  end if;
  raise notice '20 OK — UPDATE reports par un vivant : actor_id = uid, source = app (pas de fuite après suppressions)';
end $$;

\echo '════ account_deletion.test.sql : tous les cas OK — ROLLBACK ════'
rollback;
