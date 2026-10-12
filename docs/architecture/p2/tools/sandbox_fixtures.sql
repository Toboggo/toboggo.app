-- Sandbox only (database rls_p2). Scale to prod-like volume + role fixtures.
set session_replication_role = replica;

-- 2) prod-like moderation distribution: ~76% pending, rest published (+ a few blocked/rejected)
update parks set moderation_status = 'pending' where (abs(hashtext(id::text)) % 100) < 76;
update parks set moderation_status = 'blocked'  where id in (select id from parks where moderation_status='published' order by id limit 3);
update parks set moderation_status = 'rejected' where id in (select id from parks where moderation_status='published' order by id desc limit 6);

-- 3) fixtures: users
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
select u, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', n||'@p2.test','x',now(),now(),'{}','{}'
from (values
 ('a0000000-0000-0000-0000-000000000001'::uuid,'staff'),
 ('a0000000-0000-0000-0000-000000000002','support'),
 ('a0000000-0000-0000-0000-000000000003','gestionnaire_lyon'),
 ('a0000000-0000-0000-0000-000000000004','contributeur_lyon'),
 ('a0000000-0000-0000-0000-000000000005','gestionnaire_bordeaux_legacy'),
 ('a0000000-0000-0000-0000-000000000006','creator'),
 ('a0000000-0000-0000-0000-000000000007','nobody')) v(u,n)
on conflict (id) do nothing;

delete from team_members where user_id::text like 'a0000000%';
insert into team_members (id, user_id, role, organization_id, name, email) values
 (gen_random_uuid(),'a0000000-0000-0000-0000-000000000001','super_admin',null,'staff','staff@p2.test'),
 (gen_random_uuid(),'a0000000-0000-0000-0000-000000000002','support',null,'support','support@p2.test'),
 (gen_random_uuid(),'a0000000-0000-0000-0000-000000000003','gestionnaire','00000000-0000-0000-0000-000000000001','gl','gl@p2.test'),
 (gen_random_uuid(),'a0000000-0000-0000-0000-000000000004','contributeur','00000000-0000-0000-0000-000000000001','cl','cl@p2.test');
-- legacy V1 member: only commune_id (trigger is skipped in this session, so set both like the compat trigger would)
insert into team_members (id, user_id, role, organization_id, commune_id, name, email) values
 (gen_random_uuid(),'a0000000-0000-0000-0000-000000000005','gestionnaire','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','gb','gb@p2.test');

-- 4) fixtures: park ownership / scoping — mixed statuses on purpose
-- org links: Lyon owns 15 parks (some pending), Bordeaux owns 5
delete from organization_parks;
insert into organization_parks (organization_id, park_id, role)
  select '00000000-0000-0000-0000-000000000001', id, 'owner' from (select id from parks order by id limit 15) x;
insert into organization_parks (organization_id, park_id, role)
  select '00000000-0000-0000-0000-000000000002', id, 'owner' from (select id from parks order by id desc limit 5) x;
-- legacy parks.commune_id path (Bordeaux), pending, no organization_parks link
update parks set commune_id='00000000-0000-0000-0000-000000000002', moderation_status='pending'
  where id in (select id from parks where moderation_status='pending' and id not in (select park_id from organization_parks) order by id limit 4);
-- creator's own pending parks
update parks set created_by='a0000000-0000-0000-0000-000000000006', moderation_status='pending'
  where id in (select id from parks where moderation_status='pending' and commune_id is null and id not in (select park_id from organization_parks) order by id limit 3);
-- make sure Lyon has at least 3 pending, 3 published
update parks set moderation_status='pending'   where id in (select park_id from organization_parks where organization_id='00000000-0000-0000-0000-000000000001' order by park_id limit 3);
update parks set moderation_status='published' where id in (select park_id from organization_parks where organization_id='00000000-0000-0000-0000-000000000001' order by park_id desc limit 3);

reset session_replication_role;
analyze;
