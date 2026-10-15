-- ════════════════════════════════════════════════════════════════════════════
-- Test `parks_moderation_guard` (migration 0055)
-- ────────────────────────────────────────────────────────────────────────────
-- Un utilisateur ne peut ni créer un parc déjà publié, ni s'auto-publier / s'auto-bloquer.
-- Rôles testés : simple créateur, gestionnaire (V1 commune_id et V2 organization_parks),
-- contributeur, support, gestionnaire d'une autre organisation, staff Toboggo, postgres
-- (import OSM / publication par lots en SQL), service_role.
-- Couvre aussi le flux back-office ACTUEL de `createPark` : INSERT en `pending`, lien
-- `organization_parks`, puis UPDATE du statut (« deux temps »).
-- 20 scénarios. Avant 0055 : 2, 3, 5, 6, 9, 11, 12, 13, 14, 15 échouent (l'exploit fonctionne).
--
-- USAGE (base LOCALE ou STAGING — JAMAIS la production) :
--   docker exec -i supabase_db_<project> psql -U postgres -d <db> \
--     -v ON_ERROR_STOP=1 < supabase/tests/parks_moderation_guard.test.sql
-- Transaction terminée par ROLLBACK : aucune donnée persistée. Le rôle et request.jwt.claims
-- sont posés au niveau SQL AVANT chaque bloc `do` (convention de park_media_moderation.test.sql).
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── Fixtures (rôle postgres — hors périmètre du garde-fou) ─────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
select ('e0550055-0000-4000-a000-0000000000' || suffix)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'u' || suffix || '-0055@test.local', '', now(), now(), now()
from unnest(array['0a','0b','0c','0d','0e','0f']) as suffix;
-- 0a créateur simple · 0b gestionnaire A · 0c gestionnaire B · 0d staff · 0e contributeur A · 0f support A

insert into organizations (id, name, type)
values ('e0550055-0000-4000-a000-0000000000f1', 'zzz_test_org_a_0055', 'municipality'),
       ('e0550055-0000-4000-a000-0000000000f2', 'zzz_test_org_b_0055', 'municipality');
-- Coexistence V1 : team_members_v1_compat_biu recopie organization_id → commune_id (FK communes).
insert into communes (id, name)
values ('e0550055-0000-4000-a000-0000000000f1', 'zzz_test_org_a_0055'),
       ('e0550055-0000-4000-a000-0000000000f2', 'zzz_test_org_b_0055');

insert into team_members (user_id, organization_id, name, email, role)
values
  ('e0550055-0000-4000-a000-00000000000b', 'e0550055-0000-4000-a000-0000000000f1', 'Gestionnaire A', 'u0b-0055@test.local', 'gestionnaire'),
  ('e0550055-0000-4000-a000-00000000000c', 'e0550055-0000-4000-a000-0000000000f2', 'Gestionnaire B', 'u0c-0055@test.local', 'gestionnaire'),
  ('e0550055-0000-4000-a000-00000000000d', null,                                    'Staff Toboggo',  'u0d-0055@test.local', 'moderation'),
  ('e0550055-0000-4000-a000-00000000000e', 'e0550055-0000-4000-a000-0000000000f1', 'Contributeur A', 'u0e-0055@test.local', 'contributeur'),
  ('e0550055-0000-4000-a000-00000000000f', 'e0550055-0000-4000-a000-0000000000f1', 'Support A',      'u0f-0055@test.local', 'support');

-- Parc lié à l'organisation A côté V2 uniquement (sans commune_id).
insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status, created_by)
values ('e0550055-0000-4000-a000-0000000000e2', 'zzz_test_0055_park_v2', 42.5, 4.5, 'FR', 'Europe/Paris',
        'pending', 'e0550055-0000-4000-a000-00000000000b');
insert into organization_parks (organization_id, park_id, role)
values ('e0550055-0000-4000-a000-0000000000f1', 'e0550055-0000-4000-a000-0000000000e2', 'owner');

-- ════════════════ Simple créateur (aucune ligne team_members) ════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0550055-0000-4000-a000-00000000000a","role":"authenticated"}', true);

do $$ begin
  insert into parks (id, name, latitude, longitude, country_code, timezone, status, created_by)
  values ('e0550055-0000-4000-a000-0000000000e1', 'zzz_test_0055_creator', 42.5, 4.5, 'FR', 'Europe/Paris',
          'pending', 'e0550055-0000-4000-a000-00000000000a');
  raise notice '1 OK — création pending par un simple créateur autorisée (flux mobile « Ajouter un parc »)';
end $$;

do $$ begin
  begin
    insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status, created_by)
    values ('e0550055-0000-4000-a000-0000000000e3', 'zzz_test_0055_hack1', 42.5, 4.5, 'FR', 'Europe/Paris',
            'published', 'e0550055-0000-4000-a000-00000000000a');
    raise exception '2 FAIL — création moderation_status=published acceptée';
  exception when insufficient_privilege then
    raise notice '2 OK — création moderation_status=published refusée';
  end;
end $$;

do $$ begin
  begin
    insert into parks (id, name, latitude, longitude, country_code, timezone, status, created_by)
    values ('e0550055-0000-4000-a000-0000000000e4', 'zzz_test_0055_hack2', 42.5, 4.5, 'FR', 'Europe/Paris',
            'published', 'e0550055-0000-4000-a000-00000000000a');
    raise exception '3 FAIL — création status=published (legacy) acceptée';
  exception when insufficient_privilege then
    raise notice '3 OK — création status=published (legacy) refusée';
  end;
end $$;

do $$ begin
  update parks set name = 'zzz_test_0055_creator_renamed' where id = 'e0550055-0000-4000-a000-0000000000e1';
  if (select name from parks where id = 'e0550055-0000-4000-a000-0000000000e1') <> 'zzz_test_0055_creator_renamed' then
    raise exception '4 FAIL — édition légitime (name) bloquée à tort';
  end if;
  raise notice '4 OK — édition d''un champ non protégé toujours autorisée';
end $$;

do $$ declare t int; begin
  update parks set moderation_status = 'published' where id = 'e0550055-0000-4000-a000-0000000000e1';
  get diagnostics t = row_count;
  raise exception '5 FAIL — % ligne(s) auto-publiée(s) par le créateur', t;
exception when insufficient_privilege then
  raise notice '5 OK — auto-publication par UPDATE moderation_status refusée';
end $$;

do $$ declare t int; begin
  update parks set status = 'published' where id = 'e0550055-0000-4000-a000-0000000000e1';
  get diagnostics t = row_count;
  raise exception '6 FAIL — % ligne(s) auto-publiée(s) via status legacy', t;
exception when insufficient_privilege then
  raise notice '6 OK — auto-publication par UPDATE status (legacy) refusée';
end $$;

-- ════════════════ Gestionnaire de l'organisation A ════════════════
select set_config('request.jwt.claims', '{"sub":"e0550055-0000-4000-a000-00000000000b","role":"authenticated"}', true);

do $$ declare t int; begin
  update parks set moderation_status = 'published' where id = 'e0550055-0000-4000-a000-0000000000e2';
  get diagnostics t = row_count;
  if t <> 1 then raise exception '7 FAIL — publication par le gestionnaire a touché % ligne(s)', t; end if;
  raise notice '7 OK — gestionnaire A : publication du parc de son organisation (lien V2) autorisée';
end $$;

do $$ begin
  insert into parks (id, name, latitude, longitude, country_code, timezone, commune_id, status, created_by)
  values ('e0550055-0000-4000-a000-0000000000e5', 'zzz_test_0055_v1_direct', 42.5, 4.5, 'FR', 'Europe/Paris',
          'e0550055-0000-4000-a000-0000000000f1', 'published', 'e0550055-0000-4000-a000-00000000000b');
  raise notice '8 OK — création publiée via commune_id (chemin V1 conservé) autorisée pour un gestionnaire';
end $$;

-- 9. Comportement documenté : sans commune_id (flux V2), un INSERT directement publié est refusé,
--    même pour un gestionnaire — d'où le « deux temps » de createPark (scénario 10).
do $$ begin
  begin
    insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status, created_by)
    values ('e0550055-0000-4000-a000-0000000000e6', 'zzz_test_0055_v2_direct', 42.5, 4.5, 'FR', 'Europe/Paris',
            'published', 'e0550055-0000-4000-a000-00000000000b');
    raise exception '9 FAIL — INSERT publié sans commune_id accepté';
  exception when insufficient_privilege then
    raise notice '9 OK — INSERT directement publié sans commune_id refusé (le front doit utiliser le deux temps)';
  end;
end $$;

-- 10. Flux ACTUEL du back-office (createPark) : INSERT pending → lien organisation → UPDATE statut.
do $$ begin
  insert into parks (id, name, latitude, longitude, country_code, timezone, created_by)
  values ('e0550055-0000-4000-a000-0000000000e7', 'zzz_test_0055_two_step', 42.5, 4.5, 'FR', 'Europe/Paris',
          'e0550055-0000-4000-a000-00000000000b');
  insert into organization_parks (organization_id, park_id, role)
  values ('e0550055-0000-4000-a000-0000000000f1', 'e0550055-0000-4000-a000-0000000000e7', 'owner');
  update parks set moderation_status = 'published' where id = 'e0550055-0000-4000-a000-0000000000e7';
  if (select moderation_status from parks where id = 'e0550055-0000-4000-a000-0000000000e7') <> 'published' then
    raise exception '10 FAIL — parc non publié à l''issue du deux temps';
  end if;
  raise notice '10 OK — createPark en deux temps (pending → lien → published) autorisé pour un gestionnaire';
end $$;

-- ════════════════ Contributeur A (membre de l'organisation, pas gestionnaire) ════════════════
select set_config('request.jwt.claims', '{"sub":"e0550055-0000-4000-a000-00000000000e","role":"authenticated"}', true);

do $$ declare t int; begin
  update parks set moderation_status = 'blocked' where id = 'e0550055-0000-4000-a000-0000000000e2';
  get diagnostics t = row_count;
  raise exception '11 FAIL — % ligne(s) bloquée(s) par un contributeur', t;
exception when insufficient_privilege then
  raise notice '11 OK — contributeur A : blocage refusé';
end $$;

do $$ declare t int; begin
  update parks set status = 'rejected' where id = 'e0550055-0000-4000-a000-0000000000e2';
  get diagnostics t = row_count;
  raise exception '12 FAIL — % ligne(s) rejetée(s) par un contributeur via status legacy', t;
exception when insufficient_privilege then
  raise notice '12 OK — contributeur A : rejet via status (legacy) refusé';
end $$;

-- 13. Le contributeur ne peut pas non plus publier via le deux temps (le lien V2 ne l'élève pas).
do $$ begin
  insert into parks (id, name, latitude, longitude, country_code, timezone, created_by)
  values ('e0550055-0000-4000-a000-0000000000e8', 'zzz_test_0055_contrib_two_step', 42.5, 4.5, 'FR', 'Europe/Paris',
          'e0550055-0000-4000-a000-00000000000e');
  begin
    insert into organization_parks (organization_id, park_id, role)
    values ('e0550055-0000-4000-a000-0000000000f1', 'e0550055-0000-4000-a000-0000000000e8', 'owner');
    update parks set moderation_status = 'published' where id = 'e0550055-0000-4000-a000-0000000000e8';
    raise exception '13 FAIL — un contributeur a publié son parc';
  exception when insufficient_privilege then
    raise notice '13 OK — contributeur A : publication (même en deux temps) refusée';
  end;
end $$;

-- ════════════════ Support A ════════════════
select set_config('request.jwt.claims', '{"sub":"e0550055-0000-4000-a000-00000000000f","role":"authenticated"}', true);

do $$ declare t int; begin
  update parks set moderation_status = 'rejected' where id = 'e0550055-0000-4000-a000-0000000000e2';
  get diagnostics t = row_count;
  raise exception '14 FAIL — % ligne(s) rejetée(s) par un support', t;
exception when insufficient_privilege then
  raise notice '14 OK — support A : rejet refusé';
end $$;

do $$ declare t int; begin
  update parks set status = 'blocked' where id = 'e0550055-0000-4000-a000-0000000000e2';
  get diagnostics t = row_count;
  raise exception '15 FAIL — % ligne(s) bloquée(s) par un support via status legacy', t;
exception when insufficient_privilege then
  raise notice '15 OK — support A : blocage via status (legacy) refusé';
end $$;

-- ════════════════ Gestionnaire d'une AUTRE organisation ════════════════
select set_config('request.jwt.claims', '{"sub":"e0550055-0000-4000-a000-00000000000c","role":"authenticated"}', true);

do $$ declare t int; begin
  update parks set moderation_status = 'rejected' where id = 'e0550055-0000-4000-a000-0000000000e2';
  get diagnostics t = row_count;
  if t <> 0 then raise exception '16 FAIL — % ligne(s) modérée(s) par une organisation non liée', t; end if;
  raise notice '16 OK — gestionnaire B : aucun droit sur un parc de l''organisation A (0 ligne, filtré par parks_update)';
end $$;

-- ════════════════ Staff Toboggo ════════════════
select set_config('request.jwt.claims', '{"sub":"e0550055-0000-4000-a000-00000000000d","role":"authenticated"}', true);

do $$ declare t int; begin
  update parks set moderation_status = 'blocked' where id = 'e0550055-0000-4000-a000-0000000000e1';
  get diagnostics t = row_count;
  if t <> 1 then raise exception '17 FAIL — modération staff a touché % ligne(s)', t; end if;
  raise notice '17 OK — staff : modération de n''importe quel parc autorisée';
end $$;

do $$ begin
  insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status, created_by)
  values ('e0550055-0000-4000-a000-0000000000e9', 'zzz_test_0055_staff_direct', 42.5, 4.5, 'FR', 'Europe/Paris',
          'published', 'e0550055-0000-4000-a000-00000000000d');
  raise notice '18 OK — staff : création directement publiée autorisée (import CSV / création Admin)';
end $$;

reset role;
select set_config('request.jwt.claims', null, true);

-- ════════════════ postgres (import OSM direct, publication par lots) et service_role ════════════════
do $$ begin
  insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status)
  values ('e0550055-0000-4000-a000-0000000000ea', 'zzz_test_0055_osm_style', 42.5, 4.5, 'FR', 'Europe/Paris', 'published');
  update parks set moderation_status = 'pending' where id = 'e0550055-0000-4000-a000-0000000000ea';
  update parks set moderation_status = 'published' where id = 'e0550055-0000-4000-a000-0000000000ea';
  raise notice '19 OK — postgres : INSERT/UPDATE de statut inchangés (import OSM, publication par lots SQL)';
end $$;

set local role service_role;
do $$ begin
  insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status)
  values ('e0550055-0000-4000-a000-0000000000eb', 'zzz_test_0055_service', 42.5, 4.5, 'FR', 'Europe/Paris', 'published');
  raise notice '20 OK — service_role : création publiée inchangée';
end $$;
reset role;

do $$ begin raise notice '━━━ parks_moderation_guard : 20/20 OK ━━━'; end $$;

rollback;
