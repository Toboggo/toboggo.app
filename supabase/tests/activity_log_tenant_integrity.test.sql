-- ════════════════════════════════════════════════════════════════════════════
-- Test — intégrité du journal d'activité (migration 0052, P1-A)
-- ────────────────────────────────────────────────────────────────────────────
-- Exécute de VRAIES opérations contre les vraies policies (rôles `anon` / `authenticated`
-- + claims JWT). Chaque tentative d'attaque / chemin légitime tourne dans une
-- sous-transaction annulée aussitôt (scénarios indépendants).
--
-- USAGE (base LOCALE ou STAGING — JAMAIS la production). Tout est annulé (ROLLBACK).
--   # AVANT correction : le test DOIT échouer (démonstration de l'exploit)
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres < supabase/tests/activity_log_tenant_integrity.test.sql
--   # AVEC la migration, dans la même transaction (base non modifiée) :
--   { echo 'begin;'; cat supabase/migrations/0052_activity_log_tenant_integrity.sql; \
--     cat supabase/tests/activity_log_tenant_integrity.test.sql; } | docker exec -i supabase_db_<project> psql -U postgres -d postgres
-- ════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select v.id::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',v.email,'',now(),now(),now() from (values
 ('e0510000-0000-4000-a000-0000000000a1','zzz-0052-admin@t.local'),('e0510000-0000-4000-a000-0000000000a2','zzz-0052-ga@t.local'),('e0510000-0000-4000-a000-0000000000a3','zzz-0052-ca@t.local'),
 ('e0510000-0000-4000-a000-0000000000a4','zzz-0052-gb@t.local'),('e0510000-0000-4000-a000-0000000000a5','zzz-0052-cb@t.local'),('e0510000-0000-4000-a000-0000000000a6','zzz-0052-parent@t.local')) v(id,email);
update profiles set name = 'Camille Parent' where id = 'e0510000-0000-4000-a000-0000000000a6';
insert into organizations (id,name,type,contact_email) values ('e0510000-0000-4000-b000-000000000001','zzz_a','municipality','a@t.local'),('e0510000-0000-4000-b000-000000000002','zzz_b','municipality','b@t.local');
insert into communes (id,name) values ('e0510000-0000-4000-b000-000000000001','zzz_a'),('e0510000-0000-4000-b000-000000000002','zzz_b');
insert into team_members (user_id,organization_id,name,email,role) values
 ('e0510000-0000-4000-a000-0000000000a1',null,'Admin','zzz-0052-admin@t.local','super_admin'),('e0510000-0000-4000-a000-0000000000a2','e0510000-0000-4000-b000-000000000001','GA','zzz-0052-ga@t.local','gestionnaire'),
 ('e0510000-0000-4000-a000-0000000000a3','e0510000-0000-4000-b000-000000000001','CA','zzz-0052-ca@t.local','contributeur'),('e0510000-0000-4000-a000-0000000000a4','e0510000-0000-4000-b000-000000000002','GB','zzz-0052-gb@t.local','gestionnaire'),
 ('e0510000-0000-4000-a000-0000000000a5','e0510000-0000-4000-b000-000000000002','CB','zzz-0052-cb@t.local','contributeur');
insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000002','Gest B','entrée légitime B'),('e0510000-0000-4000-b000-000000000001','Gest A','entrée légitime A');
create temp table r (n serial, name text, ok boolean, detail text);
grant all on r to public; grant usage on sequence r_n_seq to public;

-- ═══ Attaques : forgerie dans le journal d'une autre collectivité ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a6","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000002','Support Toboggo','Cliquez ici pour réinitialiser votre accès');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('parent (non membre) → journal de B', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values (null,'Admin','forgé');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('parent (non membre) → journal GLOBAL staff (organization_id NULL)', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000001','x','forgé');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('parent → journal de A', res, det);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a3","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000002','Gest B','forgé par A');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A → journal de B', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (commune_id,organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000001','e0510000-0000-4000-b000-000000000002','x','double colonne');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A → journal de B avec commune_id=A + organization_id=B', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (commune_id,actor,text) values ('e0510000-0000-4000-b000-000000000002','x','v1');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A → journal de B avec commune_id=B seul', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values (null,'Admin','forgé');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A → journal GLOBAL staff', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000002','x','ret') returning id into v;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A → B via INSERT … RETURNING (contournement)', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (id,organization_id,actor,text) select id,'e0510000-0000-4000-b000-000000000002','x','ups' from activity_log limit 1 on conflict (id) do update set text = 'ups';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A → B via upsert ON CONFLICT (id)', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (id,created_at,organization_id,actor,text) values (gen_random_uuid(),'2001-01-01','e0510000-0000-4000-b000-000000000002','x','antidaté');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A → B avec created_at/id forgés', res, det);
end $$;
do $$ declare n int; begin select count(*) into n from activity_log where organization_id = 'e0510000-0000-4000-b000-000000000002' or commune_id = 'e0510000-0000-4000-b000-000000000002';
  insert into r(name, ok, detail) values ('contributeur de A ne LIT PAS le journal de B', n = 0, 'lignes=' || n); end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    update activity_log set text = 'pwned' where organization_id = 'e0510000-0000-4000-b000-000000000002';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A modifie le journal de B', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    delete from activity_log where organization_id = 'e0510000-0000-4000-b000-000000000002';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A supprime le journal de B', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    update activity_log set text = 'réécrit' where organization_id = 'e0510000-0000-4000-b000-000000000001';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A modifie son PROPRE journal (append-only)', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    delete from activity_log where organization_id = 'e0510000-0000-4000-b000-000000000001';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A supprime son PROPRE journal (append-only)', res, det);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a2","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values (null,'Admin','forgé');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('gestionnaire de A → journal GLOBAL staff', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000002','x','forgé');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('gestionnaire de A → journal de B', res, det);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a4","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000001','x','forgé');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('gestionnaire de B → journal de A', res, det);
end $$;
-- ═══ Anonyme ═══
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000002','x','anon');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('anon → journal (n''importe lequel)', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values (null,'x','anon');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('anon → journal global', res, det);
end $$;
-- ═══ Chemins légitimes conservés ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a3","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text,color) values ('e0510000-0000-4000-b000-000000000001','CA','Inspection planifiée','primary');
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A écrit dans le journal de A (logActivity back-office)', res, det);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a2","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000001','GA','Parc modifié : X');
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('gestionnaire de A écrit dans le journal de A', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000001','GA','ret') returning id into v;
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('gestionnaire de A : insert + RETURNING sur son journal', res, det);
end $$;
do $$ declare v boolean; d text; t timestamptz; begin
  begin
    insert into activity_log (organization_id,actor,text,created_at) values ('e0510000-0000-4000-b000-000000000001','GA','antidaté','2001-01-01') returning created_at into t;
    v := t > now() - interval '1 minute'; d := 'created_at stocké = ' || t::date;
    raise exception 'ROLLBACK';
  exception when others then if sqlerrm <> 'ROLLBACK' then v := false; d := left(sqlerrm,80); end if; end;
  insert into r(name, ok, detail) values ('created_at non falsifiable (antidatage neutralisé)', v, d);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a4","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000002','GB','Signalement résolu : X');
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('gestionnaire de B écrit dans le journal de B', res, det);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a1","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values (null,'Admin','Parc retiré : X');
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('staff Toboggo écrit dans le journal GLOBAL', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000001','Admin','x');
    get diagnostics n = row_count;
    if n < 1 then raise exception 'NOTHING-DONE'; end if;
    raise exception 'ROLLBACK-OK rows=%', n;
  exception when others then
    if sqlerrm like 'ROLLBACK-OK%' then res := true; det := sqlerrm; else res := false; det := left(sqlerrm, 90); end if;
  end;
  insert into r(name, ok, detail) values ('staff Toboggo écrit dans le journal d''une collectivité', res, det);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a3","role":"authenticated"}',true);

insert into activity_log (organization_id,actor,text) values ('e0510000-0000-4000-b000-000000000001','CA','visible-A-0052');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a2","role":"authenticated"}',true);

do $$ declare n int; begin select count(*) into n from activity_log where text = 'visible-A-0052';
  insert into r(name, ok, detail) values ('l''entrée écrite par un contributeur de A est lue par le gestionnaire de A', n = 1, 'lignes=' || n); end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a4","role":"authenticated"}',true);

do $$ declare n int; begin select count(*) into n from activity_log where text = 'visible-A-0052';
  insert into r(name, ok, detail) values ('… et n''est PAS visible pour B', n = 0, 'lignes=' || n); end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a1","role":"authenticated"}',true);

do $$ declare n int; begin select count(*) into n from activity_log where organization_id is null and text like 'Parc ajouté : zzz_%';
  insert into r(name, ok, detail) values ('staff : journal global lisible (base vide de forgeries)', true, 'entrées globales « Parc ajouté » = ' || n); end $$;
-- ═══ Chemin mobile : « Parc ajouté » du parent (trigger serveur) ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a6","role":"authenticated"}',true);

insert into parks (name,latitude,longitude,min_age,max_age,country_code,timezone,created_by) values ('zzz_mobile_park',43.6,1.44,3,10,'FR','Europe/Paris','e0510000-0000-4000-a000-0000000000a6');
do $$ begin
  begin insert into activity_log (organization_id,actor,text,color) values (null,'Vous','Parc ajouté : zzz_mobile_park','primary'); exception when others then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a1","role":"authenticated"}',true);

do $$ declare n int; a text; begin
  select count(*), min(actor) into n, a from activity_log where organization_id is null and text = 'Parc ajouté : zzz_mobile_park';
  insert into r(name, ok, detail) values ('parent ajoute un parc → UNE entrée « Parc ajouté » dans le journal global (le staff la voit)', n = 1, 'entrées=' || n || ', acteur=' || coalesce(a,'?')); end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0510000-0000-4000-a000-0000000000a3","role":"authenticated"}',true);

insert into parks (name,latitude,longitude,min_age,max_age,country_code,timezone,created_by) values ('zzz_member_park',43.6,1.44,3,10,'FR','Europe/Paris','e0510000-0000-4000-a000-0000000000a3');
reset role;
do $$ declare n int; begin select count(*) into n from activity_log where text = 'Parc ajouté : zzz_member_park';
  insert into r(name, ok, detail) values ('membre de collectivité ajoute un parc → pas de doublon serveur (il journalise via le back-office)', n = 0, 'entrées=' || n); end $$;
insert into parks (name,latitude,longitude,min_age,max_age,country_code,timezone) values ('zzz_import_park',43.6,1.44,3,10,'FR','Europe/Paris');
do $$ declare n int; begin select count(*) into n from activity_log where text = 'Parc ajouté : zzz_import_park';
  insert into r(name, ok, detail) values ('import serveur (auth.uid() NULL) → aucune entrée parasite', n = 0, 'entrées=' || n); end $$;
do $$ declare v boolean; d text; begin
  begin insert into activity_log (commune_id, organization_id, actor, text) values ('e0510000-0000-4000-b000-000000000001','e0510000-0000-4000-b000-000000000002','x','incohérent'); v := false; d := 'ligne incohérente acceptée';
  exception when check_violation then v := true; d := 'refusé par la contrainte'; when others then v := true; d := 'refusé : ' || left(sqlerrm,60); end;
  insert into r(name, ok, detail) values ('contrainte : commune_id ≠ organization_id refusé même pour le propriétaire', v, d); end $$;
do $$ declare n int; begin select count(*) into n from activity_log where commune_id is distinct from organization_id;
  insert into r(name, ok, detail) values ('données : aucune ligne incohérente', n = 0, 'incohérentes=' || n); end $$;
select n as "#", case when ok then 'PASS' else 'FAIL' end as résultat, name as test, detail from r order by n;
select count(*) filter (where ok) as pass, count(*) filter (where not ok) as fail, count(*) as total from r;
do $$ declare f int; begin select count(*) into f from r where not ok; if f > 0 then raise exception 'ACTIVITY_LOG INTEGRITY — % test(s) en échec', f; end if; raise notice 'ACTIVITY_LOG INTEGRITY — tous les tests OK'; end $$;
rollback;
