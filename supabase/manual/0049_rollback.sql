-- ════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE de 0049 — restaure `park_public` d'origine (md5 fae08d091ae8a59acd7f4de48af8b5f8) et supprime
-- `us_state_abbr`. UNE transaction, SQL Editor. Les adresses FR/ES n'ont jamais changé.
-- ════════════════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '0049') then
    raise exception 'Retour arrière : 0049 non enregistrée — ARRÊT';
  end if;
end $$;

create or replace view public.park_public with (security_invoker = true) as
SELECT id,
    name,
    slug,
    description,
    latitude,
    longitude,
    boundary,
    location,
    country_code,
    timezone,
    address_line,
    postal_code,
    city,
    admin_area_1,
    admin_area_2,
    min_age,
    max_age,
    ages_derived,
    moderation_status,
    operational_status,
    status_reason,
    status_from,
    status_until,
    verification_status,
    created_by,
    rating,
    review_count,
    has_open_report,
    views,
    created_at,
    updated_at,
    last_verified_at,
    COALESCE(( SELECT jsonb_object_agg(f.code, jsonb_build_object('status', pf.status, 'value', pf.value, 'quantity', pf.quantity, 'category', f.category, 'verified_at', pf.verified_at)) AS jsonb_object_agg
           FROM park_features pf
             JOIN features f ON f.id = pf.feature_id
          WHERE pf.park_id = p.id), '{}'::jsonb) AS features,
    ( SELECT m.url
           FROM park_media m
          WHERE m.park_id = p.id AND m.status = 'approved'::media_status
          ORDER BY m.is_cover DESC, m.created_at
         LIMIT 1) AS cover_photo,
    COALESCE(( SELECT array_agg(m.url ORDER BY m.is_cover DESC, m.created_at) AS array_agg
           FROM park_media m
          WHERE m.park_id = p.id AND m.status = 'approved'::media_status), '{}'::text[]) AS photos,
    COALESCE(( SELECT array_agg(pn.name) AS array_agg
           FROM park_names pn
          WHERE pn.park_id = p.id), '{}'::text[]) AS translated_names,
    ( SELECT s.overall_score
           FROM park_scores s
          WHERE s.park_id = p.id
          ORDER BY s.calculated_at DESC
         LIMIT 1) AS score,
    COALESCE(( SELECT s.overall_score IS NOT NULL
           FROM park_scores s
          WHERE s.park_id = p.id
          ORDER BY s.calculated_at DESC
         LIMIT 1), false) AS has_score,
    latitude AS lat,
    longitude AS lng,
    min_age AS age_min,
    max_age AS age_max,
    moderation_status AS status,
    NULLIF(concat_ws(', '::text, address_line, NULLIF(TRIM(BOTH FROM concat_ws(' '::text, postal_code, city)), ''::text)), ''::text) AS formatted_address,
    ( SELECT op.organization_id
           FROM organization_parks op
          WHERE op.park_id = p.id
          ORDER BY op.role
         LIMIT 1) AS commune_id,
    ( SELECT op.organization_id
           FROM organization_parks op
          WHERE op.park_id = p.id
          ORDER BY op.role
         LIMIT 1) AS organization_id,
    fstatus(id, 'toilets'::text) = 'available'::text AS wc,
    fvalue(id, 'shade_level'::text) = ANY (ARRAY['partial'::text, 'mostly_shaded'::text, 'fully_shaded'::text]) AS shade,
    fvalue(id, 'fence_status'::text) = ANY (ARRAY['fully_fenced'::text, 'partially_fenced'::text]) AS fenced,
    fstatus(id, 'wheelchair_access'::text) = 'available'::text AS pmr,
    fstatus(id, 'benches'::text) = 'available'::text AS benches,
    fstatus(id, 'drinking_water'::text) = 'available'::text AS water,
    fstatus(id, 'parking'::text) = 'available'::text AS parking,
        CASE fvalue(id, 'surface_type'::text)
            WHEN 'sand'::text THEN 'sable'::text
            WHEN 'grass'::text THEN 'gazon'::text
            WHEN 'rubber'::text THEN 'sol_souple'::text
            WHEN 'wood_chips'::text THEN 'sol_souple'::text
            ELSE 'non_precise'::text
        END AS surface,
    COALESCE(( SELECT array_agg(
                CASE f.code
                    WHEN 'slide'::text THEN 'toboggan'::text
                    WHEN 'springer'::text THEN 'springs'::text
                    WHEN 'water_play'::text THEN 'waterplay'::text
                    WHEN 'motor_course'::text THEN 'motorcourse'::text
                    ELSE f.code
                END ORDER BY f.sort_order) AS array_agg
           FROM park_features pf
             JOIN features f ON f.id = pf.feature_id
          WHERE pf.park_id = p.id AND f.category = 'play'::feature_category AND pf.status = 'available'::feature_status), '{}'::text[]) AS play_equipment
   FROM parks p;

drop function if exists public.us_state_abbr(text);
delete from supabase_migrations.schema_migrations where version = '0049';

do $$
begin
  if md5(pg_get_viewdef('public.park_public'::regclass, true)) <> 'fae08d091ae8a59acd7f4de48af8b5f8' then
    raise exception 'Retour arrière : park_public ≠ définition d''origine — transaction annulée';
  end if;
end $$;

commit;
