-- ════════════════════════════════════════════════════════════════════════════
-- PRÉLUDE DE TEST — reproduit l'état « dérivé » observé sur STAGING (hors dépôt,
-- 0035/0036 appliquées à la main) AVANT la migration 0046 :
--   • `nearby_parks` en variante CTE `candidates` (SECURITY INVOKER) ;
--   • policies `parks` scindées : parks_public_read (published, tous rôles) +
--     parks_extended_read (authenticated, EXISTS inline).
-- Sert à prouver que 0046 produit le même résultat sécurisé quel que soit
-- l'état antérieur (PROD = 0017 + policy unique ; STAGING = variante ci-dessous).
-- USAGE : voir l'en-tête de nearby_parks_definer.test.sql (à placer AVANT la migration).
-- ════════════════════════════════════════════════════════════════════════════
drop policy if exists parks_public_read on public.parks;
drop policy if exists parks_extended_read on public.parks;
create policy parks_public_read on public.parks for select using (moderation_status = 'published'::park_moderation_status);
create policy parks_extended_read on public.parks for select to authenticated using (
  created_by = auth.uid()
  or exists (select 1 from organization_parks op join team_members tm on tm.organization_id = op.organization_id
             where op.park_id = parks.id and tm.user_id = auth.uid())
  or (commune_id is not null and exists (select 1 from team_members tm2 where tm2.user_id = auth.uid() and tm2.commune_id = parks.commune_id))
  or exists (select 1 from team_members tm3 where tm3.user_id = auth.uid() and tm3.organization_id is null)
);

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
) language sql stable as $$
  with candidates as materialized (
    select p.id, ST_Distance(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m
    from parks p
    where p.moderation_status = 'published' and p.operational_status <> 'permanently_closed'
      and ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  )
  select v.id, v.name, v.description, v.latitude, v.longitude, v.lat, v.lng,
    v.country_code, v.timezone, v.city, v.address_line, v.formatted_address, v.commune_id, v.organization_id,
    v.min_age, v.max_age, v.age_min, v.age_max, v.moderation_status, v.operational_status, v.verification_status, v.status,
    v.rating, v.review_count, v.has_open_report, v.views, v.created_by, v.created_at, v.updated_at,
    v.features, v.cover_photo, v.photos, v.score, v.surface, v.play_equipment,
    v.wc, v.shade, v.fenced, v.pmr, v.benches, v.water, v.parking, c.distance_m
  from candidates c join park_public v on v.id = c.id
  order by c.distance_m asc;
$$;
