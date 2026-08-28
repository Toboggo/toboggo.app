-- ════════════════════════════════════════════════════════════════════════════
-- Triggers, derived values, RPCs, de-duplication, scoring.
-- ════════════════════════════════════════════════════════════════════════════

-- ── updated_at maintenance ────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger organizations_touch before update on organizations
  for each row execute function touch_updated_at();
create trigger parks_touch before update on parks
  for each row execute function touch_updated_at();
create trigger park_zones_touch before update on park_zones
  for each row execute function touch_updated_at();
create trigger park_features_touch before update on park_features
  for each row execute function touch_updated_at();
create trigger park_equipment_touch before update on park_equipment
  for each row execute function touch_updated_at();
create trigger park_opening_hours_touch before update on park_opening_hours
  for each row execute function touch_updated_at();
create trigger reviews_touch before update on reviews
  for each row execute function touch_updated_at();

-- ── §15 §16 Keep parks.rating / review_count in sync with reviews ─────────
create or replace function recompute_park_rating() returns trigger as $$
declare
  pid uuid := coalesce(new.park_id, old.park_id);
begin
  update parks set
    rating = coalesce(
      (select round(avg(rating)::numeric, 1) from reviews
       where park_id = pid and status = 'published'), 0),
    review_count = (select count(*) from reviews
       where park_id = pid and status = 'published')
  where id = pid;
  return null;
end;
$$ language plpgsql security definer;

create trigger reviews_after_change
  after insert or update or delete on reviews
  for each row execute function recompute_park_rating();

-- ── Keep parks.has_open_report in sync (§15) ─────────────────────────────
create or replace function recompute_park_open_report() returns trigger as $$
declare
  pid uuid := coalesce(new.park_id, old.park_id);
begin
  update parks set has_open_report = exists (
    select 1 from reports where park_id = pid and status in ('open', 'in_progress')
  ) where id = pid;
  return null;
end;
$$ language plpgsql security definer;

create trigger reports_after_change
  after insert or update or delete on reports
  for each row execute function recompute_park_open_report();

-- ── §2 §6 Derive parks.min_age / max_age from zones ──────────────────────
create or replace function recompute_park_ages() returns trigger as $$
declare
  pid uuid := coalesce(new.park_id, old.park_id);
begin
  update parks p set
    min_age = z.min_age,
    max_age = z.max_age
  from (
    select min(min_age) as min_age, max(max_age) as max_age
    from park_zones where park_id = pid
  ) z
  where p.id = pid and p.ages_derived
    and (z.min_age is not null or z.max_age is not null);
  return null;
end;
$$ language plpgsql security definer;

create trigger park_zones_after_change
  after insert or update or delete on park_zones
  for each row execute function recompute_park_ages();

-- ── §14 Generic audit trigger ───────────────────────────────────────────
-- Historises important changes for admin / support / collectivités / restore.
create or replace function audit_row() returns trigger as $$
declare
  actor uuid := auth.uid();
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
end;
$$ language plpgsql security definer;

-- parks: audit only meaningful field changes, not the trigger-maintained caches
-- (rating / review_count / has_open_report / views).
create trigger parks_audit_ins after insert on parks
  for each row execute function audit_row();
create trigger parks_audit_del after delete on parks
  for each row execute function audit_row();
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

create trigger park_equipment_audit after insert or update or delete on park_equipment
  for each row execute function audit_row();
create trigger reports_audit after insert or update or delete on reports
  for each row execute function audit_row();
create trigger organizations_audit after insert or update or delete on organizations
  for each row execute function audit_row();
create trigger park_edits_audit after insert or update or delete on park_edits
  for each row execute function audit_row();

-- ── Auth: link an invited team member + create their profile on signup ───
-- SECURITY DEFINER + fires as `supabase_auth_admin` (no `public` in search_path),
-- so every table is schema-qualified and search_path is pinned — otherwise the
-- trigger raises and sign-up fails with "Database error saving new user".
create or replace function link_team_member_on_signup() returns trigger as $$
begin
  update public.team_members set user_id = new.id
    where lower(email) = lower(new.email) and user_id is null;
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function link_team_member_on_signup();

-- ════════════════════════════════════════════════════════════════════════════
-- Public read view — flattens the normalised model for the consumer app.
-- security_invoker = true so the caller's RLS on the underlying tables applies.
-- ════════════════════════════════════════════════════════════════════════════

-- Feature-status / feature-value accessors used by the compatibility projection.
create or replace function fstatus(p_park_id uuid, p_code text) returns text as $$
  select pf.status::text from park_features pf join features f on f.id = pf.feature_id
  where pf.park_id = p_park_id and f.code = p_code;
$$ language sql stable;

create or replace function fvalue(p_park_id uuid, p_code text) returns text as $$
  select pf.value from park_features pf join features f on f.id = pf.feature_id
  where pf.park_id = p_park_id and f.code = p_code;
$$ language sql stable;

create or replace view park_public
with (security_invoker = true) as
select
  p.*,
  coalesce(
    (select jsonb_object_agg(f.code, jsonb_build_object(
        'status', pf.status,
        'value', pf.value,
        'quantity', pf.quantity,
        'category', f.category,
        'verified_at', pf.verified_at))
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
  (select overall_score is not null from park_scores s
    where s.park_id = p.id order by s.calculated_at desc limit 1) as has_score,

  -- ── Compatibility projection ────────────────────────────────────────────
  -- The normalised model above is canonical (PDF §2/§3). These derived
  -- columns let the current apps read a flat shape while they migrate to the
  -- `features` map. They are computed here, never stored on `parks`.
  p.latitude as lat,
  p.longitude as lng,
  p.min_age as age_min,
  p.max_age as age_max,
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

-- ── §1 §7 Nearby parks (PostGIS) ────────────────────────────────────────
create or replace function nearby_parks(
  p_lat double precision,
  p_lng double precision,
  p_radius_m int default 20000
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
    v.id, v.name, v.description, v.latitude, v.longitude,
    v.lat, v.lng,
    v.country_code, v.timezone, v.city, v.address_line,
    v.formatted_address, v.commune_id, v.organization_id,
    v.min_age, v.max_age, v.age_min, v.age_max,
    v.moderation_status, v.operational_status, v.verification_status, v.status,
    v.rating, v.review_count, v.has_open_report, v.views,
    v.created_by, v.created_at, v.updated_at,
    v.features, v.cover_photo, v.photos, v.score,
    v.surface, v.play_equipment,
    v.wc, v.shade, v.fenced, v.pmr, v.benches, v.water, v.parking,
    -- v.location is the stored generated column on parks; the view is inlined
    -- so the GIST index (parks_location_idx) is used here.
    ST_Distance(v.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m
  from park_public v
  where v.moderation_status = 'published'
    and v.operational_status <> 'permanently_closed'
    and ST_DWithin(v.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by distance_m asc;
$$ language sql stable;

create or replace function increment_park_views(p_park_id uuid) returns void as $$
  update parks set views = views + 1 where id = p_park_id;
$$ language sql security definer;

-- ── §11 Worldwide de-duplication ───────────────────────────────────────
-- Combine GPS distance + trigram name similarity. Never dedupe on name alone.
create or replace function find_duplicate_parks(
  p_lat double precision,
  p_lng double precision,
  p_name text,
  p_radius_m int default 200,
  p_exclude uuid default null
) returns table (
  park_id uuid, name text, distance_m double precision,
  name_similarity real, score numeric
) as $$
  select
    p.id, p.name,
    ST_Distance(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m,
    similarity(p.name, coalesce(p_name, '')) as name_similarity,
    round((
      -- geo score: 1.0 at 0 m, 0.0 at p_radius_m
      greatest(0, 1 - ST_Distance(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / p_radius_m) * 0.6
      + similarity(p.name, coalesce(p_name, '')) * 0.4
    )::numeric, 3) as score
  from parks p
  where (p_exclude is null or p.id <> p_exclude)
    and ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by score desc;
$$ language sql stable;

-- ── §16 Toboggo Score (v1) ─────────────────────────────────────────────
-- Deliberately simple and versioned. Confidence reflects data completeness.
create or replace function recalculate_park_score(p_park_id uuid) returns uuid as $$
declare
  r record;
  feature_total int;
  feature_known int;
  conf numeric(4,3);
  new_id uuid;
begin
  select
    round(avg(rating), 1) as overall,
    round(avg(equipment), 1) as equipment,
    round(avg(safety), 1) as safety,
    round(avg(cleanliness), 1) as cleanliness,
    round(avg(comfort), 1) as comfort,
    count(*) as n
  into r
  from reviews where park_id = p_park_id and status = 'published';

  select count(*) into feature_total from features where is_active;
  select count(*) into feature_known from park_features
    where park_id = p_park_id and status <> 'unknown';

  conf := least(1.0, (coalesce(r.n, 0) / 10.0) * 0.5
                   + (case when feature_total > 0 then feature_known::numeric / feature_total else 0 end) * 0.5);

  insert into park_scores (
    park_id, overall_score, equipment_score, safety_score,
    cleanliness_score, comfort_score, accessibility_score,
    confidence_score, algorithm_version
  ) values (
    p_park_id, r.overall, r.equipment, r.safety,
    r.cleanliness, r.comfort,
    (select round(avg((pf.status = 'available')::int) * 5, 1)
       from park_features pf join features f on f.id = pf.feature_id
      where pf.park_id = p_park_id and f.category = 'accessibility'),
    conf, 'v1'
  ) returning id into new_id;

  return new_id;
end;
$$ language plpgsql security definer;

-- ── Account self-deletion ──────────────────────────────────────────────
create or replace function delete_own_account() returns void as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$ language plpgsql security definer;

grant execute on function delete_own_account() to authenticated;
grant execute on function nearby_parks(double precision, double precision, int) to anon, authenticated;
grant execute on function find_duplicate_parks(double precision, double precision, text, int, uuid) to authenticated;
grant execute on function increment_park_views(uuid) to anon, authenticated;
grant execute on function recalculate_park_score(uuid) to authenticated;
