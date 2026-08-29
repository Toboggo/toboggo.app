-- ════════════════════════════════════════════════════════════════════════════
-- 0017 — Fonctions, triggers, vue `park_public`, RPC v2
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF sur les DONNÉES. Un seul DROP, sur une FONCTION (pas une
-- table/colonne) : `nearby_parks` — voir la note "STRATÉGIE" plus bas.
--
-- STRATÉGIE nearby_parks :
--   La fonction V1 `nearby_parks(double precision, double precision, int)`
--   renvoie la forme plate V1. La v2 garde la MÊME signature d'arguments mais
--   change le TYPE DE RETOUR (table(...) élargie). PostgreSQL interdit
--   `CREATE OR REPLACE FUNCTION` quand le type de retour change -> il faut
--   `DROP FUNCTION` puis `CREATE`. Le DROP + CREATE est atomique dans la
--   transaction de la migration. Impact : la RPC `nearby_parks` renvoie
--   désormais la forme v2 attendue par le front v2 (le front V1 est mort).
--   Aucune donnée touchée.
--
-- `park_public` : la vue v2 d'origine (migrations-v2-draft) fait `select p.*`.
--   Impossible pendant la coexistence : `parks` porte encore les colonnes V1
--   (status, lat, lng, wc, ...) qui entreraient en collision avec les alias de
--   compat de la vue. -> DÉVIATION assumée : liste EXPLICITE des colonnes
--   canoniques de `parks`. Reviendra éventuellement à `p.*` au futur 0020.
-- ════════════════════════════════════════════════════════════════════════════

-- ── updated_at : triggers pour les nouvelles tables ────────────────────
-- touch_updated_at() existe déjà (V1 0001).
drop trigger if exists organizations_touch on organizations;
create trigger organizations_touch before update on organizations
  for each row execute function touch_updated_at();
drop trigger if exists park_zones_touch on park_zones;
create trigger park_zones_touch before update on park_zones
  for each row execute function touch_updated_at();
drop trigger if exists park_features_touch on park_features;
create trigger park_features_touch before update on park_features
  for each row execute function touch_updated_at();
drop trigger if exists park_equipment_touch on park_equipment;
create trigger park_equipment_touch before update on park_equipment
  for each row execute function touch_updated_at();
drop trigger if exists park_opening_hours_touch on park_opening_hours;
create trigger park_opening_hours_touch before update on park_opening_hours
  for each row execute function touch_updated_at();

-- ── rating / review_count : version v2 (lit reviews.rating + status) ───
create or replace function recompute_park_rating() returns trigger as $$
declare pid uuid := coalesce(new.park_id, old.park_id);
begin
  update parks set
    rating = coalesce((select round(avg(rating)::numeric, 1) from reviews
                       where park_id = pid and status = 'published'), 0),
    review_count = (select count(*) from reviews
                    where park_id = pid and status = 'published')
  where id = pid;
  return null;
end $$ language plpgsql security definer set search_path = public, pg_temp;
-- trigger `reviews_after_change` existe déjà (V1) et appelle cette fonction.

-- ── has_open_report : version v2 (open + in_progress) ─────────────────
create or replace function recompute_park_open_report() returns trigger as $$
declare pid uuid := coalesce(new.park_id, old.park_id);
begin
  update parks set has_open_report = exists (
    select 1 from reports where park_id = pid and status in ('open','in_progress')
  ) where id = pid;
  return null;
end $$ language plpgsql security definer set search_path = public, pg_temp;
-- trigger `reports_after_change` existe déjà (V1) et appelle cette fonction.

-- ── §2 §6 min_age / max_age dérivés des zones ─────────────────────────
create or replace function recompute_park_ages() returns trigger as $$
declare pid uuid := coalesce(new.park_id, old.park_id);
begin
  update parks p set min_age = z.min_age, max_age = z.max_age
  from (select min(min_age) as min_age, max(max_age) as max_age
        from park_zones where park_id = pid) z
  where p.id = pid and p.ages_derived
    and (z.min_age is not null or z.max_age is not null);
  return null;
end $$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists park_zones_after_change on park_zones;
create trigger park_zones_after_change
  after insert or update or delete on park_zones
  for each row execute function recompute_park_ages();

-- ── §14 audit trigger générique ──────────────────────────────────────
create or replace function audit_row() returns trigger as $$
declare actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into audit_log (entity_type, entity_id, action, new_value, actor_id)
    values (tg_table_name, new.id, 'insert', to_jsonb(new), actor);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (entity_type, entity_id, action, old_value, new_value, actor_id)
    values (tg_table_name, new.id, 'update', to_jsonb(old), to_jsonb(new), actor);
    return new;
  else
    insert into audit_log (entity_type, entity_id, action, old_value, actor_id)
    values (tg_table_name, old.id, 'delete', to_jsonb(old), actor);
    return old;
  end if;
end $$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists parks_audit_ins on parks;
create trigger parks_audit_ins after insert on parks for each row execute function audit_row();
drop trigger if exists parks_audit_del on parks;
create trigger parks_audit_del after delete on parks for each row execute function audit_row();
drop trigger if exists parks_audit_upd on parks;
create trigger parks_audit_upd after update on parks
  for each row when (
    old.name is distinct from new.name
    or old.description is distinct from new.description
    or old.latitude is distinct from new.latitude
    or old.longitude is distinct from new.longitude
    or old.country_code is distinct from new.country_code
    or old.moderation_status is distinct from new.moderation_status
    or old.operational_status is distinct from new.operational_status
    or old.verification_status is distinct from new.verification_status
    or old.min_age is distinct from new.min_age
    or old.max_age is distinct from new.max_age
  ) execute function audit_row();

drop trigger if exists park_equipment_audit on park_equipment;
create trigger park_equipment_audit after insert or update or delete on park_equipment
  for each row execute function audit_row();
drop trigger if exists reports_audit on reports;
create trigger reports_audit after insert or update or delete on reports
  for each row execute function audit_row();
drop trigger if exists organizations_audit on organizations;
create trigger organizations_audit after insert or update or delete on organizations
  for each row execute function audit_row();
drop trigger if exists park_edits_audit on park_edits;
create trigger park_edits_audit after insert or update or delete on park_edits
  for each row execute function audit_row();

-- ── Accesseurs feature (projection compat de la vue) ──────────────────
create or replace function fstatus(p_park_id uuid, p_code text) returns text as $$
  select pf.status::text from park_features pf join features f on f.id = pf.feature_id
  where pf.park_id = p_park_id and f.code = p_code;
$$ language sql stable;

create or replace function fvalue(p_park_id uuid, p_code text) returns text as $$
  select pf.value from park_features pf join features f on f.id = pf.feature_id
  where pf.park_id = p_park_id and f.code = p_code;
$$ language sql stable;

-- ── Vue publique aplatie + projection compat ─────────────────────────
-- DÉVIATION : liste explicite (pas `p.*`) — cf. note en tête de fichier.
create or replace view park_public
with (security_invoker = true) as
select
  p.id, p.name, p.slug, p.description,
  p.latitude, p.longitude, p.boundary, p.location,
  p.country_code, p.timezone,
  p.address_line, p.postal_code, p.city, p.admin_area_1, p.admin_area_2,
  p.min_age, p.max_age, p.ages_derived,
  p.moderation_status, p.operational_status,
  p.status_reason, p.status_from, p.status_until,
  p.verification_status, p.created_by,
  p.rating, p.review_count, p.has_open_report, p.views,
  p.created_at, p.updated_at, p.last_verified_at,

  coalesce(
    (select jsonb_object_agg(f.code, jsonb_build_object(
        'status', pf.status, 'value', pf.value, 'quantity', pf.quantity,
        'category', f.category, 'verified_at', pf.verified_at))
     from park_features pf join features f on f.id = pf.feature_id
     where pf.park_id = p.id),
    '{}'::jsonb
  ) as features,
  (select m.url from park_media m
    where m.park_id = p.id and m.status = 'approved'
    order by m.is_cover desc, m.created_at asc limit 1) as cover_photo,
  coalesce(
    (select array_agg(m.url order by m.is_cover desc, m.created_at asc)
     from park_media m where m.park_id = p.id and m.status = 'approved'),
    '{}'::text[]
  ) as photos,
  coalesce((select array_agg(pn.name) from park_names pn where pn.park_id = p.id), '{}'::text[]) as translated_names,
  (select s.overall_score from park_scores s
    where s.park_id = p.id order by s.calculated_at desc limit 1) as score,
  coalesce(
    (select overall_score is not null from park_scores s
      where s.park_id = p.id order by s.calculated_at desc limit 1),
    false) as has_score,

  -- ── Projection compat (dérivée, jamais stockée) ──
  p.latitude  as lat,
  p.longitude as lng,
  p.min_age   as age_min,
  p.max_age   as age_max,
  p.moderation_status as status,
  nullif(concat_ws(', ', p.address_line, nullif(trim(concat_ws(' ', p.postal_code, p.city)), '')), '') as formatted_address,
  (select op.organization_id from organization_parks op
    where op.park_id = p.id order by op.role limit 1) as commune_id,
  (select op.organization_id from organization_parks op
    where op.park_id = p.id order by op.role limit 1) as organization_id,
  fstatus(p.id, 'toilets') = 'available' as wc,
  fvalue(p.id, 'shade_level') in ('partial', 'mostly_shaded', 'fully_shaded') as shade,
  fvalue(p.id, 'fence_status') in ('fully_fenced', 'partially_fenced') as fenced,
  fstatus(p.id, 'wheelchair_access') = 'available' as pmr,
  fstatus(p.id, 'benches') = 'available' as benches,
  (fstatus(p.id, 'drinking_water') = 'available' or fstatus(p.id, 'water_play') = 'available') as water,
  fstatus(p.id, 'parking') = 'available' as parking,
  case fvalue(p.id, 'surface_type')
    when 'sand' then 'sable' when 'grass' then 'gazon'
    when 'rubber' then 'sol_souple' when 'wood_chips' then 'sol_souple'
    else 'non_precise' end as surface,
  coalesce((
    select array_agg(
      case f.code
        when 'slide' then 'toboggan' when 'springer' then 'springs'
        when 'water_play' then 'waterplay' when 'motor_course' then 'motorcourse'
        else f.code end order by f.sort_order)
    from park_features pf join features f on f.id = pf.feature_id
    where pf.park_id = p.id and f.category = 'play' and pf.status = 'available'
  ), '{}'::text[]) as play_equipment
from parks p;

-- ── §1 §7 nearby_parks — DROP V1 puis CREATE v2 (type de retour élargi) ──
drop function if exists nearby_parks(double precision, double precision, int);
create function nearby_parks(
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

-- ── increment_park_views — SECURITY DEFINER nécessaire (anon incrémente
--    un compteur sans avoir l'UPDATE sur parks). Portée minimale : +1 vue.
create or replace function increment_park_views(p_park_id uuid) returns void as $$
  update parks set views = views + 1 where id = p_park_id;
$$ language sql security definer set search_path = public, pg_temp;

-- ── §11 find_duplicate_parks (nouveau) ──────────────────────────────
create or replace function find_duplicate_parks(
  p_lat double precision, p_lng double precision, p_name text,
  p_radius_m int default 200, p_exclude uuid default null
) returns table (
  park_id uuid, name text, distance_m double precision,
  name_similarity real, score numeric
) as $$
  select p.id, p.name,
    ST_Distance(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m,
    similarity(p.name, coalesce(p_name, '')) as name_similarity,
    round((
      greatest(0, 1 - ST_Distance(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / p_radius_m) * 0.6
      + similarity(p.name, coalesce(p_name, '')) * 0.4
    )::numeric, 3) as score
  from parks p
  where (p_exclude is null or p.id <> p_exclude)
    and ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by score desc;
$$ language sql stable;

-- ── §16 recalculate_park_score (nouveau) ────────────────────────────
-- SECURITY INVOKER (pas DEFINER) : l'INSERT dans park_scores reste soumis à la
-- policy `park_scores_write` (manages_park) -> seul un gestionnaire du parc ou
-- le staff Toboggo peut réellement (re)calculer un score. Moindre privilège.
create or replace function recalculate_park_score(p_park_id uuid) returns uuid as $$
declare
  r record; feature_total int; feature_known int; conf numeric(4,3); new_id uuid;
begin
  select round(avg(rating),1) as overall, round(avg(equipment),1) as equipment,
         round(avg(safety),1) as safety, round(avg(cleanliness),1) as cleanliness,
         round(avg(comfort),1) as comfort, count(*) as n
  into r from reviews where park_id = p_park_id and status = 'published';

  select count(*) into feature_total from features where is_active;
  select count(*) into feature_known from park_features
    where park_id = p_park_id and status <> 'unknown';

  conf := least(1.0, (coalesce(r.n,0) / 10.0) * 0.5
    + (case when feature_total > 0 then feature_known::numeric / feature_total else 0 end) * 0.5);

  insert into park_scores (
    park_id, overall_score, equipment_score, safety_score,
    cleanliness_score, comfort_score, accessibility_score,
    confidence_score, algorithm_version
  ) values (
    p_park_id, r.overall, r.equipment, r.safety, r.cleanliness, r.comfort,
    (select round(avg((pf.status = 'available')::int) * 5, 1)
       from park_features pf join features f on f.id = pf.feature_id
      where pf.park_id = p_park_id and f.category = 'accessibility'),
    conf, 'v1'
  ) returning id into new_id;
  return new_id;
end $$ language plpgsql set search_path = public, pg_temp;

-- ── Assertions ─────────────────────────────────────────────────────────
do $$
declare c_np int; c_parks int; c_pub int; bad_secdef text;
begin
  if to_regclass('public.park_public') is null then
    raise exception '0017: vue park_public absente';
  end if;

  select count(*) into c_np
  from pg_proc where proname = 'nearby_parks' and pronamespace = 'public'::regnamespace;
  if c_np <> 1 then
    raise exception '0017: attendu 1 fonction nearby_parks, trouvé %', c_np;
  end if;

  -- la vue expose bien la même population que parks
  select count(*) into c_parks from parks;
  select count(*) into c_pub from park_public;
  if c_pub <> c_parks then
    raise exception '0017: park_public expose % lignes != % parks', c_pub, c_parks;
  end if;

  -- fonctions v2 présentes
  if (select count(*) from pg_proc where proname in
      ('fstatus','fvalue','find_duplicate_parks','recalculate_park_score',
       'recompute_park_ages','audit_row') and pronamespace = 'public'::regnamespace) < 6 then
    raise exception '0017: fonctions v2 manquantes';
  end if;

  -- has_score : la vue doit renvoyer un boolean NON-NULL pour toute ligne
  if exists (select 1 from park_public where has_score is null) then
    raise exception '0017: park_public.has_score peut être NULL (coalesce(..., false) manquant)';
  end if;

  -- toute fonction SECURITY DEFINER de public créée/remplacée ici doit pinner search_path
  select string_agg(p.proname, ', ') into bad_secdef
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and p.proname in ('recompute_park_rating','recompute_park_open_report',
                      'recompute_park_ages','audit_row','increment_park_views')
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%'
    );
  if bad_secdef is not null then
    raise exception '0017: fonctions SECURITY DEFINER sans search_path pinné: %', bad_secdef;
  end if;

  -- recalculate_park_score ne doit PAS être SECURITY DEFINER (moindre privilège)
  if exists (select 1 from pg_proc where proname = 'recalculate_park_score'
             and pronamespace = 'public'::regnamespace and prosecdef) then
    raise exception '0017: recalculate_park_score ne doit pas être SECURITY DEFINER';
  end if;

  raise notice '0017 OK — park_public (% lignes, has_score boolean), nearby_parks v2, SECDEF search_path pinné', c_pub;
end $$;
