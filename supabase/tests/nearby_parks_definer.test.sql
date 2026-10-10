-- ════════════════════════════════════════════════════════════════════════════
-- Test — `nearby_parks` SECURITY DEFINER (migration 0046) : équivalence de
-- sécurité + pagination par curseur. NE CRÉE RIEN de durable.
-- ────────────────────────────────────────────────────────────────────────────
-- Démontre, par rôle (anon, authenticated simple, créateur d'un parc pending,
-- gestionnaire, staff) et sur zones US / FR / ES :
--   E1  résultat(nouvelle fonction) ≡ résultat(ancienne logique INVOKER sous
--       RLS : `park_public` filtré published/non fermé, même rôle), ligne à
--       ligne (md5 du jsonb des colonnes renvoyées) ;
--   E2  aucun parc pending / draft / rejected / blocked / permanently_closed ;
--   E3  aucune photo non approuvée (cover_photo et photos) ;
--   E4  les données d'un parc non publié (features, scores, noms, médias)
--       ne fuient pas ;
--   P1  `nearby_parks_page` : pages (limit 2) = liste complète, sans doublon,
--       ordre stable même avec égalité de distance ;
--   P2  limites (p_limit borné [1, 1000]) et rayon plafonné à 100 km ;
--   S1  droits EXECUTE : anon/authenticated/service_role oui, PUBLIC non.
--
-- USAGE (base LOCALE — JAMAIS la production). La migration est appliquée DANS
-- la transaction de test puis tout est annulé :
--   ( echo 'begin;'; cat supabase/migrations/0046_nearby_parks_definer.sql; \
--     cat supabase/tests/nearby_parks_definer.test.sql; echo 'rollback;' ) \
--   | docker exec -i supabase_db_<project> psql -U postgres -d postgres -v ON_ERROR_STOP=1
-- Variante « STAGING » (policies scindées + fonction CTE, hors dépôt) :
--   ajouter `cat supabase/tests/nearby_parks_definer_staging_baseline.sql`
--   AVANT la migration dans la commande ci-dessus.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Fixtures (rôle postgres) ────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('e0460000-0000-4000-a000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-0046-plain@test.local',   '', now(), now(), now()),
  ('e0460000-0000-4000-a000-00000000a002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-0046-creator@test.local', '', now(), now(), now()),
  ('e0460000-0000-4000-a000-00000000a003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-0046-gest@test.local',    '', now(), now(), now()),
  ('e0460000-0000-4000-a000-00000000a004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-0046-staff@test.local',   '', now(), now(), now());

insert into organizations (id, name, type) values ('e0460000-0000-4000-a000-00000000b001', 'zzz_org_0046', 'municipality');
insert into communes (id, name) values ('e0460000-0000-4000-a000-00000000b001', 'zzz_org_0046');
insert into team_members (user_id, organization_id, name, email, role) values
  ('e0460000-0000-4000-a000-00000000a003', 'e0460000-0000-4000-a000-00000000b001', 'Gest', 'zzz-0046-gest@test.local', 'gestionnaire'),
  ('e0460000-0000-4000-a000-00000000a004', null, 'Staff', 'zzz-0046-staff@test.local', 'super_admin');

-- Parcs publiés visibles : 2 à New York À LA MÊME POSITION (égalité de distance),
-- 1 à Lyon, 1 à Barcelone. Parcs INTERDITS : pending / draft / rejected /
-- blocked / publié-mais-définitivement-fermé (tous à New York).
insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status, operational_status, created_by) values
  ('e0460000-0000-4000-a000-00000000c001', 'zzz_ny_pub_1',   40.7580, -73.9855, 'US', 'America/New_York', 'published', 'active', null),
  ('e0460000-0000-4000-a000-00000000c002', 'zzz_ny_pub_2',   40.7580, -73.9855, 'US', 'America/New_York', 'published', 'active', null),
  ('e0460000-0000-4000-a000-00000000c003', 'zzz_ny_pub_3',   40.7600, -73.9800, 'US', 'America/New_York', 'published', 'active', null),
  ('e0460000-0000-4000-a000-00000000c004', 'zzz_lyon_pub',   45.7640,   4.8357, 'FR', 'Europe/Paris',     'published', 'active', null),
  ('e0460000-0000-4000-a000-00000000c005', 'zzz_bcn_pub',    41.3900,   2.1700, 'ES', 'Europe/Madrid',    'published', 'active', null),
  ('e0460000-0000-4000-a000-00000000d001', 'zzz_ny_pending', 40.7581, -73.9856, 'US', 'America/New_York', 'pending',   'active', 'e0460000-0000-4000-a000-00000000a002'),
  ('e0460000-0000-4000-a000-00000000d002', 'zzz_ny_draft',   40.7582, -73.9857, 'US', 'America/New_York', 'draft',     'active', 'e0460000-0000-4000-a000-00000000a002'),
  ('e0460000-0000-4000-a000-00000000d003', 'zzz_ny_rejected',40.7583, -73.9858, 'US', 'America/New_York', 'rejected',  'active', null),
  ('e0460000-0000-4000-a000-00000000d004', 'zzz_ny_blocked', 40.7584, -73.9859, 'US', 'America/New_York', 'blocked',   'active', null),
  ('e0460000-0000-4000-a000-00000000d005', 'zzz_ny_closed',  40.7585, -73.9860, 'US', 'America/New_York', 'published', 'permanently_closed', null);

-- Le gestionnaire gère le parc pending ET un parc publié.
insert into organization_parks (organization_id, park_id, role) values
  ('e0460000-0000-4000-a000-00000000b001', 'e0460000-0000-4000-a000-00000000d001', 'owner'),
  ('e0460000-0000-4000-a000-00000000b001', 'e0460000-0000-4000-a000-00000000c001', 'owner');

-- Médias : approuvé / pending / rejected sur un parc publié ET approuvé sur un parc pending.
insert into park_media (id, park_id, url, user_id, source, status, is_cover) values
  ('e0460000-0000-4000-a000-00000000e001', 'e0460000-0000-4000-a000-00000000c001', 'zzz-approved.webp', null, 'user', 'approved', true),
  ('e0460000-0000-4000-a000-00000000e002', 'e0460000-0000-4000-a000-00000000c001', 'zzz-pending.webp',  'e0460000-0000-4000-a000-00000000a002', 'user', 'pending',  false),
  ('e0460000-0000-4000-a000-00000000e003', 'e0460000-0000-4000-a000-00000000c001', 'zzz-rejected.webp', 'e0460000-0000-4000-a000-00000000a002', 'user', 'rejected', false),
  ('e0460000-0000-4000-a000-00000000e004', 'e0460000-0000-4000-a000-00000000d001', 'zzz-secret-pending-park.webp', null, 'user', 'approved', true);

-- Features / noms / scores sur le parc pending (ne doivent jamais sortir) et sur un parc publié.
insert into park_features (park_id, feature_id, status)
select 'e0460000-0000-4000-a000-00000000d001', id, 'available' from features where code = 'slide';
insert into park_features (park_id, feature_id, status)
select 'e0460000-0000-4000-a000-00000000c001', id, 'available' from features where code in ('slide', 'swing');
insert into park_names (park_id, lang, name, is_primary) values
  ('e0460000-0000-4000-a000-00000000d001', 'en', 'zzz_secret_name_pending', false),
  ('e0460000-0000-4000-a000-00000000c001', 'en', 'zzz_public_name', false);
insert into park_scores (park_id, algorithm_version, overall_score) values
  ('e0460000-0000-4000-a000-00000000d001', 'zzz', 99),
  ('e0460000-0000-4000-a000-00000000c001', 'zzz', 4.2);

select set_config('zzz.forbidden',
  'e0460000-0000-4000-a000-00000000d001,e0460000-0000-4000-a000-00000000d002,e0460000-0000-4000-a000-00000000d003,e0460000-0000-4000-a000-00000000d004,e0460000-0000-4000-a000-00000000d005', true);

-- ── Assistant d'équivalence : s'exécute SOUS LE RÔLE COURANT ─────────────────
-- Référence = l'ancienne logique INVOKER (0017) : park_public (security_invoker)
-- + filtres, soumise à la RLS du rôle appelant.
create or replace function public.zzz_equiv(p_lat double precision, p_lng double precision, p_radius int, p_label text)
returns text language plpgsql as $$
declare
  forbidden text[] := string_agg_to_array(current_setting('zzz.forbidden'));
  keys text[]; new_h text; ref_h text; n_new int; n_ref int; leaked int; bad_photo int;
begin
  select array_agg(k) into keys from jsonb_object_keys(
    (select to_jsonb(t) from public.nearby_parks(p_lat, p_lng, p_radius) t limit 1)) k;

  select count(*), md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), ''))
    into n_new, new_h from public.nearby_parks(p_lat, p_lng, p_radius) t;

  select count(*), md5(coalesce(string_agg(j::text, '|' order by j->>'id'), ''))
    into n_ref, ref_h
  from (
    select (select jsonb_object_agg(k, (to_jsonb(v) || jsonb_build_object(
              'distance_m', ST_Distance(v.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)))->k)
            from unnest(coalesce(keys, array[]::text[])) k) as j
    from public.park_public v
    where v.moderation_status = 'published'
      and v.operational_status <> 'permanently_closed'
      and ST_DWithin(v.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius)
  ) s where j is not null;

  if n_new <> n_ref or new_h <> ref_h then
    raise exception '[%] E1 ÉCART : nouvelle fonction % lignes / référence INVOKER % lignes (hash % vs %)',
      p_label, n_new, n_ref, new_h, ref_h;
  end if;

  select count(*) into leaked from public.nearby_parks(p_lat, p_lng, p_radius) t where t.id::text = any(forbidden);
  if leaked > 0 then raise exception '[%] E2 FUITE : % parc(s) interdit(s) renvoyé(s)', p_label, leaked; end if;

  select count(*) into bad_photo from public.nearby_parks(p_lat, p_lng, p_radius) t
   where t.cover_photo in ('zzz-pending.webp','zzz-rejected.webp','zzz-secret-pending-park.webp')
      or t.photos && array['zzz-pending.webp','zzz-rejected.webp','zzz-secret-pending-park.webp'];
  if bad_photo > 0 then raise exception '[%] E3 FUITE : photo non approuvée renvoyée', p_label; end if;

  if exists (select 1 from public.nearby_parks(p_lat, p_lng, p_radius) t
              where t.features::text like '%zzz_secret%' or t.score = 99) then
    raise exception '[%] E4 FUITE : données du parc non publié', p_label;
  end if;
  return format('%s OK (%s lignes)', p_label, n_new);
end $$;

create or replace function public.string_agg_to_array(p text) returns text[] language sql immutable as
  $$ select string_to_array(p, ',') $$;

grant execute on function public.zzz_equiv(double precision, double precision, int, text) to anon, authenticated;
grant execute on function public.string_agg_to_array(text) to anon, authenticated;

-- Scénarios par rôle. L'impersonation est posée AU NIVEAU SQL avant chaque bloc.
-- ── ANON ────────────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  raise notice '%', zzz_equiv(40.7580, -73.9855, 20000, 'anon/US 20km');
  raise notice '%', zzz_equiv(40.7580, -73.9855,  2000, 'anon/US 2km');
  raise notice '%', zzz_equiv(45.7640,   4.8357, 20000, 'anon/FR Lyon 20km');
  raise notice '%', zzz_equiv(41.3900,   2.1700, 20000, 'anon/ES Barcelone 20km');
  raise notice '%', zzz_equiv(-33.9, 151.2, 20000, 'anon/zone vide');
end $$;
reset role;

-- ── AUTHENTICATED : utilisateur sans droit particulier ──────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0460000-0000-4000-a000-00000000a001","role":"authenticated"}', true);
do $$ begin
  raise notice '%', zzz_equiv(40.7580, -73.9855, 20000, 'auth plain/US 20km');
  raise notice '%', zzz_equiv(45.7640,   4.8357, 20000, 'auth plain/FR');
  raise notice '%', zzz_equiv(41.3900,   2.1700, 20000, 'auth plain/ES');
end $$;
reset role;

-- ── AUTHENTICATED : créateur du parc pending/draft (E2 : ne le voit pas ici) ─
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0460000-0000-4000-a000-00000000a002","role":"authenticated"}', true);
do $$ begin
  raise notice '%', zzz_equiv(40.7580, -73.9855, 20000, 'auth créateur/US 20km');
end $$;
reset role;

-- ── AUTHENTICATED : gestionnaire (gère un parc pending ET un publié) ────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0460000-0000-4000-a000-00000000a003","role":"authenticated"}', true);
do $$ begin
  raise notice '%', zzz_equiv(40.7580, -73.9855, 20000, 'auth gestionnaire/US 20km');
end $$;
reset role;

-- ── AUTHENTICATED : staff Toboggo ───────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0460000-0000-4000-a000-00000000a004","role":"authenticated"}', true);
do $$ begin
  raise notice '%', zzz_equiv(40.7580, -73.9855, 20000, 'auth staff/US 20km');
  raise notice '%', zzz_equiv(45.7640,   4.8357, 20000, 'auth staff/FR');
end $$;
reset role;

-- ── Photo approuvée bien exposée, médias non approuvés absents (anon) ───────
set local role anon;
select set_config('request.jwt.claims', '', true);  -- anon : aucune identité résiduelle (sinon auth.uid() = staff)
do $$
declare r record;
begin
  select cover_photo, photos, features, score into r
  from nearby_parks(40.7580, -73.9855, 500) where id = 'e0460000-0000-4000-a000-00000000c001';
  if r.cover_photo is distinct from 'zzz-approved.webp' or r.photos <> array['zzz-approved.webp'] then
    raise exception 'photo approuvée attendue seule : cover=% photos=%', r.cover_photo, r.photos;
  end if;
  if not (r.features ? 'slide' and r.features ? 'swing') then raise exception 'features du parc publié attendues'; end if;
  raise notice 'anon : seule la photo approuvée est exposée, features du parc publié présentes';
end $$;
reset role;

-- ── P1 / P2 : pagination par curseur (anon) ─────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '', true);  -- anon : aucune identité résiduelle (sinon auth.uid() = staff)
do $$
declare
  full_ids uuid[]; paged uuid[] := '{}'; page_ids uuid[]; last_d double precision; last_id uuid; n int := 0;
begin
  select array_agg(id order by distance_m, id) into full_ids from nearby_parks(40.7580, -73.9855, 20000);
  if full_ids is null or array_length(full_ids, 1) < 3 then raise exception 'P1 : fixtures US absentes'; end if;
  -- l'ordre complet doit déjà être déterministe (égalité c001/c002 départagée par id)
  if not (array_position(full_ids, 'e0460000-0000-4000-a000-00000000c001'::uuid)
        < array_position(full_ids, 'e0460000-0000-4000-a000-00000000c002'::uuid)) then
    raise exception 'P1 : égalité de distance non départagée par id';
  end if;

  loop
    select array_agg(id order by distance_m, id), (array_agg(distance_m order by distance_m, id))[count(*)],
           (array_agg(id order by distance_m, id))[count(*)]
      into page_ids, last_d, last_id
    from nearby_parks_page(40.7580, -73.9855, 20000, 2, case when n = 0 then null else last_d end, case when n = 0 then null else last_id end);
    exit when page_ids is null;
    paged := paged || page_ids;
    n := n + 1;
    if n > 2000 then raise exception 'P1 : boucle de pagination infinie'; end if;
  end loop;

  if paged <> full_ids then raise exception 'P1 : pages (%) ≠ liste complète (%)', array_length(paged,1), array_length(full_ids,1); end if;
  if (select count(distinct x) from unnest(paged) x) <> array_length(paged, 1) then raise exception 'P1 : doublon entre pages'; end if;
  raise notice 'P1 OK : % lignes en % pages de 2, identiques à la liste complète, sans doublon', array_length(paged,1), n;

  -- P2 : bornes
  if (select count(*) from nearby_parks_page(40.7580, -73.9855, 20000, 0)) <> 1 then raise exception 'P2 : p_limit=0 doit renvoyer 1 ligne'; end if;
  if (select count(*) from nearby_parks_page(40.7580, -73.9855, 20000, null)) <> least(array_length(full_ids,1), 500) then raise exception 'P2 : p_limit par défaut = 500'; end if;
  if (select count(*) from nearby_parks_page(40.7580, -73.9855, 20000, 100000)) > 1000 then raise exception 'P2 : p_limit > 1000 non borné'; end if;
  -- rayon plafonné à 100 km : Lyon est à ~6 000 km de New York quel que soit le rayon demandé.
  if exists (select 1 from nearby_parks(40.7580, -73.9855, 2000000000) where country_code = 'FR') then
    raise exception 'P2 : rayon non plafonné';
  end if;
  raise notice 'P2 OK : p_limit borné [1,1000], rayon plafonné à 100 km';
end $$;
reset role;

-- ── S1 : droits EXECUTE ─────────────────────────────────────────────────────
do $$
declare f oid; g oid;
begin
  f := 'public.nearby_parks(double precision,double precision,int)'::regprocedure;
  g := 'public.nearby_parks_page(double precision,double precision,int,int,double precision,uuid)'::regprocedure;
  if not (has_function_privilege('anon', f, 'execute') and has_function_privilege('authenticated', f, 'execute')
      and has_function_privilege('anon', g, 'execute') and has_function_privilege('authenticated', g, 'execute')) then
    raise exception 'S1 : anon/authenticated doivent pouvoir exécuter';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid in (f, g) and a.grantee = 0) then
    raise exception 'S1 : EXECUTE accordé à PUBLIC';
  end if;
  raise notice 'S1 OK : EXECUTE = anon, authenticated, service_role (pas PUBLIC)';
end $$;

-- ── S3 : aucun élargissement des informations exposées ──────────────────────
-- Les colonnes renvoyées (contrat 0017) sont une liste FERMÉE, toutes déjà
-- présentes dans `park_public` (lisible par anon). Une colonne ajoutée plus tard
-- à `park_public` n'est PAS exposée par ces fonctions tant que la liste n'est
-- pas modifiée ici ET dans la migration (revue sécurité obligatoire).
do $$
declare
  expected text[] := array['id','name','description','latitude','longitude','lat','lng','country_code','timezone','city',
    'address_line','formatted_address','commune_id','organization_id','min_age','max_age','age_min','age_max',
    'moderation_status','operational_status','verification_status','status','rating','review_count','has_open_report',
    'views','created_by','created_at','updated_at','features','cover_photo','photos','score','surface','play_equipment',
    'wc','shade','fenced','pmr','benches','water','parking','distance_m'];
  actual text[]; page_cols text[]; extra text[];
begin
  select array_agg(k order by k) into actual from unnest(expected) k;  -- liste attendue triée
  select array_agg(c order by c) into page_cols from (
    select jsonb_object_keys(to_jsonb(t)) c from nearby_parks_page(40.7580, -73.9855, 500, 1) t limit 100) z;
  select array_agg(c order by c) into extra from (
    select jsonb_object_keys(to_jsonb(t)) c from nearby_parks(40.7580, -73.9855, 500) t limit 100) z;
  if (select array_agg(distinct c order by c) from unnest(page_cols) c) is distinct from actual then
    raise exception 'S3 : colonnes de nearby_parks_page ≠ contrat (%)', page_cols;
  end if;
  if (select array_agg(distinct c order by c) from unnest(extra) c) is distinct from actual then
    raise exception 'S3 : colonnes de nearby_parks ≠ contrat 0017';
  end if;
  if exists (select 1 from unnest(expected) e where e <> 'distance_m'
              and not exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = 'park_public' and column_name = e)) then
    raise exception 'S3 : une colonne renvoyée n''existe pas dans park_public';
  end if;
  raise notice 'S3 OK : 43 colonnes, liste fermée, toutes présentes dans park_public ; rien de plus n''est exposé';
end $$;

-- ── S2 : la RLS de `parks` reste intacte pour l'accès direct ────────────────
set local role anon;
select set_config('request.jwt.claims', '', true);  -- anon : aucune identité résiduelle (sinon auth.uid() = staff)
do $$
begin
  if exists (select 1 from parks where name like 'zzz_%' and moderation_status <> 'published') then
    raise exception 'S2 : anon lit un parc non publié en direct';
  end if;
  raise notice 'S2 OK : lecture directe de parks toujours filtrée par la RLS (anon)';
end $$;
reset role;

do $$ begin raise notice '== nearby_parks_definer.test.sql : TOUS LES TESTS PASSENT =='; end $$;
