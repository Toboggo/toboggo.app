-- ════════════════════════════════════════════════════════════════════════════
-- Toboggo — worldwide parks database schema
-- Implements: toboggo_architecture_bdd_mondiale_v2_technique.pdf
--
-- Core principles from the spec:
--   §1  A park is a GEOGRAPHIC entity — never tied to a French admin hierarchy.
--       Mandatory: latitude + longitude. GEOGRAPHY(Point,4326). country_code
--       (ISO 3166-1 alpha-2) + IANA timezone. Optional boundary polygon.
--   §2  `parks` stays lean: identity, geography, status, verification, derived
--       ages. No `has_slide` / `has_toilet` columns. `city` is never a geo key.
--   §3  Features are a catalogue + link table, not columns — extensible with no
--       schema migration.
--   §4  Never conflate "absent" and "not filled in": available / unavailable /
--       unknown / temporarily_unavailable.
--   §5  Three levels: park > feature > physical equipment.
--   §6  Internal zones, each with its own age range.
--   §7  Entrances, routing point, perimeter.
--   §8  Structured environmental data (enums, not poor booleans).
--   §9  Opening hours + real operational status with reason / from / until.
--   §10 Sources + external ids — never overwrite provenance on import.
--   §11 Worldwide de-duplication (geo + name + address + external id).
--   §12 Field-level provenance (source, date, confidence, is_current).
--   §13 Contributions / change-requests — canonical data stays controlled.
--   §14 Generic audit log — who changed what, when, from which source.
--   §15 Reviews / media / reports as a separate community layer.
--   §16 Toboggo Score — calculated, sub-scored, confidence-scored, versioned.
--   §17 Organisations (municipality, region, operator, association…) — the
--       French administrative model is NOT hard-coded into the product core.
--   §18 park_names for multilingual naming.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists postgis;
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;   -- name similarity for worldwide dedup (§11)

-- ── Enums ──────────────────────────────────────────────────────────────────

-- Moderation lifecycle of a park record (community contribution pipeline).
create type park_moderation_status as enum ('draft', 'pending', 'published', 'blocked', 'rejected');

-- Real-world operational state of the park (§9).
create type park_operational_status as enum (
  'active', 'temporarily_closed', 'partially_closed', 'under_construction', 'permanently_closed', 'unknown'
);

-- How trustworthy the park's data is (§1 verification_status, §12).
create type verification_status as enum (
  'unverified', 'community_verified', 'organization_verified', 'toboggo_verified'
);

-- §4 — never conflate "absent" and "not filled in".
create type feature_status as enum ('available', 'unavailable', 'unknown', 'temporarily_unavailable');

-- §3 — feature catalogue categories.
create type feature_category as enum ('play', 'service', 'environment', 'accessibility', 'safety');

-- §10 — provenance of an import / data point.
create type source_type as enum ('osm', 'open_data', 'municipality', 'partner', 'user', 'toboggo', 'other');

-- §13 — contribution / change-request lifecycle.
create type edit_status as enum ('pending', 'approved', 'rejected', 'auto_approved');

-- §15 — reports.
create type report_category as enum (
  'broken_equipment', 'safety', 'cleanliness', 'vegetation', 'accessibility', 'wrong_info', 'other'
);
create type report_status as enum ('open', 'in_progress', 'resolved', 'dismissed');
create type report_severity as enum ('low', 'medium', 'high', 'critical');

-- §15 — reviews / media moderation.
create type review_status as enum ('published', 'flagged', 'hidden', 'pending');
create type media_category as enum (
  'cover', 'play_area', 'entrance', 'equipment', 'surroundings', 'accessibility', 'other'
);
create type media_status as enum ('pending', 'approved', 'rejected');

-- §17 — organisations. The French model is NOT hard-coded: `type` is generic.
create type organization_type as enum (
  'municipality', 'intercommunality', 'department', 'region', 'state',
  'private_operator', 'association', 'other'
);
create type organization_park_role as enum ('owner', 'manager', 'operator', 'maintainer', 'contributor');

-- §5 — physical equipment.
create type equipment_condition as enum ('new', 'good', 'fair', 'poor', 'out_of_service', 'unknown');
create type equipment_status as enum ('installed', 'removed', 'planned', 'unknown');

-- §7 — entrances / accessibility.
create type entrance_type as enum ('main', 'secondary', 'pmr', 'parking', 'service');
create type access_level as enum ('yes', 'limited', 'no', 'unknown');

-- App-domain enums carried over from the product build.
create type age_band as enum ('all', 'under3', '3-6', '6-12');
create type maintenance_recur as enum ('none', 'monthly', 'yearly');
create type team_role as enum ('super_admin', 'moderation', 'support', 'gestionnaire', 'contributeur');
create type notification_type as enum ('resolved', 'newPark', 'thanks', 'confirm', 'recommend');

-- ── §17 Organisations & collectivités ──────────────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type organization_type not null default 'other',
  country_code char(2),
  contact_email text,
  email_notif boolean not null default false,
  website text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── §1 §2 §9 Parks — the canonical place, kept deliberately lean ────────────
create table parks (
  id uuid primary key default gen_random_uuid(),

  -- identity
  name text not null,
  slug text,
  description text,

  -- geography (§1: lat+lng mandatory, GEOGRAPHY point, optional boundary)
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  location geography(Point, 4326) generated always as (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) stored,
  boundary geography(Polygon, 4326),
  country_code char(2) not null,          -- ISO 3166-1 alpha-2
  timezone text not null,                 -- IANA, e.g. Europe/Paris

  -- optional postal address (§2: never used as a geo key)
  address_line text,
  postal_code text,
  city text,
  admin_area_1 text,                      -- state / région
  admin_area_2 text,                      -- county / département

  -- global ages, may be derived from zones (§2, §6)
  min_age smallint,
  max_age smallint,
  ages_derived boolean not null default true,

  -- status (§9: moderation vs. operational are two different things)
  moderation_status park_moderation_status not null default 'pending',
  operational_status park_operational_status not null default 'active',
  status_reason text,
  status_from date,
  status_until date,
  verification_status verification_status not null default 'unverified',

  -- governance
  created_by uuid references auth.users(id) on delete set null,

  -- lightweight trigger-maintained caches (documented derived values, NOT
  -- feature flags — see §2)
  rating numeric(2, 1) not null default 0,
  review_count int not null default 0,
  has_open_report boolean not null default false,
  views int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_verified_at timestamptz
);
create index parks_location_idx on parks using gist (location);
create index parks_boundary_idx on parks using gist (boundary);
create index parks_moderation_idx on parks (moderation_status);
create index parks_operational_idx on parks (operational_status);
create index parks_country_idx on parks (country_code);
create index parks_name_trgm_idx on parks using gin (name gin_trgm_ops);
create index parks_created_by_idx on parks (created_by);

-- ── §10 Sources & external identifiers ─────────────────────────────────────
create table park_sources (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  source_type source_type not null,
  source_name text,
  source_url text,
  license text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index park_sources_park_idx on park_sources (park_id);

create table external_ids (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  provider text not null,                 -- osm, google, datagouv, overpass…
  external_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index external_ids_park_idx on external_ids (park_id);

-- ── §18 Multilingual park names ────────────────────────────────────────────
create table park_names (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  lang text not null,                     -- BCP-47: fr, en, ja, es…
  name text not null,
  is_primary boolean not null default false,
  source_id uuid references park_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (park_id, lang)
);
create unique index park_names_one_primary on park_names (park_id) where is_primary;

-- ── §6 Internal zones ─────────────────────────────────────────────────────
create table park_zones (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  name text not null,
  description text,
  min_age smallint,
  max_age smallint,
  location geography(Point, 4326),
  boundary geography(Polygon, 4326),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index park_zones_park_idx on park_zones (park_id);

-- ── §7 Entrances ──────────────────────────────────────────────────────────
create table park_entrances (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  name text,
  type entrance_type not null default 'main',
  location geography(Point, 4326) not null,
  wheelchair_access access_level not null default 'unknown',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index park_entrances_park_idx on park_entrances (park_id);
create unique index park_entrances_one_primary on park_entrances (park_id) where is_primary;

-- ── §3 Feature catalogue ──────────────────────────────────────────────────
-- Adding a zipline tomorrow = one new row here, not a schema migration.
create table features (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,              -- slide, swing, toilets, drinking_water…
  category feature_category not null,
  label_key text not null,                -- i18n key, translated in the UI
  icon_key text,
  -- §8 — for enumerated environmental attributes (fence_status, shade_level…)
  -- list the allowed values here; null = a plain presence feature.
  value_set text[],
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── §3 §4 §8 Park ↔ feature link ──────────────────────────────────────────
create table park_features (
  park_id uuid not null references parks(id) on delete cascade,
  feature_id uuid not null references features(id) on delete cascade,
  status feature_status not null default 'unknown',
  value text,                             -- §8: e.g. 'fully_fenced', 'partial'
  quantity int,
  note text,
  source_id uuid references park_sources(id) on delete set null,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (park_id, feature_id)
);
create index park_features_feature_idx on park_features (feature_id);

-- ── §5 Physical equipment (level 3) ───────────────────────────────────────
create table park_equipment (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  zone_id uuid references park_zones(id) on delete set null,
  feature_id uuid references features(id) on delete set null,
  name text,
  manufacturer text,
  model text,
  quantity int not null default 1,
  condition equipment_condition,
  status equipment_status not null default 'installed',
  installation_date date,
  last_inspection_at date,
  next_inspection_at date,
  location geography(Point, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index park_equipment_park_idx on park_equipment (park_id);
create index park_equipment_zone_idx on park_equipment (zone_id);

-- ── §9 Opening hours ──────────────────────────────────────────────────────
create table park_opening_hours (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  opening_hours text not null,            -- OSM opening_hours syntax
  timezone text not null,
  season_from date,
  season_until date,
  note text,
  source_id uuid references park_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index park_opening_hours_park_idx on park_opening_hours (park_id);

-- ── §12 Field-level provenance ────────────────────────────────────────────
create table park_attribute_sources (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  attribute_key text not null,           -- feature code, 'geometry', 'ages'…
  value_json jsonb not null,
  source_id uuid references park_sources(id) on delete set null,
  confidence numeric(4, 3),
  verified_at timestamptz,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index park_attr_src_park_idx on park_attribute_sources (park_id, attribute_key);
create unique index park_attr_src_one_current on park_attribute_sources (park_id, attribute_key)
  where is_current;

-- ── §13 Contributions / change-requests ───────────────────────────────────
-- Parents propose; canonical data stays controlled. Never write `parks`
-- directly from a user contribution.
create table park_edits (
  id uuid primary key default gen_random_uuid(),
  park_id uuid references parks(id) on delete cascade,   -- null = proposed new park
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  changes jsonb not null,
  status edit_status not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index park_edits_park_idx on park_edits (park_id);
create index park_edits_status_idx on park_edits (status);
create index park_edits_user_idx on park_edits (user_id);

-- ── §14 Generic audit log ─────────────────────────────────────────────────
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,             -- park, park_feature, report, organization…
  entity_id uuid not null,
  action text not null,                  -- insert, update, delete, status_change…
  field text,
  old_value jsonb,
  new_value jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  source text not null default 'app',
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity_type, entity_id);
create index audit_log_actor_idx on audit_log (actor_id);
create index audit_log_created_idx on audit_log (created_at desc);

-- ── §17 Organisation ↔ park relation (N-N, with role) ─────────────────────
create table organization_parks (
  organization_id uuid not null references organizations(id) on delete cascade,
  park_id uuid not null references parks(id) on delete cascade,
  role organization_park_role not null default 'manager',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (organization_id, park_id)
);
create index organization_parks_park_idx on organization_parks (park_id);

-- ── §15 Community layer — reviews ─────────────────────────────────────────
create table reviews (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  rating numeric(2, 1) not null check (rating between 0.5 and 5),
  cleanliness numeric(2, 1),
  safety numeric(2, 1),
  equipment numeric(2, 1),
  comfort numeric(2, 1),
  recommended_min_age smallint,
  recommended_max_age smallint,
  comment text,
  status review_status not null default 'published',
  reply text,
  reply_by text,
  reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reviews_park_idx on reviews (park_id);
create index reviews_user_idx on reviews (user_id);

-- ── §15 Community layer — media ──────────────────────────────────────────
create table park_media (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  zone_id uuid references park_zones(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  url text not null,
  category media_category not null default 'other',
  caption text,
  is_cover boolean not null default false,
  status media_status not null default 'approved',
  created_at timestamptz not null default now()
);
create index park_media_park_idx on park_media (park_id);
create unique index park_media_one_cover on park_media (park_id) where is_cover;

-- ── §15 Community layer — reports (can target park, zone or equipment) ────
create table reports (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  zone_id uuid references park_zones(id) on delete set null,
  equipment_id uuid references park_equipment(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  reported_by_name text not null,
  category report_category not null,
  severity report_severity not null default 'medium',
  equipment_label text,                  -- free text when equipment_id is unknown
  description text,
  photo text,
  status report_status not null default 'open',
  resolution_note text,
  resolution_photo text,
  resolution_days int,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_park_idx on reports (park_id);
create index reports_status_idx on reports (status);

-- ── §16 Toboggo Score — versioned, sub-scored, confidence-scored ─────────
create table park_scores (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  overall_score numeric(3, 1),
  equipment_score numeric(3, 1),
  safety_score numeric(3, 1),
  cleanliness_score numeric(3, 1),
  comfort_score numeric(3, 1),
  accessibility_score numeric(3, 1),
  confidence_score numeric(4, 3),        -- distinguishes a solid score from a data-poor one
  algorithm_version text not null,
  calculated_at timestamptz not null default now()
);
create index park_scores_park_idx on park_scores (park_id, calculated_at desc);

-- ── §11 Worldwide de-duplication candidates ──────────────────────────────
create table park_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  candidate_park_id uuid not null references parks(id) on delete cascade,
  geo_distance_m double precision,
  geo_distance_score numeric(4, 3),
  name_similarity numeric(4, 3),
  address_similarity numeric(4, 3),
  external_id_match boolean not null default false,
  total_score numeric(4, 3),
  resolution text not null default 'pending',   -- pending, merged, not_duplicate
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (park_id, candidate_park_id),
  check (park_id <> candidate_park_id)
);
create index park_dupe_park_idx on park_duplicate_candidates (park_id);

-- ════════════════════════════════════════════════════════════════════════════
-- App-domain tables (product build, not part of the canonical data model).
-- `commune_id` from the prototype is now `organization_id` everywhere.
-- ════════════════════════════════════════════════════════════════════════════

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
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references organizations(id) on delete cascade, -- null = Toboggo staff
  name text not null,
  email text not null,
  role team_role not null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);
create index team_members_user_idx on team_members (user_id);

create table maintenance (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  zone_id uuid references park_zones(id) on delete set null,
  equipment_id uuid references park_equipment(id) on delete set null,
  date date not null,
  note text,
  assignee text,
  recur maintenance_recur not null default 'none',
  done boolean not null default false,
  done_date timestamptz,
  created_at timestamptz not null default now()
);
create index maintenance_org_idx on maintenance (organization_id);
create index maintenance_park_idx on maintenance (park_id);

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
  organization_id uuid references organizations(id) on delete cascade, -- null = Toboggo staff activity
  actor text not null,
  text text not null,
  color text not null default 'primary',
  created_at timestamptz not null default now()
);
create index activity_log_org_idx on activity_log (organization_id);

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

create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  created_at timestamptz not null default now()
);
