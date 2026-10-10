
-- ════════════════════════════════════════════════════════════════════════════
-- Test — cloisonnement RLS des organisations (migration 0047, Lot A2)
-- ────────────────────────────────────────────────────────────────────────────
-- Vérifie les VRAIES policies PostgreSQL (rôles `anon` / `authenticated` +
-- claims JWT, même technique que review_park_edit.test.sql), pas des mocks.
--
-- Deux organisations de test (A = « Lyon », B), un parc publié + un parc
-- pending par organisation, un parc publié SANS propriétaire.
--
-- USAGE (base LOCALE ou STAGING — JAMAIS la production). Tout est dans une
-- transaction terminée par ROLLBACK : aucune fixture ne persiste.
--
--   # Avant migration (le test DOIT échouer sur les lectures `using (true)`) :
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/rls_organization_scope.test.sql
--
--   # Avec la migration appliquée dans la même transaction (base non modifiée) :
--   { echo 'begin;'; cat supabase/migrations/0047_rls_organization_scope.sql; \
--     cat supabase/tests/rls_organization_scope.test.sql; } | \
--     docker exec -i supabase_db_<project> psql -U postgres -d postgres -v ON_ERROR_STOP=1
-- ════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), now(), now()
from (values
  ('e0470000-0000-4000-a000-00000000a001','zzz-0047-admin@test.local'),
  ('e0470000-0000-4000-a000-00000000a002','zzz-0047-gest-a@test.local'),
  ('e0470000-0000-4000-a000-00000000a003','zzz-0047-contrib-a@test.local'),
  ('e0470000-0000-4000-a000-00000000a004','zzz-0047-gest-b@test.local'),
  ('e0470000-0000-4000-a000-00000000a005','zzz-0047-parent@test.local')
) as v(id, email);

insert into organizations (id, name, type, contact_email)
values ('e0470000-0000-4000-a000-00000000b001', 'zzz_org_0047_a', 'municipality', 'zzz-a@secret.test'),
       ('e0470000-0000-4000-a000-00000000b002', 'zzz_org_0047_b', 'municipality', 'zzz-b@secret.test');
-- team_members.commune_id (V1 compat) exige une ligne communes de même id.
insert into communes (id, name) values ('e0470000-0000-4000-a000-00000000b001', 'zzz_org_0047_a'), ('e0470000-0000-4000-a000-00000000b002', 'zzz_org_0047_b');

insert into team_members (user_id, organization_id, name, email, role) values
  ('e0470000-0000-4000-a000-00000000a001', null, 'Admin', 'zzz-0047-admin@test.local', 'super_admin'),
  ('e0470000-0000-4000-a000-00000000a002', 'e0470000-0000-4000-a000-00000000b001', 'Gest A', 'zzz-0047-gest-a@test.local', 'gestionnaire'),
  ('e0470000-0000-4000-a000-00000000a003', 'e0470000-0000-4000-a000-00000000b001', 'Contrib A', 'zzz-0047-contrib-a@test.local', 'contributeur'),
  ('e0470000-0000-4000-a000-00000000a004', 'e0470000-0000-4000-a000-00000000b002', 'Gest B', 'zzz-0047-gest-b@test.local', 'gestionnaire');

insert into parks (id, name, latitude, longitude, min_age, max_age, country_code, timezone, moderation_status) values
  ('e0470000-0000-4000-a000-00000000c001', 'zzz_0047_A_publie',  43.6, 1.44, 3, 10, 'FR', 'Europe/Paris', 'published'),
  ('e0470000-0000-4000-a000-00000000c002', 'zzz_0047_A_pending', 43.6, 1.44, 3, 10, 'FR', 'Europe/Paris', 'pending'),
  ('e0470000-0000-4000-a000-00000000c003', 'zzz_0047_B_publie',  43.6, 1.44, 3, 10, 'FR', 'Europe/Paris', 'published'),
  ('e0470000-0000-4000-a000-00000000c004', 'zzz_0047_B_pending', 43.6, 1.44, 3, 10, 'FR', 'Europe/Paris', 'pending'),
  ('e0470000-0000-4000-a000-00000000c005',  'zzz_0047_sans_proprio', 43.6, 1.44, 3, 10, 'FR', 'Europe/Paris', 'published');

insert into organization_parks (organization_id, park_id, role) values
  ('e0470000-0000-4000-a000-00000000b001', 'e0470000-0000-4000-a000-00000000c001', 'owner'), ('e0470000-0000-4000-a000-00000000b001', 'e0470000-0000-4000-a000-00000000c002', 'owner'),
  ('e0470000-0000-4000-a000-00000000b002', 'e0470000-0000-4000-a000-00000000c003', 'owner'), ('e0470000-0000-4000-a000-00000000b002', 'e0470000-0000-4000-a000-00000000c004', 'owner');

-- Données « indirectes » : un signalement et une proposition par parc publié.
insert into reports (park_id, user_id, reported_by_name, reason, category)
select p, 'e0470000-0000-4000-a000-00000000a005'::uuid, 'zzz', (select min(e) from unnest(enum_range(null::report_reason)) e), (select min(e) from unnest(enum_range(null::report_category)) e)
from (values ('e0470000-0000-4000-a000-00000000c001'::uuid), ('e0470000-0000-4000-a000-00000000c003'::uuid)) v(p);
insert into park_edits (park_id, user_id, changes) values
  ('e0470000-0000-4000-a000-00000000c001', 'e0470000-0000-4000-a000-00000000a005', '{"note":"zzz"}'), ('e0470000-0000-4000-a000-00000000c003', 'e0470000-0000-4000-a000-00000000a005', '{"note":"zzz"}');

-- ═══ ADMIN (staff Toboggo) : accès globaux conservés ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0470000-0000-4000-a000-00000000a001","role":"authenticated"}',true);
do $$ declare n int; begin
  select count(*) into n from organizations where id in ('e0470000-0000-4000-a000-00000000b001','e0470000-0000-4000-a000-00000000b002');
  if n is distinct from 2 then raise exception 'A1 admin lit les 2 organisations FAIL — obtenu %, attendu 2', n; end if;
  raise notice 'A1 admin lit les 2 organisations OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from communes where id in ('e0470000-0000-4000-a000-00000000b001','e0470000-0000-4000-a000-00000000b002');
  if n is distinct from 2 then raise exception 'A2 admin lit les 2 communes FAIL — obtenu %, attendu 2', n; end if;
  raise notice 'A2 admin lit les 2 communes OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from organization_parks where organization_id in ('e0470000-0000-4000-a000-00000000b001','e0470000-0000-4000-a000-00000000b002');
  if n is distinct from 4 then raise exception 'A3 admin lit les 4 organization_parks FAIL — obtenu %, attendu 4', n; end if;
  raise notice 'A3 admin lit les 4 organization_parks OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from parks where id in ('e0470000-0000-4000-a000-00000000c002','e0470000-0000-4000-a000-00000000c004');
  if n is distinct from 2 then raise exception 'A4 admin lit les 2 parcs pending FAIL — obtenu %, attendu 2', n; end if;
  raise notice 'A4 admin lit les 2 parcs pending OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from team_members where organization_id is null and user_id = 'e0470000-0000-4000-a000-00000000a001';
  if n is distinct from 1 then raise exception 'A5 admin lit l''équipe staff (comportement actuel : pas celle des collectivités) FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'A5 admin lit l''équipe staff OK';
end $$;
do $$ declare n int; begin
  update parks set name = name where id = 'e0470000-0000-4000-a000-00000000c003';
  get diagnostics n = row_count;
  if n is distinct from 1 then raise exception 'A6 admin modifie un parc de B FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'A6 admin modifie un parc de B OK';
end $$;
do $$ declare n int; begin
  update organization_parks set role = role where organization_id = 'e0470000-0000-4000-a000-00000000b002';
  get diagnostics n = row_count;
  if n is distinct from 2 then raise exception 'A7 admin modifie une association de B FAIL — obtenu %, attendu 2', n; end if;
  raise notice 'A7 admin modifie une association de B OK';
end $$;
do $$ declare n int; begin
  update organizations set name = name where id = 'e0470000-0000-4000-a000-00000000b002';
  get diagnostics n = row_count;
  if n is distinct from 1 then raise exception 'A8 admin modifie l’organisation B FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'A8 admin modifie l’organisation B OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from reports where park_id in ('e0470000-0000-4000-a000-00000000c001','e0470000-0000-4000-a000-00000000c003');
  if n is distinct from 2 then raise exception 'A9 admin lit tous les signalements de test FAIL — obtenu %, attendu 2', n; end if;
  raise notice 'A9 admin lit tous les signalements de test OK';
end $$;
do $$ begin
  insert into organization_parks (organization_id, park_id, role) values ('e0470000-0000-4000-a000-00000000b002', 'e0470000-0000-4000-a000-00000000c005', 'manager');
  raise notice 'A10 OK — admin crée une association (staff_all)';
end $$;
delete from organization_parks where organization_id = 'e0470000-0000-4000-a000-00000000b002' and park_id = 'e0470000-0000-4000-a000-00000000c005';

-- ═══ GESTIONNAIRE A (Lyon) ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0470000-0000-4000-a000-00000000a002","role":"authenticated"}',true);
do $$ declare n int; begin
  select count(*) into n from organizations where id = 'e0470000-0000-4000-a000-00000000b001';
  if n is distinct from 1 then raise exception 'G1 lit son organisation FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'G1 lit son organisation OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from organizations where id = 'e0470000-0000-4000-a000-00000000b002';
  if n is distinct from 0 then raise exception 'G2 NE lit PAS l’organisation B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G2 NE lit PAS l’organisation B OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from communes where id = 'e0470000-0000-4000-a000-00000000b002';
  if n is distinct from 0 then raise exception 'G2b NE lit PAS la commune B (miroir V1) FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G2b NE lit PAS la commune B (miroir V1) OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from communes where id = 'e0470000-0000-4000-a000-00000000b001';
  if n is distinct from 1 then raise exception 'G2c lit sa commune FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'G2c lit sa commune OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from team_members where organization_id = 'e0470000-0000-4000-a000-00000000b001';
  if n is distinct from 2 then raise exception 'G3 lit ses membres (A) FAIL — obtenu %, attendu 2', n; end if;
  raise notice 'G3 lit ses membres (A) OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from team_members where organization_id = 'e0470000-0000-4000-a000-00000000b002';
  if n is distinct from 0 then raise exception 'G4 NE lit PAS les membres de B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G4 NE lit PAS les membres de B OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from organization_parks where organization_id = 'e0470000-0000-4000-a000-00000000b001';
  if n is distinct from 2 then raise exception 'G5 lit ses organization_parks (publié + pending) FAIL — obtenu %, attendu 2', n; end if;
  raise notice 'G5 lit ses organization_parks (publié + pending) OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from organization_parks where park_id = 'e0470000-0000-4000-a000-00000000c004';
  if n is distinct from 0 then raise exception 'G6 NE lit PAS le rattachement du parc PENDING de B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G6 NE lit PAS le rattachement du parc PENDING de B OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from organization_parks where park_id = 'e0470000-0000-4000-a000-00000000c003';
  if n is distinct from 1 then raise exception 'G6b lit le rattachement du parc PUBLIÉ de B (lien déjà public) FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'G6b lit le rattachement du parc PUBLIÉ de B (lien déjà public) OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from parks where id in ('e0470000-0000-4000-a000-00000000c001','e0470000-0000-4000-a000-00000000c002');
  if n is distinct from 2 then raise exception 'G7 lit ses parcs (publié + pending) FAIL — obtenu %, attendu 2', n; end if;
  raise notice 'G7 lit ses parcs (publié + pending) OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from parks where id = 'e0470000-0000-4000-a000-00000000c004';
  if n is distinct from 0 then raise exception 'G8 NE lit PAS le parc pending de B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G8 NE lit PAS le parc pending de B OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from parks where id = 'e0470000-0000-4000-a000-00000000c003';
  if n is distinct from 1 then raise exception 'G8b lit le parc publié de B (public) FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'G8b lit le parc publié de B (public) OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from reports where park_id in ('e0470000-0000-4000-a000-00000000c001','e0470000-0000-4000-a000-00000000c003');
  if n is distinct from 1 then raise exception 'G9 voit les signalements de SES parcs seulement FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'G9 voit les signalements de SES parcs seulement OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from park_edits where park_id in ('e0470000-0000-4000-a000-00000000c001','e0470000-0000-4000-a000-00000000c003');
  if n is distinct from 1 then raise exception 'G10 voit les propositions de SES parcs seulement FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'G10 voit les propositions de SES parcs seulement OK';
end $$;
do $$ declare n int; begin
  update parks set name = name where id = 'e0470000-0000-4000-a000-00000000c001';
  get diagnostics n = row_count;
  if n is distinct from 1 then raise exception 'G11 modifie son parc FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'G11 modifie son parc OK';
end $$;
do $$ declare n int; begin
  update parks set name = 'zzz_hack' where id = 'e0470000-0000-4000-a000-00000000c003';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'G12 NE modifie PAS le parc publié de B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G12 NE modifie PAS le parc publié de B OK';
end $$;
do $$ declare n int; begin
  update parks set name = 'zzz_hack' where id = 'e0470000-0000-4000-a000-00000000c004';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'G13 NE modifie PAS le parc pending de B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G13 NE modifie PAS le parc pending de B OK';
end $$;
do $$ declare n int; begin
  delete from parks where id = 'e0470000-0000-4000-a000-00000000c003';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'G14 NE supprime PAS un parc de B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G14 NE supprime PAS un parc de B OK';
end $$;
do $$ declare n int; begin
  update organization_parks set role = 'manager' where organization_id = 'e0470000-0000-4000-a000-00000000b002';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'G15 NE modifie PAS une association de B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G15 NE modifie PAS une association de B OK';
end $$;
do $$ declare n int; begin
  delete from organization_parks where organization_id = 'e0470000-0000-4000-a000-00000000b002';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'G16 NE supprime PAS une association de B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G16 NE supprime PAS une association de B OK';
end $$;
do $$ begin
  insert into organization_parks (organization_id, park_id, role) values ('e0470000-0000-4000-a000-00000000b002', 'e0470000-0000-4000-a000-00000000c005', 'owner');
  raise exception 'G17 NE crée PAS une association au nom de B FAIL — écriture acceptée à tort';
exception when insufficient_privilege or check_violation or raise_exception then
  if sqlerrm like '%FAIL%' then raise; end if;
  raise notice 'G17 NE crée PAS une association au nom de B OK (refusé : %)', sqlerrm;
end $$;
do $$ begin
  insert into organization_parks (organization_id, park_id, role) values ('e0470000-0000-4000-a000-00000000b001', 'e0470000-0000-4000-a000-00000000c003', 'manager');
  raise exception 'G18 NE rattache PAS à A un parc DÉJÀ possédé par B FAIL — écriture acceptée à tort';
exception when insufficient_privilege or check_violation or raise_exception then
  if sqlerrm like '%FAIL%' then raise; end if;
  raise notice 'G18 NE rattache PAS à A un parc DÉJÀ possédé par B OK (refusé : %)', sqlerrm;
end $$;
do $$ begin
  update organization_parks set park_id = 'e0470000-0000-4000-a000-00000000c003' where organization_id = 'e0470000-0000-4000-a000-00000000b001' and park_id = 'e0470000-0000-4000-a000-00000000c001';
  raise exception 'G19 NE déplace PAS une association vers un parc de B FAIL — écriture acceptée à tort';
exception when insufficient_privilege or check_violation or raise_exception then
  if sqlerrm like '%FAIL%' then raise; end if;
  raise notice 'G19 NE déplace PAS une association vers un parc de B OK (refusé : %)', sqlerrm;
end $$;
do $$ declare n int; begin
  update organizations set name = 'zzz_hack' where id = 'e0470000-0000-4000-a000-00000000b002';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'G20 NE modifie PAS l’organisation B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G20 NE modifie PAS l’organisation B OK';
end $$;
do $$ declare n int; begin
  update organizations set name = name where id = 'e0470000-0000-4000-a000-00000000b001';
  get diagnostics n = row_count;
  if n is distinct from 1 then raise exception 'G21 modifie sa propre organisation FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'G21 modifie sa propre organisation OK';
end $$;
do $$ declare n int; begin
  update team_members set role = 'contributeur' where organization_id = 'e0470000-0000-4000-a000-00000000b002';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'G22 NE modifie PAS l’équipe de B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G22 NE modifie PAS l’équipe de B OK';
end $$;
do $$ begin
  insert into team_members (user_id, organization_id, name, email, role) values ('e0470000-0000-4000-a000-00000000a002', 'e0470000-0000-4000-a000-00000000b002', 'x', 'x@x.test', 'gestionnaire');
  raise exception 'G23 NE s’ajoute PAS à l’équipe de B FAIL — écriture acceptée à tort';
exception when insufficient_privilege or check_violation or raise_exception then
  if sqlerrm like '%FAIL%' then raise; end if;
  raise notice 'G23 NE s’ajoute PAS à l’équipe de B OK (refusé : %)', sqlerrm;
end $$;
do $$ declare n int; begin
  update reports set status = 'resolved' where park_id = 'e0470000-0000-4000-a000-00000000c003';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'G24 NE traite PAS un signalement de B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'G24 NE traite PAS un signalement de B OK';
end $$;

-- ═══ CONTRIBUTEUR A (membre sans droit de gestion) ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0470000-0000-4000-a000-00000000a003","role":"authenticated"}',true);
do $$ declare n int; begin
  select count(*) into n from organizations where id = 'e0470000-0000-4000-a000-00000000b001';
  if n is distinct from 1 then raise exception 'C1 lit son organisation FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'C1 lit son organisation OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from organizations where id = 'e0470000-0000-4000-a000-00000000b002';
  if n is distinct from 0 then raise exception 'C2 NE lit PAS l’organisation B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'C2 NE lit PAS l’organisation B OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from organization_parks where organization_id = 'e0470000-0000-4000-a000-00000000b001';
  if n is distinct from 2 then raise exception 'C3 lit ses organization_parks FAIL — obtenu %, attendu 2', n; end if;
  raise notice 'C3 lit ses organization_parks OK';
end $$;
do $$ declare n int; begin
  update organization_parks set role = role where organization_id = 'e0470000-0000-4000-a000-00000000b001';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'C4 NE modifie PAS une association de A (gestionnaire requis) FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'C4 NE modifie PAS une association de A (gestionnaire requis) OK';
end $$;
do $$ declare n int; begin
  update parks set name = 'zzz_hack' where id = 'e0470000-0000-4000-a000-00000000c003';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'C5 NE modifie PAS le parc de B FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'C5 NE modifie PAS le parc de B OK';
end $$;

-- ═══ GESTIONNAIRE B (symétrie) ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0470000-0000-4000-a000-00000000a004","role":"authenticated"}',true);
do $$ declare n int; begin
  select count(*) into n from organizations where id = 'e0470000-0000-4000-a000-00000000b002';
  if n is distinct from 1 then raise exception 'B1 lit son organisation FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'B1 lit son organisation OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from organizations where id = 'e0470000-0000-4000-a000-00000000b001';
  if n is distinct from 0 then raise exception 'B2 NE lit PAS l’organisation A FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'B2 NE lit PAS l’organisation A OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from team_members where organization_id = 'e0470000-0000-4000-a000-00000000b001';
  if n is distinct from 0 then raise exception 'B3 NE lit PAS les membres de A FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'B3 NE lit PAS les membres de A OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from organization_parks where park_id = 'e0470000-0000-4000-a000-00000000c002';
  if n is distinct from 0 then raise exception 'B4 NE lit PAS le rattachement du parc PENDING de A FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'B4 NE lit PAS le rattachement du parc PENDING de A OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from parks where id = 'e0470000-0000-4000-a000-00000000c002';
  if n is distinct from 0 then raise exception 'B5 NE lit PAS le parc pending de A FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'B5 NE lit PAS le parc pending de A OK';
end $$;
do $$ declare n int; begin
  update parks set name = 'zzz_hack' where id = 'e0470000-0000-4000-a000-00000000c001';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'B6 NE modifie PAS le parc publié de A FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'B6 NE modifie PAS le parc publié de A OK';
end $$;
do $$ declare n int; begin
  update organization_parks set role = 'manager' where organization_id = 'e0470000-0000-4000-a000-00000000b001';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'B7 NE modifie PAS une association de A FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'B7 NE modifie PAS une association de A OK';
end $$;
do $$ begin
  insert into organization_parks (organization_id, park_id, role) values ('e0470000-0000-4000-a000-00000000b001', 'e0470000-0000-4000-a000-00000000c005', 'owner');
  raise exception 'B8 NE crée PAS une association au nom de A FAIL — écriture acceptée à tort';
exception when insufficient_privilege or check_violation or raise_exception then
  if sqlerrm like '%FAIL%' then raise; end if;
  raise notice 'B8 NE crée PAS une association au nom de A OK (refusé : %)', sqlerrm;
end $$;
do $$ declare n int; begin
  select count(*) into n from reports where park_id in ('e0470000-0000-4000-a000-00000000c001','e0470000-0000-4000-a000-00000000c003');
  if n is distinct from 1 then raise exception 'B9 voit les signalements de SES parcs seulement FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'B9 voit les signalements de SES parcs seulement OK';
end $$;

-- ═══ UTILISATEUR CONNECTÉ SANS ORGANISATION (parent) ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0470000-0000-4000-a000-00000000a005","role":"authenticated"}',true);
do $$ declare n int; begin
  select count(*) into n from organizations where id in ('e0470000-0000-4000-a000-00000000b001','e0470000-0000-4000-a000-00000000b002');
  if n is distinct from 0 then raise exception 'P1 ne lit aucune organisation FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'P1 ne lit aucune organisation OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from communes where id in ('e0470000-0000-4000-a000-00000000b001','e0470000-0000-4000-a000-00000000b002');
  if n is distinct from 0 then raise exception 'P2 ne lit aucune commune FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'P2 ne lit aucune commune OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from team_members where organization_id in ('e0470000-0000-4000-a000-00000000b001','e0470000-0000-4000-a000-00000000b002');
  if n is distinct from 0 then raise exception 'P3 ne lit aucune équipe FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'P3 ne lit aucune équipe OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from park_public where id in ('e0470000-0000-4000-a000-00000000c001','e0470000-0000-4000-a000-00000000c003','e0470000-0000-4000-a000-00000000c005');
  if n is distinct from 3 then raise exception 'P4 lecture publique des parcs publiés conservée FAIL — obtenu %, attendu 3', n; end if;
  raise notice 'P4 lecture publique des parcs publiés conservée OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from park_public where id in ('e0470000-0000-4000-a000-00000000c002','e0470000-0000-4000-a000-00000000c004');
  if n is distinct from 0 then raise exception 'P5 ne lit pas les parcs pending FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'P5 ne lit pas les parcs pending OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from park_public where id = 'e0470000-0000-4000-a000-00000000c001' and organization_id = 'e0470000-0000-4000-a000-00000000b001' and commune_id = 'e0470000-0000-4000-a000-00000000b001';
  if n is distinct from 1 then raise exception 'P6 park_public expose toujours organization_id/commune_id du parc publié (routage mobile) FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'P6 park_public expose toujours organization_id/commune_id du parc publié (routage mobile) OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from park_public where id = 'e0470000-0000-4000-a000-00000000c005' and organization_id is null;
  if n is distinct from 1 then raise exception 'P7 parc publié sans propriétaire : organization_id NULL FAIL — obtenu %, attendu 1', n; end if;
  raise notice 'P7 parc publié sans propriétaire : organization_id NULL OK';
end $$;
do $$ declare n int; begin
  update parks set name = 'zzz_hack' where id in ('e0470000-0000-4000-a000-00000000c001','e0470000-0000-4000-a000-00000000c003','e0470000-0000-4000-a000-00000000c005');
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'P8 ne modifie aucun parc FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'P8 ne modifie aucun parc OK';
end $$;
do $$ begin
  insert into organization_parks (organization_id, park_id, role) values ('e0470000-0000-4000-a000-00000000b001', 'e0470000-0000-4000-a000-00000000c005', 'owner');
  raise exception 'P9 ne crée aucune association FAIL — écriture acceptée à tort';
exception when insufficient_privilege or check_violation or raise_exception then
  if sqlerrm like '%FAIL%' then raise; end if;
  raise notice 'P9 ne crée aucune association OK (refusé : %)', sqlerrm;
end $$;

-- ═══ ANONYME (non connecté) ═══
reset role;
set local role anon;
select set_config('request.jwt.claims','',true);
do $$ declare n int; begin
  select count(*) into n from organizations where id in ('e0470000-0000-4000-a000-00000000b001','e0470000-0000-4000-a000-00000000b002');
  if n is distinct from 0 then raise exception 'N1 ne lit aucune organisation (contact_email non public) FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'N1 ne lit aucune organisation (contact_email non public) OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from communes where id in ('e0470000-0000-4000-a000-00000000b001','e0470000-0000-4000-a000-00000000b002');
  if n is distinct from 0 then raise exception 'N2 ne lit aucune commune FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'N2 ne lit aucune commune OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from team_members where organization_id in ('e0470000-0000-4000-a000-00000000b001','e0470000-0000-4000-a000-00000000b002');
  if n is distinct from 0 then raise exception 'N3 ne lit aucune équipe FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'N3 ne lit aucune équipe OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from park_public where id in ('e0470000-0000-4000-a000-00000000c001','e0470000-0000-4000-a000-00000000c003','e0470000-0000-4000-a000-00000000c005');
  if n is distinct from 3 then raise exception 'N4 lecture publique des parcs publiés conservée FAIL — obtenu %, attendu 3', n; end if;
  raise notice 'N4 lecture publique des parcs publiés conservée OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from park_public where id in ('e0470000-0000-4000-a000-00000000c002','e0470000-0000-4000-a000-00000000c004');
  if n is distinct from 0 then raise exception 'N5 ne lit pas les parcs pending FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'N5 ne lit pas les parcs pending OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from organization_parks where park_id in ('e0470000-0000-4000-a000-00000000c001','e0470000-0000-4000-a000-00000000c003');
  if n is distinct from 2 then raise exception 'N6 lit le lien parc publié ↔ organisation (public par design) FAIL — obtenu %, attendu 2', n; end if;
  raise notice 'N6 lit le lien parc publié ↔ organisation (public par design) OK';
end $$;
do $$ declare n int; begin
  select count(*) into n from organization_parks where park_id in ('e0470000-0000-4000-a000-00000000c002','e0470000-0000-4000-a000-00000000c004');
  if n is distinct from 0 then raise exception 'N7 NE lit PAS les liens des parcs non publiés FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'N7 NE lit PAS les liens des parcs non publiés OK';
end $$;
do $$ declare n int; begin
  update parks set name = 'zzz_hack' where id = 'e0470000-0000-4000-a000-00000000c001';
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'N8 ne modifie aucun parc FAIL — obtenu %, attendu 0', n; end if;
  raise notice 'N8 ne modifie aucun parc OK';
end $$;

reset role;
rollback;
