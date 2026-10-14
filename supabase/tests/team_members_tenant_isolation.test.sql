-- ════════════════════════════════════════════════════════════════════════════
-- Test — isolation des équipes entre collectivités (migration 0051, P0-1)
-- ────────────────────────────────────────────────────────────────────────────
-- Exécute de VRAIES opérations contre les vraies policies PostgreSQL (rôle
-- `authenticated` + claims JWT, même technique que rls_organization_scope.test.sql).
--
-- Deux organisations (A, B), un gestionnaire + un contributeur chacune, un staff
-- Toboggo, un utilisateur sans appartenance. Chaque tentative d'attaque est exécutée
-- dans une sous-transaction annulée aussitôt : les scénarios sont indépendants.
--
-- USAGE (base LOCALE ou STAGING — JAMAIS la production). Tout est annulé (ROLLBACK).
--   # AVANT correction : le test DOIT échouer (démonstration de l'exploit)
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres < supabase/tests/team_members_tenant_isolation.test.sql
--   # AVEC la migration, dans la même transaction (base non modifiée) :
--   { echo 'begin;'; cat supabase/migrations/0051_team_members_tenant_isolation.sql; \
--     cat supabase/tests/team_members_tenant_isolation.test.sql; } | docker exec -i supabase_db_<project> psql -U postgres -d postgres
-- Sortie : un tableau PASS/FAIL, puis une exception finale si au moins un FAIL.
-- ════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), now(), now()
from (values
  ('e0500000-0000-4000-a000-0000000000a1','zzz-0051-admin@test.local'),
  ('e0500000-0000-4000-a000-0000000000a2','zzz-0051-gest-a@test.local'),
  ('e0500000-0000-4000-a000-0000000000a3','zzz-0051-contrib-a@test.local'),
  ('e0500000-0000-4000-a000-0000000000a4','zzz-0051-gest-b@test.local'),
  ('e0500000-0000-4000-a000-0000000000a5','zzz-0051-contrib-b@test.local'),
  ('e0500000-0000-4000-a000-0000000000a6','zzz-0051-outsider@test.local')
) as v(id, email);

insert into organizations (id, name, type, contact_email) values
  ('e0500000-0000-4000-b000-000000000001','zzz_org_0051_a','municipality','zzz-a@test.local'),
  ('e0500000-0000-4000-b000-000000000002','zzz_org_0051_b','municipality','zzz-b@test.local');
insert into communes (id, name) values ('e0500000-0000-4000-b000-000000000001','zzz_org_0051_a'),('e0500000-0000-4000-b000-000000000002','zzz_org_0051_b');

insert into team_members (user_id, organization_id, name, email, role) values
  ('e0500000-0000-4000-a000-0000000000a1', null, 'Admin', 'zzz-0051-admin@test.local', 'super_admin'),
  ('e0500000-0000-4000-a000-0000000000a2', 'e0500000-0000-4000-b000-000000000001', 'Gest A', 'zzz-0051-gest-a@test.local', 'gestionnaire'),
  ('e0500000-0000-4000-a000-0000000000a3', 'e0500000-0000-4000-b000-000000000001', 'Contrib A', 'zzz-0051-contrib-a@test.local', 'contributeur'),
  ('e0500000-0000-4000-a000-0000000000a4', 'e0500000-0000-4000-b000-000000000002', 'Gest B', 'zzz-0051-gest-b@test.local', 'gestionnaire'),
  ('e0500000-0000-4000-a000-0000000000a5', 'e0500000-0000-4000-b000-000000000002', 'Contrib B', 'zzz-0051-contrib-b@test.local', 'contributeur');

create temp table r (n serial, name text, ok boolean, detail text);
grant all on r to public;
grant usage on sequence r_n_seq to public;

-- ═══ USER A (gestionnaire de A) contre l'organisation B ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0500000-0000-4000-a000-0000000000a2","role":"authenticated"}',true);

do $$ declare n int; begin
  select count(*) into n from team_members where organization_id = 'e0500000-0000-4000-b000-000000000002';
  insert into r(name, ok, detail) values ('A-lit: membres de B visibles pour A', n = 0, 'lignes visibles=' || n || ' (attendu 0)');
end $$;
do $$ declare n int; begin
  select count(*) into n from team_members where organization_id = 'e0500000-0000-4000-b000-000000000001';
  insert into r(name, ok, detail) values ('A-lit: A voit toujours ses propres membres (A)', n = 2, 'lignes visibles=' || n || ' (attendu 2)');
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set role = 'contributeur' where user_id = 'e0500000-0000-4000-a000-0000000000a4';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-modifie: rôle d''un membre de B', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set name = 'pwned' where organization_id = 'e0500000-0000-4000-b000-000000000002';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-modifie: nom d''un membre de B', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    delete from team_members where user_id = 'e0500000-0000-4000-a000-0000000000a5';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-supprime: un membre de B', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    delete from team_members where organization_id = 'e0500000-0000-4000-b000-000000000002';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-supprime: tous les membres de B', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (user_id, organization_id, name, email, role) values ('e0500000-0000-4000-a000-0000000000a2','e0500000-0000-4000-b000-000000000002','x','zzz-0051-gest-a@test.local','gestionnaire');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-s''ajoute à B (organization_id=B)', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (user_id, commune_id, name, email, role) values ('e0500000-0000-4000-a000-0000000000a2','e0500000-0000-4000-b000-000000000002','x','zzz-0051-gest-a@test.local','gestionnaire');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-s''ajoute à B (commune_id=B)', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (user_id, commune_id, organization_id, name, email, role) values ('e0500000-0000-4000-a000-0000000000a2','e0500000-0000-4000-b000-000000000001','e0500000-0000-4000-b000-000000000002','x','zzz-0051-gest-a-2@test.local','gestionnaire');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-s''ajoute à B (commune_id=A + organization_id=B) [exploit P0-1]', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (user_id, commune_id, organization_id, name, email, role) values (null,'e0500000-0000-4000-b000-000000000001','e0500000-0000-4000-b000-000000000002','x','zzz-0051-victim@test.local','gestionnaire');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-invite un tiers dans B (commune_id=A + organization_id=B)', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set organization_id = 'e0500000-0000-4000-b000-000000000002' where user_id = 'e0500000-0000-4000-a000-0000000000a3';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-déplace son membre vers B (organization_id=B)', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set commune_id = 'e0500000-0000-4000-b000-000000000002' where user_id = 'e0500000-0000-4000-a000-0000000000a3';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-déplace son membre vers B (commune_id=B)', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set commune_id = 'e0500000-0000-4000-b000-000000000001', organization_id = 'e0500000-0000-4000-b000-000000000002' where user_id = 'e0500000-0000-4000-a000-0000000000a3';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-déplace son membre vers B (commune_id=A, organization_id=B)', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set organization_id = null where user_id = 'e0500000-0000-4000-a000-0000000000a2';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-se promeut staff Toboggo (organization_id=NULL)', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (user_id, organization_id, name, email, role) values ('e0500000-0000-4000-a000-0000000000a2', null, 'x', 'zzz-0051-staff@test.local', 'super_admin');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-se promeut staff Toboggo (insert organization_id=NULL)', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set role = 'super_admin' where user_id = 'e0500000-0000-4000-a000-0000000000a3';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-donne un rôle staff dans A (super_admin)', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set role = 'contributeur' where id = (select id from team_members where user_id = 'e0500000-0000-4000-a000-0000000000a4');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('A-modifie le rôle de B via l''id de ligne', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (user_id, commune_id, organization_id, name, email, role)
      values ('e0500000-0000-4000-a000-0000000000a2','e0500000-0000-4000-b000-000000000001','e0500000-0000-4000-b000-000000000002','x','zzz-0051-chain@test.local','gestionnaire');
    update organizations set contact_email = 'pwned@evil.test' where id = 'e0500000-0000-4000-b000-000000000002';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED org B modifiée (rows=%)', n; end if;
    res := true; det := 'chaîne bloquée';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'chaîne bloquée : ' || left(sqlerrm,60); end if;
  end;
  insert into r(name, ok, detail) values ('A-chaîne d''impact : s''ajouter à B puis modifier l''organisation B', res, det);
end $$;
-- ═══ USER A gère normalement A ═══
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (organization_id, name, email, role, invited_by) values ('e0500000-0000-4000-b000-000000000001','Nouveau','zzz-0051-new-a@test.local','contributeur','e0500000-0000-4000-a000-0000000000a2');
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('A-gère: invite un membre dans A', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set role = 'gestionnaire' where user_id = 'e0500000-0000-4000-a000-0000000000a3';
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('A-gère: change le rôle d''un membre de A', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    delete from team_members where user_id = 'e0500000-0000-4000-a000-0000000000a3';
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('A-gère: supprime un membre de A', res, det);
end $$;
do $$ declare res boolean; det text; v uuid; begin
  begin
    -- même forme que packages/shared/src/api/team.ts inviteTeamMember : insert(...).select().single()
    insert into team_members (organization_id, name, email, role, invited_by, user_id)
      values ('e0500000-0000-4000-b000-000000000001','Via API','zzz-0051-api@test.local','contributeur','e0500000-0000-4000-a000-0000000000a2', null) returning id into v;
    if v is null then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK id=%', v;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := 'insert … returning OK'; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('back-office: inviteTeamMember (insert + returning) par le gestionnaire de A', res, det);
end $$;
-- ═══ USER B gère normalement B (et ne touche pas A) ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0500000-0000-4000-a000-0000000000a4","role":"authenticated"}',true);

do $$ declare n int; begin
  select count(*) into n from team_members where organization_id = 'e0500000-0000-4000-b000-000000000002';
  insert into r(name, ok, detail) values ('B-lit: voit ses membres (B)', n = 2, 'lignes visibles=' || n || ' (attendu 2)');
end $$;
do $$ declare n int; begin
  select count(*) into n from team_members where organization_id = 'e0500000-0000-4000-b000-000000000001';
  insert into r(name, ok, detail) values ('B-lit: ne voit aucun membre de A', n = 0, 'lignes visibles=' || n || ' (attendu 0)');
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (organization_id, name, email, role, invited_by) values ('e0500000-0000-4000-b000-000000000002','Nouveau','zzz-0051-new-b@test.local','contributeur','e0500000-0000-4000-a000-0000000000a4');
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('B-gère: invite un membre dans B', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set role = 'gestionnaire' where user_id = 'e0500000-0000-4000-a000-0000000000a5';
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('B-gère: change le rôle d''un membre de B', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    delete from team_members where user_id = 'e0500000-0000-4000-a000-0000000000a5';
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('B-gère: supprime un membre de B', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    delete from team_members where organization_id = 'e0500000-0000-4000-b000-000000000001';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('B-attaque: supprime les membres de A', res, det);
end $$;
-- ═══ Contributeur de A : lecture seule ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0500000-0000-4000-a000-0000000000a3","role":"authenticated"}',true);

do $$ declare n int; begin
  select count(*) into n from team_members where organization_id = 'e0500000-0000-4000-b000-000000000001';
  insert into r(name, ok, detail) values ('contrib-A: voit les membres de A', n = 2, 'lignes visibles=' || n || ' (attendu 2)');
end $$;
do $$ declare n int; begin
  select count(*) into n from team_members where organization_id = 'e0500000-0000-4000-b000-000000000002';
  insert into r(name, ok, detail) values ('contrib-A: ne voit pas B', n = 0, 'lignes visibles=' || n || ' (attendu 0)');
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (organization_id, name, email, role) values ('e0500000-0000-4000-b000-000000000001','x','zzz-0051-c@test.local','contributeur');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contrib-A: ne peut pas inviter dans A', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set role = 'gestionnaire' where user_id = 'e0500000-0000-4000-a000-0000000000a3';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contrib-A: ne peut pas se promouvoir gestionnaire', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    delete from team_members where user_id = 'e0500000-0000-4000-a000-0000000000a2';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contrib-A: ne peut pas supprimer un membre de A', res, det);
end $$;
-- ═══ Utilisateur connecté SANS appartenance ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0500000-0000-4000-a000-0000000000a6","role":"authenticated"}',true);

do $$ declare n int; begin
  select count(*) into n from team_members where organization_id in ('e0500000-0000-4000-b000-000000000001','e0500000-0000-4000-b000-000000000002');
  insert into r(name, ok, detail) values ('outsider: ne voit aucun membre (A ni B)', n = 0, 'lignes visibles=' || n || ' (attendu 0)');
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (user_id, organization_id, name, email, role) values ('e0500000-0000-4000-a000-0000000000a6','e0500000-0000-4000-b000-000000000001','x','zzz-0051-outsider@test.local','gestionnaire');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('outsider: ne peut pas s''ajouter à A', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (user_id, commune_id, organization_id, name, email, role) values ('e0500000-0000-4000-a000-0000000000a6','e0500000-0000-4000-b000-000000000001','e0500000-0000-4000-b000-000000000002','x','zzz-0051-outsider@test.local','gestionnaire');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('outsider: ne peut pas s''ajouter à B (commune=outsider-free, org=B)', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (user_id, organization_id, name, email, role) values ('e0500000-0000-4000-a000-0000000000a6', null, 'x', 'zzz-0051-outsider@test.local', 'super_admin');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('outsider: ne peut pas se créer staff', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set role = 'contributeur';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('outsider: ne peut rien modifier', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    delete from team_members;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('outsider: ne peut rien supprimer', res, det);
end $$;
-- ═══ Anonyme ═══
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare n int; res boolean; det text; begin
  begin select count(*) into n from team_members; res := (n = 0); det := 'lignes=' || n;
  exception when others then res := true; det := 'refusé : ' || left(sqlerrm,60); end;
  insert into r(name, ok, detail) values ('anon: ne lit aucun membre', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (organization_id, name, email, role) values ('e0500000-0000-4000-b000-000000000001','x','zzz-0051-anon@test.local','gestionnaire');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('anon: ne peut pas insérer', res, det);
end $$;
-- ═══ Staff Toboggo (super_admin) : gestion de l'équipe Toboggo conservée ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0500000-0000-4000-a000-0000000000a1","role":"authenticated"}',true);

do $$ declare n int; begin
  select count(*) into n from team_members where organization_id is null and email like 'zzz-0051-%';
  insert into r(name, ok, detail) values ('staff: lit l''équipe Toboggo (organization_id NULL)', n = 1, 'lignes visibles=' || n || ' (attendu 1)');
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    insert into team_members (organization_id, name, email, role) values (null,'S','zzz-0051-staff2@test.local','support');
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('staff: invite un membre staff Toboggo', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update team_members set role = 'moderation' where user_id = 'e0500000-0000-4000-a000-0000000000a1';
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('staff: change un rôle staff', res, det);
end $$;
-- ═══ Invitation puis acceptation (inscription avec l'e-mail invité) ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0500000-0000-4000-a000-0000000000a2","role":"authenticated"}',true);

insert into team_members (organization_id, name, email, role, invited_by) values ('e0500000-0000-4000-b000-000000000001','Invité A','zzz-0051-invite@test.local','contributeur','e0500000-0000-4000-a000-0000000000a2');
reset role;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('e0500000-0000-4000-a000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zzz-0051-invite@test.local','',now(),now(),now());
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0500000-0000-4000-a000-0000000000b1","role":"authenticated"}',true);

do $$ declare a int; b int; begin
  select count(*) into a from team_members where organization_id = 'e0500000-0000-4000-b000-000000000001';
  select count(*) into b from team_members where organization_id = 'e0500000-0000-4000-b000-000000000002';
  insert into r(name, ok, detail) values ('invitation acceptée: l''invité (nouvel inscrit) rejoint A et ne voit pas B', a = 3 and b = 0, 'membres A visibles=' || a || ', B=' || b);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0500000-0000-4000-a000-0000000000a2","role":"authenticated"}',true);

do $$ declare res boolean; det text; begin
  begin
    insert into team_members (commune_id, organization_id, name, email, role, invited_by) values ('e0500000-0000-4000-b000-000000000001','e0500000-0000-4000-b000-000000000002','Piège','zzz-0051-trap@test.local','gestionnaire','e0500000-0000-4000-a000-0000000000a2');
    res := false; det := 'invitation inter-collectivité insérée';
  exception when others then res := true; det := 'refusé : ' || left(sqlerrm,70); end;
  insert into r(name, ok, detail) values ('invitation inter-collectivité (commune=A, org=B) refusée', res, det);
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from team_members where commune_id is distinct from organization_id;
  insert into r(name, ok, detail) values ('données: aucune ligne avec commune_id <> organization_id', n = 0, 'incohérentes=' || n);
end $$;
select n as "#", case when ok then 'PASS' else 'FAIL' end as résultat, name as test, detail from r order by n;
select count(*) filter (where ok) as pass, count(*) filter (where not ok) as fail, count(*) as total from r;
do $$ declare f int; begin select count(*) into f from r where not ok; if f > 0 then raise exception 'TEAM_MEMBERS ISOLATION — % test(s) en échec', f; end if; raise notice 'TEAM_MEMBERS ISOLATION — tous les tests OK'; end $$;
rollback;
