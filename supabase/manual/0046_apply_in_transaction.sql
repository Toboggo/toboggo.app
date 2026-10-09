-- ════════════════════════════════════════════════════════════════════════════
-- APPLICATION MANUELLE DE 0046 — à coller EN UNE FOIS dans le SQL Editor Supabase.
-- STAGING D'ABORD (validation), PRODUCTION seulement après accord explicite.
-- Tout est dans UNE transaction : si une instruction échoue, rien n'est appliqué
-- ET rien n'est enregistré dans supabase_migrations.schema_migrations.
-- Fichier généré : migration = supabase/migrations/0046_nearby_parks_definer.sql.
-- Retour arrière : supabase/manual/0046_rollback.sql.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- Garde-fous (prérequis) : échec ⇒ transaction annulée.
do $$
begin
  if to_regclass('public.parks') is null or to_regclass('public.park_public') is null then
    raise exception 'Prérequis manquant : parks / park_public — mauvais projet ?';
  end if;
  if not exists (select 1 from pg_proc where proname = 'nearby_parks' and pronamespace = 'public'::regnamespace) then
    raise exception 'Prérequis manquant : fonction nearby_parks (0017)';
  end if;
  if (select count(*) from pg_proc where proname = 'nearby_parks' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'Surcharge inattendue de nearby_parks';
  end if;
  if not exists (select 1 from pg_extension where extname = 'postgis' and extnamespace = 'public'::regnamespace) then
    raise exception 'PostGIS attendu dans le schéma public (search_path de la fonction)';
  end if;
end $$;

-- ───────────────────────── MIGRATION 0046 ─────────────────────────
-- ════════════════════════════════════════════════════════════════════════════
-- 0046 — `nearby_parks` : exécution sans balayage RLS (SECURITY DEFINER) +
--        pagination par curseur facultative (`nearby_parks_page`)
-- ────────────────────────────────────────────────────────────────────────────
-- PROBLÈME (mesuré sur STAGING, 85 814 parcs, rôle `anon`, EXPLAIN ANALYZE)
--   • candidats du rayon : Parallel Seq Scan de `parks` (84 331 lignes écartées,
--     6 431 pages) — 2 186 ms, contre 161 ms en index GiST pour le propriétaire ;
--   • enrichissement (`park_public`, ~20 sous-requêtes + `fstatus`/`fvalue`
--     par parc) : ×18 sous RLS (213 ms vs 12 ms pour 1 000 appels) ;
--   • bilan 20 km : 1,4 s (anon) vs 0,24 s (propriétaire) ; 1er appel à froid
--     de 4,6 s > `statement_timeout` d'`anon` (3 s) ⇒ SQLSTATE 57014 ⇒ HTTP 500.
-- CAUSE : sous RLS, PostgreSQL ne peut pousser dans l'index que des opérateurs
-- « leakproof » ; `ST_DWithin` / `&&` (geography) ne le sont pas, donc le
-- filtre spatial passe APRÈS la policy, ligne par ligne. Rendre PostGIS
-- leakproof exige un superuser (impossible sur Supabase hébergé). Réécrire les
-- policies (essai 0035/0036, hors dépôt) n'enlève pas la contrainte.
--
-- CORRECTIF : `nearby_parks` devient SECURITY DEFINER (propriétaire = rôle qui
-- possède `parks`, qui contourne la RLS faute de FORCE ROW LEVEL SECURITY), avec
-- `search_path` figé et EXECUTE limité à anon / authenticated / service_role.
--
-- ÉQUIVALENCE DE SÉCURITÉ (démontrée, pas supposée)
--   La fonction ne renvoie QUE des parcs `moderation_status = 'published'` et
--   non `permanently_closed` (filtre appliqué deux fois : candidats + sortie).
--   Pour un parc publié, la RLS ne masque rien à aucun rôle sur les tables lues
--   par `park_public` :
--     parks               parks_public_read : published                → visible
--     park_features/names/scores   park_is_visible(park_id) = published → visible
--     features, organization_parks  lecture publique (`true`)          → identique
--     park_media          approved OR own OR manages ; la vue filtre déjà
--                         `status = 'approved'` (cover_photo ET photos)  → identique
--   Donc résultat(définer) ≡ résultat(invoker) pour anon, authenticated,
--   gestionnaire et staff. Aucun parc pending / draft / rejected / blocked,
--   aucun média non approuvé, aucune donnée de parc non publié ne peut sortir.
--   Vérifié par supabase/tests/nearby_parks_definer.test.sql (comparaison
--   ligne à ligne avec l'ancienne définition, par rôle, avec fixtures).
--
-- CONTRAT CONSERVÉ : même signature `(double precision, double precision, int)`,
-- mêmes colonnes dans le même ordre ⇒ clients actuels (PROD) inchangés. Seuls
-- changements observables : tri déterministe `distance_m, id` (la pagination
-- `.range()` du client devient stable en cas d'égalité) et rayon plafonné à
-- 100 km (les clients demandent ≤ 20 km). `park_public`, les policies RLS et
-- les données ne sont PAS touchées. CREATE OR REPLACE uniquement (0 DROP).
--
-- `nearby_parks_page(...)` : NOUVELLE fonction (nom distinct ⇒ aucune
-- ambiguïté de surcharge PostgREST), pagination par curseur (distance_m, id) :
-- seules les lignes de la page sont enrichies. Facultative : non utilisée par le
-- client tant qu'il n'est pas mis à jour.
-- Indépendante de l'état antérieur (0017 PROD, ou variante CTE/policies scindées
-- vue sur STAGING) : elle redéfinit la fonction sans lire l'ancienne.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.nearby_parks(
  p_lat double precision, p_lng double precision, p_radius_m int default 20000
) returns table (
  id uuid, name text, description text, latitude numeric, longitude numeric,
  lat numeric, lng numeric,
  country_code char(2), timezone text, city text, address_line text,
  formatted_address text, commune_id uuid, organization_id uuid,
  min_age smallint, max_age smallint, age_min smallint, age_max smallint,
  moderation_status park_moderation_status, operational_status park_operational_status,
  verification_status verification_status, status park_moderation_status,
  rating numeric, review_count int, has_open_report boolean, views int,
  created_by uuid, created_at timestamptz, updated_at timestamptz,
  features jsonb, cover_photo text, photos text[], score numeric,
  surface text, play_equipment text[],
  wc boolean, shade boolean, fenced boolean, pmr boolean,
  benches boolean, water boolean, parking boolean,
  distance_m double precision
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- 1) Candidats : filtre sur `parks` seul (index GiST `parks_location_idx`).
  with candidates as materialized (
    select p.id,
           ST_Distance(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m
    from parks p
    where p.moderation_status = 'published'
      and p.operational_status <> 'permanently_closed'
      and ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
                     least(p_radius_m, 100000))
  )
  -- 2) Enrichissement des seuls candidats, jointure sur la clé primaire.
  select
    v.id, v.name, v.description, v.latitude, v.longitude, v.lat, v.lng,
    v.country_code, v.timezone, v.city, v.address_line,
    v.formatted_address, v.commune_id, v.organization_id,
    v.min_age, v.max_age, v.age_min, v.age_max,
    v.moderation_status, v.operational_status, v.verification_status, v.status,
    v.rating, v.review_count, v.has_open_report, v.views,
    v.created_by, v.created_at, v.updated_at,
    v.features, v.cover_photo, v.photos, v.score,
    v.surface, v.play_equipment,
    v.wc, v.shade, v.fenced, v.pmr, v.benches, v.water, v.parking,
    c.distance_m
  from candidates c
  join park_public v on v.id = c.id
  where v.moderation_status = 'published'                 -- défense en profondeur
    and v.operational_status <> 'permanently_closed'
  order by c.distance_m asc, c.id asc;
$$;

create or replace function public.nearby_parks_page(
  p_lat double precision, p_lng double precision, p_radius_m int default 20000,
  p_limit int default 500,
  p_after_distance double precision default null,
  p_after_id uuid default null
) returns table (
  id uuid, name text, description text, latitude numeric, longitude numeric,
  lat numeric, lng numeric,
  country_code char(2), timezone text, city text, address_line text,
  formatted_address text, commune_id uuid, organization_id uuid,
  min_age smallint, max_age smallint, age_min smallint, age_max smallint,
  moderation_status park_moderation_status, operational_status park_operational_status,
  verification_status verification_status, status park_moderation_status,
  rating numeric, review_count int, has_open_report boolean, views int,
  created_by uuid, created_at timestamptz, updated_at timestamptz,
  features jsonb, cover_photo text, photos text[], score numeric,
  surface text, play_equipment text[],
  wc boolean, shade boolean, fenced boolean, pmr boolean,
  benches boolean, water boolean, parking boolean,
  distance_m double precision
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Curseur : (distance_m, id) de la dernière ligne reçue ; page suivante =
  -- lignes strictement après ce couple. Sans curseur : première page.
  -- p_limit borné à [1, 1000] (= max_rows PostgREST).
  with page as materialized (
    select p.id,
           ST_Distance(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m
    from parks p
    where p.moderation_status = 'published'
      and p.operational_status <> 'permanently_closed'
      and ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
                     least(p_radius_m, 100000))
  ),
  limited as materialized (
    select pg.id, pg.distance_m
    from page pg
    where p_after_distance is null
       or (pg.distance_m, pg.id) > (p_after_distance,
                                    coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
    order by pg.distance_m asc, pg.id asc
    limit greatest(1, least(coalesce(p_limit, 500), 1000))
  )
  select
    v.id, v.name, v.description, v.latitude, v.longitude, v.lat, v.lng,
    v.country_code, v.timezone, v.city, v.address_line,
    v.formatted_address, v.commune_id, v.organization_id,
    v.min_age, v.max_age, v.age_min, v.age_max,
    v.moderation_status, v.operational_status, v.verification_status, v.status,
    v.rating, v.review_count, v.has_open_report, v.views,
    v.created_by, v.created_at, v.updated_at,
    v.features, v.cover_photo, v.photos, v.score,
    v.surface, v.play_equipment,
    v.wc, v.shade, v.fenced, v.pmr, v.benches, v.water, v.parking,
    l.distance_m
  from limited l
  join park_public v on v.id = l.id
  where v.moderation_status = 'published'
    and v.operational_status <> 'permanently_closed'
  order by l.distance_m asc, l.id asc;
$$;

-- ── Droits : jamais PUBLIC ; uniquement les rôles API ───────────────────────
revoke all on function public.nearby_parks(double precision, double precision, int)
  from public, anon, authenticated;
grant execute on function public.nearby_parks(double precision, double precision, int)
  to anon, authenticated, service_role;

revoke all on function public.nearby_parks_page(double precision, double precision, int, int, double precision, uuid)
  from public, anon, authenticated;
grant execute on function public.nearby_parks_page(double precision, double precision, int, int, double precision, uuid)
  to anon, authenticated, service_role;

-- ── Assertions structurelles (échec ⇒ transaction annulée) ──────────────────
do $$
declare
  fn text;
  r record;
  parks_owner name;
begin
  select pg_get_userbyid(relowner) into parks_owner from pg_class where oid = 'public.parks'::regclass;
  if (select relforcerowsecurity from pg_class where oid = 'public.parks'::regclass) then
    raise exception '0046: parks est en FORCE ROW LEVEL SECURITY — le propriétaire ne contournerait plus la RLS';
  end if;

  foreach fn in array array[
    'public.nearby_parks(double precision,double precision,int)',
    'public.nearby_parks_page(double precision,double precision,int,int,double precision,uuid)'
  ] loop
    select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner,
           has_function_privilege('anon', p.oid, 'execute') as a,
           has_function_privilege('authenticated', p.oid, 'execute') as au,
           has_function_privilege('service_role', p.oid, 'execute') as sr,
           coalesce((select bool_or(acl.grantee = 0) from aclexplode(p.proacl) acl), false) as public_exec
      into r
      from pg_proc p where p.oid = fn::regprocedure;
    if not r.prosecdef then raise exception '0046: % doit être SECURITY DEFINER', fn; end if;
    if r.proconfig is null or not (r.proconfig @> array['search_path=public, pg_temp']) then
      raise exception '0046: % sans search_path figé (public, pg_temp)', fn;
    end if;
    if r.owner <> parks_owner then
      raise exception '0046: % appartient à % (attendu : propriétaire de parks = %)', fn, r.owner, parks_owner;
    end if;
    if r.public_exec then raise exception '0046: % exécutable par PUBLIC', fn; end if;
    if not (r.a and r.au and r.sr) then raise exception '0046: % — EXECUTE manquant (anon/authenticated/service_role)', fn; end if;
  end loop;

  if (select count(*) from pg_proc where proname = 'nearby_parks' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception '0046: surcharge inattendue de nearby_parks';
  end if;

  raise notice '0046 OK — nearby_parks + nearby_parks_page : SECURITY DEFINER, search_path figé, EXECUTE anon/authenticated/service_role uniquement';
end $$;

-- ───────────────────── FIN MIGRATION 0046 ─────────────────────

-- Enregistrement dans le suivi Supabase (dans la même transaction).
insert into supabase_migrations.schema_migrations (version, name)
values ('0046', 'nearby_parks_definer')
on conflict (version) do nothing;

commit;
