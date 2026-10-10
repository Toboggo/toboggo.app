-- ════════════════════════════════════════════════════════════════════════════
-- APPLICATION MANUELLE DE 0049 — SQL Editor Supabase, UNE transaction.
-- ORDRE : STAGING d'abord ; PRODUCTION seulement après accord explicite et validation.
-- Prérequis : park_public d'origine (md5 fae08d091ae8a59acd7f4de48af8b5f8) ou déjà migrée.
-- Retour arrière : supabase/manual/0049_rollback.sql.
-- ════════════════════════════════════════════════════════════════════════════
begin;

do $$
declare m text := md5(pg_get_viewdef('public.park_public'::regclass, true));
begin
  if to_regclass('public.park_public') is null or to_regclass('public.parks') is null then
    raise exception 'Prérequis manquant : parks / park_public — mauvais projet ?';
  end if;
  if m <> 'fae08d091ae8a59acd7f4de48af8b5f8' and position('us_state_abbr' in pg_get_viewdef('public.park_public'::regclass, true)) = 0 then
    raise exception 'park_public inattendue (md5 %) — ARRÊT, rien n''est modifié', m;
  end if;
  if not exists (select 1 from pg_proc where proname = 'nearby_parks' and pronamespace = 'public'::regnamespace) then
    raise exception 'Prérequis manquant : nearby_parks';
  end if;
end $$;

-- ───────────────────────── MIGRATION 0049 ─────────────────────────
-- ════════════════════════════════════════════════════════════════════════════
-- 0049 — `park_public.formatted_address` : format d'adresse US (« 123 W 42nd St,
--        New York, NY 10036 ») ; FR/ES strictement inchangés
-- ────────────────────────────────────────────────────────────────────────────
-- PRÉPARÉE, NON APPLIQUÉE (aucun environnement). Voir
-- docs/operations/us-address-and-ny-import.md pour l'ordre de déploiement.
--
-- CONTEXTE : la vue calculait `formatted_address` à la française
-- (`address_line, <CP> <ville>`) pour TOUS les pays — « 10036 New York », sans
-- État. Aux États-Unis l'usage est « rue, ville, ÉTAT ZIP ».
--
-- CHANGEMENT (additif, réversible) :
--   • fonction `us_state_abbr(text)` : « New York » → « NY » (immutable ; valeur
--     non reconnue renvoyée telle quelle, jamais d'abréviation inventée) ;
--   • `park_public` : `formatted_address` devient
--       country_code = 'US' → address_line, ville, « <ÉTAT> <ZIP> » (pièces
--                             absentes omises, jamais inventées)
--       sinon               → formule d'origine, À L'IDENTIQUE (FR/ES inchangés).
--   La liste de colonnes, leurs types, `security_invoker` et les droits de la vue
--   sont inchangés ; `nearby_parks*` (0046) lisent la vue et en héritent.
--   Le quartier (`neighbourhood`) n'a pas de colonne `parks` : il est conservé dans la
--   provenance (park_attribute_sources) par le backfill US — décision de schéma
--   séparée si un affichage « quartier » est souhaité.
--
-- PRÉCONDITION : la vue doit avoir la définition attendue (formule d'origine) ou
-- déjà celle-ci (ré-exécution idempotente) ; sinon la migration s'arrête.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.us_state_abbr(p_state text) returns text
language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_state is null or btrim(p_state) = '' then null
    else coalesce(
      (select t.code
         from (values
    ('AL', 'Alabama'),
    ('AK', 'Alaska'),
    ('AZ', 'Arizona'),
    ('AR', 'Arkansas'),
    ('CA', 'California'),
    ('CO', 'Colorado'),
    ('CT', 'Connecticut'),
    ('DE', 'Delaware'),
    ('DC', 'District of Columbia'),
    ('FL', 'Florida'),
    ('GA', 'Georgia'),
    ('HI', 'Hawaii'),
    ('ID', 'Idaho'),
    ('IL', 'Illinois'),
    ('IN', 'Indiana'),
    ('IA', 'Iowa'),
    ('KS', 'Kansas'),
    ('KY', 'Kentucky'),
    ('LA', 'Louisiana'),
    ('ME', 'Maine'),
    ('MD', 'Maryland'),
    ('MA', 'Massachusetts'),
    ('MI', 'Michigan'),
    ('MN', 'Minnesota'),
    ('MS', 'Mississippi'),
    ('MO', 'Missouri'),
    ('MT', 'Montana'),
    ('NE', 'Nebraska'),
    ('NV', 'Nevada'),
    ('NH', 'New Hampshire'),
    ('NJ', 'New Jersey'),
    ('NM', 'New Mexico'),
    ('NY', 'New York'),
    ('NC', 'North Carolina'),
    ('ND', 'North Dakota'),
    ('OH', 'Ohio'),
    ('OK', 'Oklahoma'),
    ('OR', 'Oregon'),
    ('PA', 'Pennsylvania'),
    ('RI', 'Rhode Island'),
    ('SC', 'South Carolina'),
    ('SD', 'South Dakota'),
    ('TN', 'Tennessee'),
    ('TX', 'Texas'),
    ('UT', 'Utah'),
    ('VT', 'Vermont'),
    ('VA', 'Virginia'),
    ('WA', 'Washington'),
    ('WV', 'West Virginia'),
    ('WI', 'Wisconsin'),
    ('WY', 'Wyoming'),
    ('PR', 'Puerto Rico'),
    ('GU', 'Guam'),
    ('AS', 'American Samoa'),
    ('VI', 'U.S. Virgin Islands'),
    ('MP', 'Northern Mariana Islands'),
    ('VI', 'United States Virgin Islands')
         ) as t(code, name)
        where upper(btrim(p_state)) = t.code or lower(btrim(p_state)) = lower(t.name)
        limit 1),
      btrim(p_state))
  end
$$;

revoke all on function public.us_state_abbr(text) from public, anon, authenticated;
grant execute on function public.us_state_abbr(text) to anon, authenticated, service_role;

do $$
declare
  d text := pg_get_viewdef('public.park_public'::regclass, true);
begin
  if position('us_state_abbr' in d) = 0
     and position($q$NULLIF(concat_ws(', '::text, address_line, NULLIF(TRIM(BOTH FROM concat_ws(' '::text, postal_code, city)), ''::text)), ''::text) AS formatted_address$q$ in d) = 0 then
    raise exception '0049: définition de park_public inattendue (formatted_address) — arrêt, rien n''est modifié';
  end if;
end $$;

-- Colonnes de la vue avant remplacement (comparées après : liste, ordre et types identiques).
drop table if exists pg_temp._park_public_cols_0049;
create temporary table _park_public_cols_0049 on commit drop as
  select a.attnum, a.attname::text as attname, format_type(a.atttypid, a.atttypmod) as typ
    from pg_attribute a where a.attrelid = 'public.park_public'::regclass and a.attnum > 0 and not a.attisdropped;

-- Propriétaire, droits, options et commentaire PROPRES À L'ENVIRONNEMENT, comparés après.
drop table if exists pg_temp._park_public_meta_0049;
create temporary table _park_public_meta_0049 on commit drop as
  select c.relowner::regrole::text as owner, coalesce(c.relacl::text, '') as acl,
         coalesce(c.reloptions::text, '') as opts, coalesce(obj_description(c.oid, 'pg_class'), '') as cmt
    from pg_class c where c.oid = 'public.park_public'::regclass;

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
    CASE
        WHEN country_code = 'US' THEN NULLIF(concat_ws(', '::text, NULLIF(address_line, ''::text), NULLIF(city, ''::text), NULLIF(TRIM(BOTH FROM concat_ws(' '::text, us_state_abbr(admin_area_1), postal_code)), ''::text)), ''::text)
        ELSE NULLIF(concat_ws(', '::text, address_line, NULLIF(TRIM(BOTH FROM concat_ws(' '::text, postal_code, city)), ''::text)), ''::text)
    END AS formatted_address,
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

do $$
declare n_before int; n_diff int;
begin
  select count(*) into n_before from _park_public_cols_0049;
  select count(*) into n_diff from (
    select a.attnum, a.attname::text, format_type(a.atttypid, a.atttypmod)
      from pg_attribute a where a.attrelid = 'public.park_public'::regclass and a.attnum > 0 and not a.attisdropped
    except
    select attnum, attname, typ from _park_public_cols_0049) x;
  if n_diff <> 0 or (select count(*) from pg_attribute a where a.attrelid = 'public.park_public'::regclass and a.attnum > 0 and not a.attisdropped) <> n_before then
    raise exception '0049: la liste de colonnes de park_public a changé';
  end if;
  if (select reloptions::text from pg_class where oid = 'public.park_public'::regclass) is distinct from '{security_invoker=true}' then
    raise exception '0049: security_invoker perdu sur park_public';
  end if;
  if not (has_table_privilege('anon', 'public.park_public', 'select') and has_table_privilege('authenticated', 'public.park_public', 'select')) then
    raise exception '0049: droits SELECT de park_public perdus';
  end if;
  if exists (
    select 1 from pg_class c, _park_public_meta_0049 m
     where c.oid = 'public.park_public'::regclass
       and (c.relowner::regrole::text, coalesce(c.relacl::text, ''), coalesce(c.reloptions::text, ''), coalesce(obj_description(c.oid, 'pg_class'), ''))
           is distinct from (m.owner, m.acl, m.opts, m.cmt)) then
    raise exception '0049: propriétaire, droits, options ou commentaire de park_public modifiés';
  end if;
  raise notice '0049 OK — park_public : % colonnes inchangées, formatted_address country-aware (US) ; us_state_abbr créée', n_before;
end $$;

-- ───────────────────── FIN MIGRATION 0049 ─────────────────────

insert into supabase_migrations.schema_migrations (version, name)
values ('0049', 'formatted_address_us')
on conflict (version) do nothing;

commit;
