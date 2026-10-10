-- ════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE PRODUCTION de 0046 — restaure `nearby_parks` EXACTEMENT comme
-- sauvegardé avant migration (md5 f70a2d121f7a6379b772fd0fb3db68cf, SECURITY INVOKER,
-- sans search_path figé, propriétaire postgres) avec ses droits d'origine
-- (ACL : =X/postgres, postgres, anon, authenticated, service_role), supprime
-- `nearby_parks_page` et retire 0046 du suivi Supabase.
-- À coller dans le SQL Editor PRODUCTION, en une fois (transaction unique).
-- NB : l'état d'origine donnait EXECUTE à PUBLIC ; ce retour arrière le rétablit
-- à l'identique (la migration 0046 le révoquait). Pour un retour arrière SANS
-- PUBLIC, supprimer la ligne `grant execute ... to public` ci-dessous.
-- ════════════════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '0046') then
    raise exception 'Retour arrière : 0046 non enregistrée sur ce projet — ARRÊT';
  end if;
end $$;

-- Définition d'origine (pg_get_functiondef sauvegardé avant migration).
CREATE OR REPLACE FUNCTION public.nearby_parks(p_lat double precision, p_lng double precision, p_radius_m integer DEFAULT 20000)
 RETURNS TABLE(id uuid, name text, description text, latitude numeric, longitude numeric, lat numeric, lng numeric, country_code character, timezone text, city text, address_line text, formatted_address text, commune_id uuid, organization_id uuid, min_age smallint, max_age smallint, age_min smallint, age_max smallint, moderation_status park_moderation_status, operational_status park_operational_status, verification_status verification_status, status park_moderation_status, rating numeric, review_count integer, has_open_report boolean, views integer, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, features jsonb, cover_photo text, photos text[], score numeric, surface text, play_equipment text[], wc boolean, shade boolean, fenced boolean, pmr boolean, benches boolean, water boolean, parking boolean, distance_m double precision)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$;

revoke all on function public.nearby_parks(double precision, double precision, integer) from public, anon, authenticated, service_role;
grant execute on function public.nearby_parks(double precision, double precision, integer) to public, anon, authenticated, service_role;

drop function if exists public.nearby_parks_page(double precision, double precision, integer, integer, double precision, uuid);

delete from supabase_migrations.schema_migrations where version = '0046';

-- Vérification : retour exact à l'état d'origine.
do $$
begin
  if (select md5(pg_get_functiondef(p.oid)) from pg_proc p
        where p.proname = 'nearby_parks' and p.pronamespace = 'public'::regnamespace) <> 'f70a2d121f7a6379b772fd0fb3db68cf' then
    raise exception 'Retour arrière : empreinte ≠ f70a2d121f7a6379b772fd0fb3db68cf — transaction annulée';
  end if;
end $$;

commit;
