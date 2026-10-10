-- ════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE de 0046 — restaure `nearby_parks` tel que défini en 0017
-- (SECURITY INVOKER, sans search_path figé) et supprime `nearby_parks_page`.
-- À coller dans le SQL Editor Supabase, en une fois (transaction).
-- Après retour arrière : lecture `anon` de nouveau soumise à la RLS (plus lente
-- sur gros volumes, mais sémantiquement identique — voir 0046 / test).
-- ════════════════════════════════════════════════════════════════════════════
begin;

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
) as $$
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
    ST_Distance(v.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m
  from park_public v
  where v.moderation_status = 'published'
    and v.operational_status <> 'permanently_closed'
    and ST_DWithin(v.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by distance_m asc;
$$ language sql stable;

revoke all on function public.nearby_parks(double precision, double precision, int) from public, anon, authenticated;
grant execute on function public.nearby_parks(double precision, double precision, int) to anon, authenticated, service_role;

drop function if exists public.nearby_parks_page(double precision, double precision, int, int, double precision, uuid);

delete from supabase_migrations.schema_migrations where version = '0046';

commit;
