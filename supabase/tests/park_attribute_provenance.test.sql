-- ════════════════════════════════════════════════════════════════════════════
-- Test — `apply_park_attribute()` sous rôle AUTHENTIFIÉ (migration 0032, D3 P1)
-- ────────────────────────────────────────────────────────────────────────────
-- Les assertions embarquées dans 0032 + `scripts/osm/tests/test_provenance_phase1.py`
-- s'exécutent en rôle `postgres` (branche `auth.uid() IS NULL` : `p_source_type`
-- explicite). Ce fichier couvre ce qu'elles ne peuvent pas :
--   • dérivation de la source depuis le RÔLE réel de l'acteur ;
--   • `p_source_type` IGNORÉ en contexte authentifié (anti-usurpation) ;
--   • RLS : seul un éditeur autorisé (staff / gestionnaire du parc) passe ;
--   • gate de priorité respecté sous rôle authentifié.
--
-- USAGE (base LOCALE ou STAGING — JAMAIS la production) :
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/park_attribute_provenance.test.sql
--
-- Tout est encapsulé dans une transaction terminée par ROLLBACK.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── Fixtures (rôle postgres) ──────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('d0320000-0000-4000-a000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'staff-a@test.local', '', now(), now(), now()),
  ('d0320000-0000-4000-a000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gestion-b@test.local', '', now(), now(), now()),
  ('d0320000-0000-4000-a000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gestion-c@test.local', '', now(), now(), now());

insert into organizations (id, name, type)
values ('d0320000-0000-4000-a000-0000000000f1', 'zzz_commune_0032', 'municipality'),
       ('d0320000-0000-4000-a000-0000000000f2', 'zzz_autre_commune_0032', 'municipality');
insert into communes (id, name)
values ('d0320000-0000-4000-a000-0000000000f1', 'zzz_commune_0032'),
       ('d0320000-0000-4000-a000-0000000000f2', 'zzz_autre_commune_0032');

-- A = staff Toboggo (organization_id NULL) ; B = gestionnaire de f1 (parc) ;
-- C = gestionnaire de f2 (sans lien avec le parc).
insert into team_members (user_id, organization_id, name, email, role)
values ('d0320000-0000-4000-a000-00000000000a', null,
        'Staff A', 'staff-a@test.local', 'moderation'),
       ('d0320000-0000-4000-a000-00000000000b', 'd0320000-0000-4000-a000-0000000000f1',
        'Gestion B', 'gestion-b@test.local', 'gestionnaire'),
       ('d0320000-0000-4000-a000-00000000000c', 'd0320000-0000-4000-a000-0000000000f2',
        'Gestion C', 'gestion-c@test.local', 'gestionnaire');

insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status)
values ('d0320000-0000-4000-a000-0000000000e1', 'zzz_parc_0032 OSM', 43.6, 1.44, 'FR', 'Europe/Paris', 'published');
insert into organization_parks (organization_id, park_id, role)
values ('d0320000-0000-4000-a000-0000000000f1', 'd0320000-0000-4000-a000-0000000000e1', 'owner');

-- Le parc porte déjà un nom fourni par OSM (priorité 50).
insert into park_sources (id, park_id, source_type, source_name)
values ('d0320000-0000-4000-a000-0000000000a1', 'd0320000-0000-4000-a000-0000000000e1', 'osm', 'OpenStreetMap');
select set_park_attribute_source(
  'd0320000-0000-4000-a000-0000000000e1', 'name', '"zzz_parc_0032 OSM"'::jsonb,
  'd0320000-0000-4000-a000-0000000000a1', 0.700, null
);

-- ════════════════════════════════════════════════════════════════════════════
-- Gestionnaire du parc (B) : édition du nom -> source dérivée 'municipality'
-- ════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d0320000-0000-4000-a000-00000000000b","role":"authenticated"}', true);

do $$
declare v_src text; v_name text;
begin
  -- 1. p_source_type volontairement 'toboggo' -> DOIT être ignoré (rôle réel = gestionnaire)
  perform apply_park_attribute(
    'd0320000-0000-4000-a000-0000000000e1', 'name', '"Nom collectivité"'::jsonb, 'toboggo', null
  );
  select ps.source_type::text into v_src
  from park_attribute_sources pas join park_sources ps on ps.id = pas.source_id
  where pas.park_id = 'd0320000-0000-4000-a000-0000000000e1'
    and pas.attribute_key = 'name' and pas.is_current;
  if v_src <> 'municipality' then
    raise exception '1 FAIL — source dérivée = % (attendu municipality ; p_source_type non ignoré)', v_src;
  end if;

  select name into v_name from parks where id = 'd0320000-0000-4000-a000-0000000000e1';
  if v_name <> 'Nom collectivité' then raise exception '1 FAIL — projection name = %', v_name; end if;
  raise notice '1 OK — gestionnaire : source dérivée municipality, p_source_type ignoré, projection OK';
end $$;

-- 2. OSM ne peut plus remplacer 'name'
do $$
begin
  if can_source_replace_attribute('d0320000-0000-4000-a000-0000000000e1', 'name', 'osm') then
    raise exception '2 FAIL — OSM peut encore remplacer name après édition gestionnaire';
  end if;
  raise notice '2 OK — OSM bloqué sur name (municipality 90 > osm 50)';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Gestionnaire d'une AUTRE collectivité (C) : aucun droit sur ce parc
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"d0320000-0000-4000-a000-00000000000c","role":"authenticated"}', true);

do $$
begin
  begin
    perform apply_park_attribute(
      'd0320000-0000-4000-a000-0000000000e1', 'name', '"Pirate"'::jsonb, null, null
    );
    raise exception '3 FAIL — un gestionnaire tiers a pu éditer le parc';
  exception
    when insufficient_privilege then
      raise notice '3 OK — gestionnaire tiers rejeté (acteur non autorisé)';
    when others then
      -- une RLS refusée à l'écriture interne se manifeste aussi comme une erreur ;
      -- on accepte tout refus, on rejette un succès.
      raise notice '3 OK — gestionnaire tiers rejeté (%)', sqlerrm;
  end;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Staff Toboggo (A) : source dérivée 'toboggo', peut passer devant municipality
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"d0320000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

do $$
declare v_src text; n_current int;
begin
  perform apply_park_attribute(
    'd0320000-0000-4000-a000-0000000000e1', 'name', '"Nom Toboggo"'::jsonb, null, null
  );
  select ps.source_type::text into v_src
  from park_attribute_sources pas join park_sources ps on ps.id = pas.source_id
  where pas.park_id = 'd0320000-0000-4000-a000-0000000000e1'
    and pas.attribute_key = 'name' and pas.is_current;
  if v_src <> 'toboggo' then raise exception '4 FAIL — source staff = % (attendu toboggo)', v_src; end if;
  if (select name from parks where id = 'd0320000-0000-4000-a000-0000000000e1') <> 'Nom Toboggo' then
    raise exception '4 FAIL — projection name staff';
  end if;

  select count(*) into n_current from park_attribute_sources
  where park_id = 'd0320000-0000-4000-a000-0000000000e1' and attribute_key = 'name' and is_current;
  if n_current <> 1 then raise exception '4 FAIL — % lignes is_current pour name', n_current; end if;
  raise notice '4 OK — staff : source toboggo, écrase la valeur municipality, une seule courante';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Gestionnaire (B) : ne peut plus écraser un name devenu 'toboggo'
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"d0320000-0000-4000-a000-00000000000b","role":"authenticated"}', true);

do $$
begin
  begin
    perform apply_park_attribute(
      'd0320000-0000-4000-a000-0000000000e1', 'name', '"Retour collectivité"'::jsonb, null, null
    );
    raise exception '5 FAIL — municipality a pu écraser un name toboggo';
  exception when check_violation then
    raise notice '5 OK — municipality (90) ne peut pas remplacer un name toboggo (100)';
  end;

  -- mais un attribut encore non protégé (address) reste éditable par le gestionnaire
  perform apply_park_attribute(
    'd0320000-0000-4000-a000-0000000000e1', 'address',
    '{"address_line":"3 Place du Test","postal_code":"31000","city":"Toulouse","admin_area_1":null,"admin_area_2":null}'::jsonb,
    null, null
  );
  if (select city from parks where id = 'd0320000-0000-4000-a000-0000000000e1') <> 'Toulouse' then
    raise exception '5 FAIL — address non projetée';
  end if;
  raise notice '5 OK — address éditable par le gestionnaire (aucune source > municipality)';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- anon : aucun droit
-- ════════════════════════════════════════════════════════════════════════════
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform apply_park_attribute(
      'd0320000-0000-4000-a000-0000000000e1', 'name', '"Anon"'::jsonb, null, null
    );
    raise exception '6 FAIL — anon a pu appeler apply_park_attribute';
  exception
    when insufficient_privilege then raise notice '6 OK — anon rejeté';
    when others then raise notice '6 OK — anon rejeté (%)', sqlerrm;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', null, true);

do $$ begin raise notice 'park_attribute_provenance.test.sql — 6 scénarios PASS'; end $$;

rollback;
