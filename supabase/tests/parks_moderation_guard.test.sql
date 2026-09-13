-- ════════════════════════════════════════════════════════════════════════════
-- Test `parks_moderation_guard` — un créateur ne peut plus s'auto-publier
-- (migration 0036)
-- ────────────────────────────────────────────────────────────────────────────
-- Vérifie le comportement sous rôle AUTHENTIFIÉ (simple créateur / contributeur
-- et support d'une organisation / gestionnaire V2 / gestionnaire d'une autre
-- collectivité / gestionnaire V1 via commune_id / staff), ce que les
-- assertions embarquées dans 0036 ne couvrent pas (elles se limitent au rôle
-- migration / import OSM, comme 0026/0027 se limitent à `anon`). Couvre en
-- particulier la revue complémentaire : `contributeur`/`support` d'une
-- organisation propriétaire NE DOIVENT PAS pouvoir modérer (règle produit
-- documentée dans `apps/backoffice/src/lib/permissions.ts` `canEditPark`),
-- contrairement à ce que `manages_park()`/`is_commune_member()` auraient
-- laissé passer. 14 scénarios. Nécessite un accès privilégié (création
-- d'`auth.users`) : à lancer sur base LOCALE ou avec une connexion admin
-- STAGING, pas via le rôle bas privilège de `supabase test db`.
--
-- USAGE (base LOCALE ou STAGING — JAMAIS la production) :
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/parks_moderation_guard.test.sql
--
-- Tout est encapsulé dans une transaction terminée par ROLLBACK : aucune
-- donnée persistée (ni comptes, ni organisations, ni parcs).
--
-- Impersonation : le rôle et `request.jwt.claims` sont posés au niveau SQL
-- AVANT chaque bloc `do` (donc hors de toute sous-transaction plpgsql : un
-- `begin/exception` interne ne les annule pas). Même convention que
-- `park_media_moderation.test.sql`.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── Fixtures (rôle postgres — hors périmètre du garde-fou) ─────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('e0360036-0000-4000-a000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'creator-0036@test.local', '', now(), now(), now()),
  ('e0360036-0000-4000-a000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gest-a-0036@test.local', '', now(), now(), now()),
  ('e0360036-0000-4000-a000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gest-b-0036@test.local', '', now(), now(), now()),
  ('e0360036-0000-4000-a000-00000000000d', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'staff-0036@test.local', '', now(), now(), now()),
  ('e0360036-0000-4000-a000-00000000000e', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'contrib-a-0036@test.local', '', now(), now(), now()),
  ('e0360036-0000-4000-a000-00000000000f', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'support-a-0036@test.local', '', now(), now(), now());

insert into organizations (id, name, type)
values ('e0360036-0000-4000-a000-0000000000f1', 'zzz_test_org_a_0036', 'municipality'),
       ('e0360036-0000-4000-a000-0000000000f2', 'zzz_test_org_b_0036', 'municipality');

-- Coexistence V1 : team_members_v1_compat_biu recopie organization_id ->
-- commune_id (FK vers `communes`), d'où les lignes miroir (même id).
insert into communes (id, name)
values ('e0360036-0000-4000-a000-0000000000f1', 'zzz_test_org_a_0036'),
       ('e0360036-0000-4000-a000-0000000000f2', 'zzz_test_org_b_0036');

insert into team_members (user_id, organization_id, name, email, role)
values
  ('e0360036-0000-4000-a000-00000000000b', 'e0360036-0000-4000-a000-0000000000f1',
   'Gestionnaire A', 'gest-a-0036@test.local', 'gestionnaire'),
  ('e0360036-0000-4000-a000-00000000000c', 'e0360036-0000-4000-a000-0000000000f2',
   'Gestionnaire B (autre collectivité)', 'gest-b-0036@test.local', 'gestionnaire'),
  ('e0360036-0000-4000-a000-00000000000d', null,
   'Staff Toboggo', 'staff-0036@test.local', 'moderation'),
  ('e0360036-0000-4000-a000-00000000000e', 'e0360036-0000-4000-a000-0000000000f1',
   'Contributeur A', 'contrib-a-0036@test.local', 'contributeur'),
  ('e0360036-0000-4000-a000-00000000000f', 'e0360036-0000-4000-a000-0000000000f1',
   'Support A', 'support-a-0036@test.local', 'support');

-- Parc lié à l'organisation A côté V2 (`organization_parks`), sans `commune_id`
-- — isole le test du gestionnaire sur la seule branche `manages_park`.
insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status, created_by)
values ('e0360036-0000-4000-a000-0000000000e2', 'zzz_test_0036_park_v2', 42.5, 4.5, 'FR', 'Europe/Paris',
        'pending', 'e0360036-0000-4000-a000-00000000000b');
insert into organization_parks (organization_id, park_id, role)
values ('e0360036-0000-4000-a000-0000000000f1', 'e0360036-0000-4000-a000-0000000000e2', 'owner');

-- ════════════════════════════════════════════════════════════════════════════
-- Simple créateur (aucune ligne team_members)
-- ════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0360036-0000-4000-a000-00000000000a","role":"authenticated"}', true);

-- 1. création normale (pending) → OK
do $$
begin
  insert into parks (id, name, latitude, longitude, country_code, timezone, status, created_by)
  values ('e0360036-0000-4000-a000-0000000000e1', 'zzz_test_0036_park_creator', 42.5, 4.5, 'FR', 'Europe/Paris',
          'pending', 'e0360036-0000-4000-a000-00000000000a');
  raise notice '1 OK — création pending par un simple créateur autorisée';
end $$;

-- 2. création DÉJÀ publiée (moderation_status) → refusée
do $$
begin
  begin
    insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status, created_by)
    values ('e0360036-0000-4000-a000-0000000000e3', 'zzz_test_0036_hack1', 42.5, 4.5, 'FR', 'Europe/Paris',
            'published', 'e0360036-0000-4000-a000-00000000000a');
    raise exception '2 FAIL — création moderation_status=published acceptée';
  exception when insufficient_privilege then
    raise notice '2 OK — création moderation_status=published refusée';
  end;
end $$;

-- 3. création DÉJÀ publiée via le champ legacy `status` uniquement → refusée
--    (contournement moderation_status ⇄ status)
do $$
begin
  begin
    insert into parks (id, name, latitude, longitude, country_code, timezone, status, created_by)
    values ('e0360036-0000-4000-a000-0000000000e4', 'zzz_test_0036_hack2', 42.5, 4.5, 'FR', 'Europe/Paris',
            'published', 'e0360036-0000-4000-a000-00000000000a');
    raise exception '3 FAIL — création status=published (legacy) acceptée';
  exception when insufficient_privilege then
    raise notice '3 OK — création status=published (legacy) refusée';
  end;
end $$;

-- 4. édition légitime de son propre parc (name) → OK, non affectée
do $$
begin
  update parks set name = 'zzz_test_0036_park_creator_renamed'
   where id = 'e0360036-0000-4000-a000-0000000000e1';
  if (select name from parks where id = 'e0360036-0000-4000-a000-0000000000e1')
     <> 'zzz_test_0036_park_creator_renamed' then
    raise exception '4 FAIL — édition légitime (name) bloquée à tort';
  end if;
  raise notice '4 OK — édition d''un champ non protégé toujours autorisée';
end $$;

-- 5. auto-publication par UPDATE (moderation_status) → refusée
do $$
declare touched int;
begin
  update parks set moderation_status = 'published' where id = 'e0360036-0000-4000-a000-0000000000e1';
  get diagnostics touched = row_count;
  raise exception '5 FAIL — % ligne(s) auto-publiée(s) par le créateur', touched;
exception when insufficient_privilege then
  raise notice '5 OK — auto-publication par UPDATE moderation_status refusée';
end $$;

-- 6. contournement par UPDATE du champ legacy `status` uniquement → refusée
do $$
declare touched int;
begin
  update parks set status = 'published' where id = 'e0360036-0000-4000-a000-0000000000e1';
  get diagnostics touched = row_count;
  raise exception '6 FAIL — % ligne(s) auto-publiée(s) via status legacy', touched;
exception when insufficient_privilege then
  raise notice '6 OK — auto-publication par UPDATE status (legacy) refusée';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Gestionnaire de l'organisation A — lien V2 (organization_parks)
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"e0360036-0000-4000-a000-00000000000b","role":"authenticated"}', true);

-- 7. gestionnaire A publie le parc de SON organisation → OK
do $$
declare touched int;
begin
  update parks set moderation_status = 'published' where id = 'e0360036-0000-4000-a000-0000000000e2';
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception '7 FAIL — publication par le gestionnaire a touché % ligne(s)', touched; end if;
  raise notice '7 OK — gestionnaire A : publication du parc de son organisation autorisée';
end $$;

-- 8. gestionnaire A crée un NOUVEAU parc directement publié via commune_id
--    (reproduit le flux back-office ParkModal/ParkNew/CSV import) → OK
do $$
begin
  insert into parks (id, name, latitude, longitude, country_code, timezone, commune_id, status, created_by)
  values ('e0360036-0000-4000-a000-0000000000e5', 'zzz_test_0036_park_v1_direct', 42.5, 4.5, 'FR', 'Europe/Paris',
          'e0360036-0000-4000-a000-0000000000f1', 'published', 'e0360036-0000-4000-a000-00000000000b');
  raise notice '8 OK — création directement publiée par un gestionnaire (commune_id, flux back-office) autorisée';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Contributeur de l'organisation A — MEMBRE de l'organisation propriétaire
-- (passerait `manages_park()`/RLS `parks_update`), mais pas gestionnaire
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"e0360036-0000-4000-a000-00000000000e","role":"authenticated"}', true);

-- 9. contributeur A ne peut pas bloquer le parc de son organisation (déjà
--    `published` depuis le test 7 : on vise une VALEUR DIFFÉRENTE pour que le
--    changement soit réel, sinon `new is distinct from old` serait faux).
do $$
declare touched int;
begin
  update parks set moderation_status = 'blocked' where id = 'e0360036-0000-4000-a000-0000000000e2';
  get diagnostics touched = row_count;
  raise exception '9 FAIL — % ligne(s) bloquée(s) par un contributeur', touched;
exception when insufficient_privilege then
  raise notice '9 OK — contributeur A : blocage refusé (moderation_status)';
end $$;

-- 10. contributeur A ne peut pas contourner via le champ legacy `status`
--     (valeur différente de l'état courant 'published', pour la même raison)
do $$
declare touched int;
begin
  update parks set status = 'rejected' where id = 'e0360036-0000-4000-a000-0000000000e2';
  get diagnostics touched = row_count;
  raise exception '10 FAIL — % ligne(s) rejetée(s) par un contributeur via status legacy', touched;
exception when insufficient_privilege then
  raise notice '10 OK — contributeur A : rejet via status (legacy) refusé';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Support de l'organisation A — même situation que le contributeur
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"e0360036-0000-4000-a000-00000000000f","role":"authenticated"}', true);

-- 11. support A ne peut pas rejeter/bloquer le parc de son organisation
do $$
declare touched int;
begin
  update parks set moderation_status = 'rejected' where id = 'e0360036-0000-4000-a000-0000000000e2';
  get diagnostics touched = row_count;
  raise exception '11 FAIL — % ligne(s) rejetée(s) par un support', touched;
exception when insufficient_privilege then
  raise notice '11 OK — support A : rejet refusé (moderation_status)';
end $$;

-- 12. support A ne peut pas contourner via le champ legacy `status`
do $$
declare touched int;
begin
  update parks set status = 'blocked' where id = 'e0360036-0000-4000-a000-0000000000e2';
  get diagnostics touched = row_count;
  raise exception '12 FAIL — % ligne(s) bloquée(s) par un support via status legacy', touched;
exception when insufficient_privilege then
  raise notice '12 OK — support A : blocage via status (legacy) refusé';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Gestionnaire d'une AUTRE organisation (aucun lien avec ce parc)
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"e0360036-0000-4000-a000-00000000000c","role":"authenticated"}', true);

-- 13. gestionnaire B ne peut pas modérer le parc de l'organisation A — bloqué
--     en amont par `parks_update` (USING) elle-même : la ligne n'est même pas
--     matchée pour ce rôle, donc 0 ligne touchée et AUCUNE exception (le
--     trigger ne s'exécute que pour les lignes que l'UPDATE atteint réellement).
do $$
declare touched int;
begin
  update parks set moderation_status = 'rejected' where id = 'e0360036-0000-4000-a000-0000000000e2';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception '13 FAIL — % ligne(s) modérée(s) par une organisation non liée', touched;
  end if;
  raise notice '13 OK — gestionnaire d''une autre organisation : aucun droit de modération sur ce parc (0 ligne, filtré par parks_update)';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Staff Toboggo
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"e0360036-0000-4000-a000-00000000000d","role":"authenticated"}', true);

-- 14. le staff modère n'importe quel parc, y compris celui du simple créateur
do $$
declare touched int;
begin
  update parks set moderation_status = 'blocked' where id = 'e0360036-0000-4000-a000-0000000000e1';
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception '14 FAIL — modération staff a touché % ligne(s)', touched; end if;
  raise notice '14 OK — staff Toboggo : modération de n''importe quel parc autorisée';
end $$;

reset role;
select set_config('request.jwt.claims', null, true);

do $$ begin raise notice '━━━ parks_moderation_guard : 14/14 OK ━━━'; end $$;

rollback;
