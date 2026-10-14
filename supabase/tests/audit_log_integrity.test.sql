-- ════════════════════════════════════════════════════════════════════════════
-- Test — intégrité de l'audit (migration 0053, P1-B)
-- ────────────────────────────────────────────────────────────────────────────
-- Exécute de VRAIES opérations contre les vraies policies (rôles `anon` / `authenticated`
-- + claims JWT). Chaque tentative tourne dans une sous-transaction annulée aussitôt.
--
-- USAGE (base LOCALE ou STAGING — JAMAIS la production). Tout est annulé (ROLLBACK).
--   # AVANT correction : le test DOIT échouer (démonstration de l'exploit)
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres < supabase/tests/audit_log_integrity.test.sql
--   # AVEC la migration, dans la même transaction (base non modifiée) :
--   { echo 'begin;'; cat supabase/migrations/0053_audit_log_integrity.sql; \
--     cat supabase/tests/audit_log_integrity.test.sql; } | docker exec -i supabase_db_<project> psql -U postgres -d postgres
-- ════════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select v.id::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',v.email,'',now(),now(),now() from (values
 ('e0520000-0000-4000-a000-0000000000a1','zzz-0053-admin@t.local'),('e0520000-0000-4000-a000-0000000000a2','zzz-0053-ga@t.local'),('e0520000-0000-4000-a000-0000000000a3','zzz-0053-ca@t.local'),
 ('e0520000-0000-4000-a000-0000000000a4','zzz-0053-gb@t.local'),('e0520000-0000-4000-a000-0000000000a5','zzz-0053-cb@t.local'),('e0520000-0000-4000-a000-0000000000a6','zzz-0053-parent@t.local')) v(id,email);
insert into organizations (id,name,type,contact_email) values ('e0520000-0000-4000-b000-000000000001','zzz_a','municipality','a@t.local'),('e0520000-0000-4000-b000-000000000002','zzz_b','municipality','b@t.local');
insert into communes (id,name) values ('e0520000-0000-4000-b000-000000000001','zzz_a'),('e0520000-0000-4000-b000-000000000002','zzz_b');
insert into team_members (user_id,organization_id,name,email,role) values
 ('e0520000-0000-4000-a000-0000000000a1',null,'Admin','zzz-0053-admin@t.local','super_admin'),('e0520000-0000-4000-a000-0000000000a2','e0520000-0000-4000-b000-000000000001','GA','zzz-0053-ga@t.local','gestionnaire'),
 ('e0520000-0000-4000-a000-0000000000a3','e0520000-0000-4000-b000-000000000001','CA','zzz-0053-ca@t.local','contributeur'),('e0520000-0000-4000-a000-0000000000a4','e0520000-0000-4000-b000-000000000002','GB','zzz-0053-gb@t.local','gestionnaire'),
 ('e0520000-0000-4000-a000-0000000000a5','e0520000-0000-4000-b000-000000000002','CB','zzz-0053-cb@t.local','contributeur');
insert into parks (id,name,latitude,longitude,min_age,max_age,country_code,timezone,moderation_status) values
 ('e0520000-0000-4000-c000-000000000001','zzz_parkA',43.6,1.44,3,10,'FR','Europe/Paris','published'),('e0520000-0000-4000-c000-000000000002','zzz_parkB',43.6,1.44,3,10,'FR','Europe/Paris','published');
insert into organization_parks (organization_id,park_id,role) values ('e0520000-0000-4000-b000-000000000001','e0520000-0000-4000-c000-000000000001','owner'),('e0520000-0000-4000-b000-000000000002','e0520000-0000-4000-c000-000000000002','owner');
insert into park_edits (id,park_id,user_id,changes) values
 ('e0520000-0000-4000-d000-000000000001','e0520000-0000-4000-c000-000000000001','e0520000-0000-4000-a000-0000000000a6','{"note":"zzz-proposition-A"}'),('e0520000-0000-4000-d000-000000000002','e0520000-0000-4000-c000-000000000002','e0520000-0000-4000-a000-0000000000a6','{"note":"zzz-proposition-B"}');
create temp table r (n serial, name text, ok boolean, detail text);
grant all on r to public; grant usage on sequence r_n_seq to public;

-- ═══ Attaques : écriture directe dans audit_log ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0520000-0000-4000-a000-0000000000a6","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into audit_log (entity_type,entity_id,action,actor_id,source) values ('parks','e0520000-0000-4000-c000-000000000002','update','e0520000-0000-4000-a000-0000000000a1','app');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('parent → entrée d''audit sur le parc de B, actor_id = admin (usurpation)', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into audit_log (entity_type,entity_id,action,actor_id,source) values ('parks','e0520000-0000-4000-c000-000000000002','delete','e0520000-0000-4000-a000-0000000000a4','account_deletion');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('parent → entrée forgée avec source = ''account_deletion''', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into audit_log (entity_type,entity_id,action,actor_id,source) values ('parks','e0520000-0000-4000-c000-000000000002','insert',null,'zzz-source-forgée');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('parent → entrée forgée avec source arbitraire', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into audit_log (entity_type,entity_id,action,old_value,new_value,actor_id) values ('parks','e0520000-0000-4000-c000-000000000002','update','{"name":"avant"}','{"name":"forgé"}','e0520000-0000-4000-a000-0000000000a6');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('parent → entrée forgée avec old_value/new_value arbitraires', res, det);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0520000-0000-4000-a000-0000000000a3","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into audit_log (entity_type,entity_id,action,actor_id,source) values ('parks','e0520000-0000-4000-c000-000000000002','update','e0520000-0000-4000-a000-0000000000a4','app');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A → entrée d''audit sur le parc de B (inter-collectivité)', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into audit_log (entity_type,entity_id,action,actor_id,source) values ('park_edits','e0520000-0000-4000-d000-000000000002','review','e0520000-0000-4000-a000-0000000000a1','app');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A → entrée d''audit « review » sur la proposition de B', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into audit_log (entity_type,entity_id,action,actor_id) values ('parks','e0520000-0000-4000-c000-000000000001','update','e0520000-0000-4000-a000-0000000000a3') returning id into v;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A → INSERT … RETURNING (contournement)', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into audit_log (id,entity_type,entity_id,action) select id,'parks','e0520000-0000-4000-c000-000000000002','x' from audit_log limit 1 on conflict (id) do update set action = 'forgé';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A → upsert ON CONFLICT', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into audit_log (entity_type,entity_id,action,actor_id,source) values ('parks','e0520000-0000-4000-c000-000000000001','update','e0520000-0000-4000-a000-0000000000a3','app');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('contributeur de A → sur son PROPRE parc (même acteur légitime) : écriture directe refusée aussi', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    update audit_log set action = 'forgé';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('modification directe d''une entrée d''audit', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    delete from audit_log;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('suppression directe d''une entrée d''audit', res, det);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0520000-0000-4000-a000-0000000000a2","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into audit_log (entity_type,entity_id,action,actor_id,source) values ('parks','e0520000-0000-4000-c000-000000000001','update','e0520000-0000-4000-a000-0000000000a2','app');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('gestionnaire de A (manage son parc) → écriture directe refusée', res, det);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0520000-0000-4000-a000-0000000000a1","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into audit_log (entity_type,entity_id,action,actor_id,source) values ('parks','e0520000-0000-4000-c000-000000000001','update','e0520000-0000-4000-a000-0000000000a1','app');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('staff Toboggo → écriture directe refusée (l''audit est produit par le système)', res, det);
end $$;
-- ═══ Anonyme ═══
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    insert into audit_log (entity_type,entity_id,action,actor_id,source) values ('parks','e0520000-0000-4000-c000-000000000002','update',null,'app');
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('anon → écriture directe', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    delete from audit_log;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('anon → modification / suppression', res, det);
end $$;
-- ═══ Fonction serveur : non détournable ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0520000-0000-4000-a000-0000000000a3","role":"authenticated"}',true);

do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    perform private.audit_review_park_edit('e0520000-0000-4000-d000-000000000002', '{"forgé":true}'::jsonb);
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('appel direct de private.audit_review_park_edit pour une proposition de B', res, det);
end $$;
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    perform private.audit_review_park_edit('e0520000-0000-4000-d000-000000000001', '{"forgé":true}'::jsonb);
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('appel direct pour une proposition de A non traitée par l''appelant', res, det);
end $$;
reset role; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare n int; res boolean; det text; v uuid; begin
  begin
    perform private.audit_review_park_edit('e0520000-0000-4000-d000-000000000001', '{}'::jsonb);
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('appel direct de la fonction serveur par anon', res, det);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0520000-0000-4000-a000-0000000000a2","role":"authenticated"}',true);
do $$ declare n int; res boolean; det text; begin
  begin
    update park_edits set reviewed_by = 'e0520000-0000-4000-a000-0000000000a2' where id = 'e0520000-0000-4000-d000-000000000001'; perform private.audit_review_park_edit('e0520000-0000-4000-d000-000000000001', '{"forgé":true}'::jsonb);
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('durcissement : le gestionnaire s''attribue reviewed_by (sans revue réelle) puis appelle la fonction serveur', res, det);
end $$;
do $$ declare n int; res boolean; det text; begin
  begin
    update park_edits set reviewed_by = 'e0520000-0000-4000-a000-0000000000a2', reviewed_at = now() - interval '1 second' where id = 'e0520000-0000-4000-d000-000000000001'; perform private.audit_review_park_edit('e0520000-0000-4000-d000-000000000001', '{"forgé":true}'::jsonb);
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ATTACK-SUCCEEDED rows=%', n; end if;
    res := true; det := 'refusé (0 ligne)';
  exception when others then
    if sqlerrm like 'ATTACK-SUCCEEDED%' then res := false; det := sqlerrm; else res := true; det := 'refusé : ' || left(sqlerrm, 70); end if;
  end;
  insert into r(name, ok, detail) values ('durcissement : revue ANTÉRIEURE à la transaction (reviewed_at passé) → fonction serveur refusée', res, det);
end $$;
-- ═══ Chemins légitimes conservés (écritures produites par le système) ═══
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0520000-0000-4000-a000-0000000000a2","role":"authenticated"}',true);

update parks set name = 'zzz_parkA_renomme' where id = 'e0520000-0000-4000-c000-000000000001';
do $$ declare n int; a text; s text; begin
  select count(*), min(actor_id::text), min(source) into n, a, s from audit_log where entity_type = 'parks' and entity_id = 'e0520000-0000-4000-c000-000000000001' and action = 'update' and new_value ->> 'name' = 'zzz_parkA_renomme';
  insert into r(name, ok, detail) values ('trigger audit_row : le gestionnaire modifie son parc → entrée créée, actor_id = lui, source = app', n = 1 and a = 'e0520000-0000-4000-a000-0000000000a2' and s = 'app', 'entrées=' || n || ', source=' || coalesce(s,'?')); end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0520000-0000-4000-a000-0000000000a4","role":"authenticated"}',true);

do $$ declare n int; begin select count(*) into n from audit_log where entity_id = 'e0520000-0000-4000-c000-000000000001';
  insert into r(name, ok, detail) values ('… et cette entrée n''est PAS lisible par B (autre collectivité)', n = 0, 'lignes=' || n); end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0520000-0000-4000-a000-0000000000a6","role":"authenticated"}',true);

insert into parks (name,latitude,longitude,min_age,max_age,country_code,timezone,created_by) values ('zzz_parc_parent',43.6,1.44,3,10,'FR','Europe/Paris','e0520000-0000-4000-a000-0000000000a6');
reset role; -- lecture hors RLS : on vérifie ce que le système a écrit
do $$ declare n int; a text; s text; begin
  select count(*), min(actor_id::text), min(source) into n, a, s from audit_log where entity_type = 'parks' and action = 'insert' and new_value ->> 'name' = 'zzz_parc_parent';
  insert into r(name, ok, detail) values ('trigger audit_row : un parent crée un parc → entrée créée, actor_id = lui (non falsifiable)', n = 1 and a = 'e0520000-0000-4000-a000-0000000000a6' and s = 'app', 'entrées=' || n || ', source=' || coalesce(s,'?')); end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0520000-0000-4000-a000-0000000000a2","role":"authenticated"}',true);

select review_park_edit('e0520000-0000-4000-d000-000000000001', 'reject', 'zzz-refus');
reset role; -- lecture hors RLS : on vérifie ce que le système a écrit
do $$ declare n int; a text; s text; d text; begin
  select count(*), min(actor_id::text), min(source), min(new_value ->> 'decision') into n, a, s, d from audit_log where entity_type = 'park_edits' and entity_id = 'e0520000-0000-4000-d000-000000000001' and action = 'review';
  insert into r(name, ok, detail) values ('review_park_edit : le gestionnaire rejette une proposition → entrée « review » créée par la fonction serveur (actor = lui, source = app)', n = 1 and a = 'e0520000-0000-4000-a000-0000000000a2' and s = 'app' and d = 'reject', 'entrées=' || n || ', décision=' || coalesce(d,'?')); end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0520000-0000-4000-a000-0000000000a2","role":"authenticated"}',true);

do $$ declare v boolean; d text; begin
  begin perform review_park_edit('e0520000-0000-4000-d000-000000000002', 'reject', 'zzz-hors-périmètre'); v := false; d := 'rejet d''une proposition de B accepté';
  exception when others then v := true; d := 'refusé : ' || left(sqlerrm,70); end;
  insert into r(name, ok, detail) values ('review_park_edit : le gestionnaire de A ne peut pas traiter la proposition de B (inchangé)', v, d); end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0520000-0000-4000-a000-0000000000a1","role":"authenticated"}',true);

do $$ declare n int; begin select count(*) into n from audit_log where entity_type = 'park_edits' and entity_id = 'e0520000-0000-4000-d000-000000000001' and action = 'review';
  insert into r(name, ok, detail) values ('staff : lit l''entrée « review » (audit_log_read inchangé)', n = 1, 'lignes=' || n); end $$;
reset role;
select n as "#", case when ok then 'PASS' else 'FAIL' end as résultat, name as test, detail from r order by n;
select count(*) filter (where ok) as pass, count(*) filter (where not ok) as fail, count(*) as total from r;
do $$ declare f int; begin select count(*) into f from r where not ok; if f > 0 then raise exception 'AUDIT_LOG INTEGRITY — % test(s) en échec', f; end if; raise notice 'AUDIT_LOG INTEGRITY — tous les tests OK'; end $$;
rollback;
