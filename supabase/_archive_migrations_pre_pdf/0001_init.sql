-- Toboggo schema. Unifies the two back-office prototypes' data models (see
-- plan for the specific inconsistencies fixed here: FK-linked reports instead
-- of name-matching, a single 5-state park status, real geospatial parks).

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ── Enums ──────────────────────────────────────────────────────────────────
create type park_status as enum ('draft', 'pending', 'published', 'blocked', 'rejected');
create type park_surface as enum ('sable', 'gazon', 'sol_souple', 'non_precise');
create type report_reason as enum ('broken_equipment', 'safety', 'cleanliness', 'vegetation', 'accessibility', 'wrong_info', 'other');
create type report_status as enum ('open', 'resolved', 'dismissed');
create type age_band as enum ('all', 'under3', '3-6', '6-12');
create type maintenance_recur as enum ('none', 'monthly', 'yearly');
create type team_role as enum ('super_admin', 'moderation', 'support', 'gestionnaire', 'contributeur');
create type notification_type as enum ('resolved', 'newPark', 'thanks', 'confirm', 'recommend');

-- ── Core tables ────────────────────────────────────────────────────────────
create table communes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  email_notif boolean not null default false,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  children jsonb not null default '[]',
  favorites uuid[] not null default '{}',
  notif_prefs jsonb not null default '{"reports":true,"newParks":true,"reviewReplies":true,"recommendations":true,"news":false}',
  notif_channels jsonb not null default '{"push":true,"email":true}',
  privacy_prefs jsonb not null default '{"shareLocation":true,"publicProfile":false}',
  dark_mode boolean not null default false,
  offline_mode boolean not null default false,
  created_at timestamptz not null default now()
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  commune_id uuid references communes(id) on delete cascade, -- null = Toboggo staff
  name text not null,
  email text not null,
  role team_role not null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (commune_id, email)
);

create table parks (
  id uuid primary key default gen_random_uuid(),
  commune_id uuid references communes(id) on delete set null,
  name text not null,
  formatted_address text not null,
  lat double precision not null,
  lng double precision not null,
  geom geography(Point, 4326) generated always as (
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  ) stored,
  age_min int not null default 0,
  age_max int not null default 12,
  surface park_surface not null default 'non_precise',
  wc boolean not null default false,
  shade boolean not null default false,
  fenced boolean not null default false,
  pmr boolean not null default false,
  benches boolean not null default false,
  water boolean not null default false,
  parking boolean not null default false,
  play_equipment text[] not null default '{}',
  photos text[] not null default '{}',
  description text,
  status park_status not null default 'pending',
  created_by uuid references auth.users(id) on delete set null,
  views int not null default 0,
  rating numeric(2,1) not null default 0,
  review_count int not null default 0,
  has_open_report boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index parks_geom_idx on parks using gist (geom);
create index parks_status_idx on parks (status);
create index parks_commune_idx on parks (commune_id);

create table park_edit_history (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  actor text not null,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  stars numeric(2,1) not null check (stars between 0.5 and 5),
  sub_ratings jsonb,
  comment text,
  photo text,
  age_band age_band,
  flagged boolean not null default false,
  reply text,
  reply_by text,
  reply_at timestamptz,
  created_at timestamptz not null default now()
);
create index reviews_park_idx on reviews (park_id);

create table reports (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  reported_by_name text not null,
  reason report_reason not null,
  equipment text,
  comment text,
  photo text,
  status report_status not null default 'open',
  resolution_note text,
  resolution_photo text,
  resolution_days int,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_park_idx on reports (park_id);
create index reports_status_idx on reports (status);

create table maintenance (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  commune_id uuid not null references communes(id) on delete cascade,
  date date not null,
  note text,
  assignee text,
  recur maintenance_recur not null default 'none',
  done boolean not null default false,
  done_date timestamptz,
  created_at timestamptz not null default now()
);
create index maintenance_commune_idx on maintenance (commune_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type notification_type not null,
  title text not null,
  description text not null,
  park_id uuid references parks(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  commune_id uuid references communes(id) on delete cascade, -- null = Toboggo staff activity
  actor text not null,
  text text not null,
  color text not null default 'primary',
  created_at timestamptz not null default now()
);
create index activity_log_commune_idx on activity_log (commune_id);

create table groups (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  status text not null default 'En route'
);

-- ── Derived columns / triggers ──────────────────────────────────────────────

-- Keep parks.rating / review_count in sync with reviews (real aggregation,
-- vs. the prototype which never persisted sub-criteria or recomputed rating).
create or replace function recompute_park_rating() returns trigger as $$
begin
  update parks set
    rating = coalesce((select round(avg(stars)::numeric, 1) from reviews where park_id = coalesce(new.park_id, old.park_id)), 0),
    review_count = (select count(*) from reviews where park_id = coalesce(new.park_id, old.park_id))
  where id = coalesce(new.park_id, old.park_id);
  return null;
end;
$$ language plpgsql security definer;

create trigger reviews_after_change
after insert or update or delete on reviews
for each row execute function recompute_park_rating();

-- Keep parks.has_open_report in sync (consumer app reads this instead of the
-- full reports table, which is commune/staff-scoped, not public).
create or replace function recompute_park_open_report() returns trigger as $$
begin
  update parks set has_open_report = exists (
    select 1 from reports where park_id = coalesce(new.park_id, old.park_id) and status = 'open'
  ) where id = coalesce(new.park_id, old.park_id);
  return null;
end;
$$ language plpgsql security definer;

create trigger reports_after_change
after insert or update or delete on reports
for each row execute function recompute_park_open_report();

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger parks_touch_updated_at before update on parks
for each row execute function touch_updated_at();

-- Attach an invited team member's user_id once they sign up with the same email.
create or replace function link_team_member_on_signup() returns trigger as $$
begin
  update team_members set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
  insert into profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function link_team_member_on_signup();

-- ── RPCs ─────────────────────────────────────────────────────────────────

create or replace function nearby_parks(p_lat double precision, p_lng double precision, p_radius_m int default 20000)
returns table (
  id uuid, commune_id uuid, name text, formatted_address text, lat double precision, lng double precision,
  age_min int, age_max int, surface park_surface, wc boolean, shade boolean, fenced boolean, pmr boolean,
  benches boolean, water boolean, parking boolean, play_equipment text[], photos text[], description text,
  status park_status, created_by uuid, views int, rating numeric, review_count int, has_open_report boolean,
  created_at timestamptz, updated_at timestamptz, distance_m double precision
) as $$
  select p.id, p.commune_id, p.name, p.formatted_address, p.lat, p.lng, p.age_min, p.age_max, p.surface,
    p.wc, p.shade, p.fenced, p.pmr, p.benches, p.water, p.parking, p.play_equipment, p.photos, p.description,
    p.status, p.created_by, p.views, p.rating, p.review_count, p.has_open_report, p.created_at, p.updated_at,
    ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m
  from parks p
  where p.status = 'published'
    and ST_DWithin(p.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by distance_m asc;
$$ language sql stable;

create or replace function increment_park_views(p_park_id uuid) returns void as $$
  update parks set views = views + 1 where id = p_park_id;
$$ language sql security definer;
