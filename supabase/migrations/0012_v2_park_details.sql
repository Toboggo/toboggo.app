-- ════════════════════════════════════════════════════════════════════════════
-- 0012 — Tables filles v2 du parc (§5 §6 §7 §9 §10 §11 §12 §13 §16 §18)
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. Toutes ces tables sont NOUVELLES et créées VIDES :
--   park_zones, park_entrances, park_equipment, park_opening_hours,
--   park_sources, external_ids, park_names, park_attribute_sources,
--   park_edits, park_scores, park_duplicate_candidates
-- Aucun backfill : aucune donnée V1 ne s'y dérive sans invention.
-- Idempotent : `create table if not exists`, FK ajoutées via `do` guardé.
--
-- Ce fichier pose aussi les 2 FK différées de 0010/0011 :
--   park_features.source_id -> park_sources(id)
--   park_media.zone_id      -> park_zones(id)
-- et ajoute (additif) maintenance.zone_id / maintenance.equipment_id.
-- ════════════════════════════════════════════════════════════════════════════

-- ── §6 Zones internes ────────────────────────────────────────────────────
create table if not exists park_zones (
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
create index if not exists park_zones_park_idx on park_zones (park_id);

-- ── §7 Entrées ───────────────────────────────────────────────────────────
create table if not exists park_entrances (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  name text,
  type entrance_type not null default 'main',
  location geography(Point, 4326) not null,
  wheelchair_access access_level not null default 'unknown',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists park_entrances_park_idx on park_entrances (park_id);
create unique index if not exists park_entrances_one_primary on park_entrances (park_id) where is_primary;

-- ── §10 Sources & identifiants externes ─────────────────────────────────
create table if not exists park_sources (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  source_type source_type not null,
  source_name text,
  source_url text,
  license text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists park_sources_park_idx on park_sources (park_id);

create table if not exists external_ids (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  provider text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index if not exists external_ids_park_idx on external_ids (park_id);

-- ── §18 Noms multilingues ───────────────────────────────────────────────
create table if not exists park_names (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  lang text not null,
  name text not null,
  is_primary boolean not null default false,
  source_id uuid references park_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (park_id, lang)
);
create unique index if not exists park_names_one_primary on park_names (park_id) where is_primary;

-- ── §5 Équipement physique ─────────────────────────────────────────────
create table if not exists park_equipment (
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
create index if not exists park_equipment_park_idx on park_equipment (park_id);
create index if not exists park_equipment_zone_idx on park_equipment (zone_id);

-- ── §9 Horaires d'ouverture ────────────────────────────────────────────
create table if not exists park_opening_hours (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  opening_hours text not null,
  timezone text not null,
  season_from date,
  season_until date,
  note text,
  source_id uuid references park_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists park_opening_hours_park_idx on park_opening_hours (park_id);

-- ── §12 Provenance au niveau du champ ─────────────────────────────────
create table if not exists park_attribute_sources (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  attribute_key text not null,
  value_json jsonb not null,
  source_id uuid references park_sources(id) on delete set null,
  confidence numeric(4, 3),
  verified_at timestamptz,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists park_attr_src_park_idx on park_attribute_sources (park_id, attribute_key);
create unique index if not exists park_attr_src_one_current
  on park_attribute_sources (park_id, attribute_key) where is_current;

-- ── §13 Contributions / change-requests ──────────────────────────────
create table if not exists park_edits (
  id uuid primary key default gen_random_uuid(),
  park_id uuid references parks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  changes jsonb not null,
  status edit_status not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists park_edits_park_idx on park_edits (park_id);
create index if not exists park_edits_status_idx on park_edits (status);
create index if not exists park_edits_user_idx on park_edits (user_id);

-- ── §16 Toboggo Score (versionné) ───────────────────────────────────
create table if not exists park_scores (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  overall_score numeric(3, 1),
  equipment_score numeric(3, 1),
  safety_score numeric(3, 1),
  cleanliness_score numeric(3, 1),
  comfort_score numeric(3, 1),
  accessibility_score numeric(3, 1),
  confidence_score numeric(4, 3),
  algorithm_version text not null,
  calculated_at timestamptz not null default now()
);
create index if not exists park_scores_park_idx on park_scores (park_id, calculated_at desc);

-- ── §11 Candidats doublons mondiaux ─────────────────────────────────
create table if not exists park_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  candidate_park_id uuid not null references parks(id) on delete cascade,
  geo_distance_m double precision,
  geo_distance_score numeric(4, 3),
  name_similarity numeric(4, 3),
  address_similarity numeric(4, 3),
  external_id_match boolean not null default false,
  total_score numeric(4, 3),
  resolution text not null default 'pending',
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (park_id, candidate_park_id),
  check (park_id <> candidate_park_id)
);
create index if not exists park_dupe_park_idx on park_duplicate_candidates (park_id);

-- ── FK différées de 0010 / 0011 ─────────────────────────────────────
do $$ begin
  alter table park_features
    add constraint park_features_source_id_fkey
    foreign key (source_id) references park_sources(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table park_media
    add constraint park_media_zone_id_fkey
    foreign key (zone_id) references park_zones(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ── maintenance : colonnes v2 additives (zone_id / equipment_id) ────
alter table maintenance add column if not exists zone_id uuid references park_zones(id) on delete set null;
alter table maintenance add column if not exists equipment_id uuid references park_equipment(id) on delete set null;

-- ── Assertions ─────────────────────────────────────────────────────────
do $$
declare missing text; c_rows int;
begin
  select string_agg(t, ', ') into missing
  from (values
    ('park_zones'),('park_entrances'),('park_equipment'),('park_opening_hours'),
    ('park_sources'),('external_ids'),('park_names'),('park_attribute_sources'),
    ('park_edits'),('park_scores'),('park_duplicate_candidates')
  ) v(t)
  where to_regclass('public.' || v.t) is null;
  if missing is not null then
    raise exception '0012: tables filles v2 manquantes: %', missing;
  end if;

  -- FK différées de 0010 / 0011
  if not exists (select 1 from pg_constraint where conname = 'park_features_source_id_fkey') then
    raise exception '0012: FK park_features.source_id non posée';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'park_media_zone_id_fkey') then
    raise exception '0012: FK park_media.zone_id non posée';
  end if;

  -- Intégrité référentielle : aucune ligne fille ne pointe un parc inexistant.
  -- (Portable staging : ne suppose PAS que les tables sont vides — un
  --  environnement peut déjà contenir des données v2 compatibles.)
  select
      (select count(*) from park_zones z            where not exists (select 1 from parks p where p.id = z.park_id))
    + (select count(*) from park_entrances e         where not exists (select 1 from parks p where p.id = e.park_id))
    + (select count(*) from park_equipment q         where not exists (select 1 from parks p where p.id = q.park_id))
    + (select count(*) from park_opening_hours h     where not exists (select 1 from parks p where p.id = h.park_id))
    + (select count(*) from park_sources s           where not exists (select 1 from parks p where p.id = s.park_id))
    + (select count(*) from external_ids x           where not exists (select 1 from parks p where p.id = x.park_id))
    + (select count(*) from park_names n             where not exists (select 1 from parks p where p.id = n.park_id))
    + (select count(*) from park_attribute_sources a where not exists (select 1 from parks p where p.id = a.park_id))
    + (select count(*) from park_scores k            where not exists (select 1 from parks p where p.id = k.park_id))
  into c_rows;
  if c_rows > 0 then
    raise exception '0012: % ligne(s) fille(s) pointant un parc inexistant', c_rows;
  end if;

  raise notice '0012 OK — 11 tables filles v2 présentes, FK différées posées, intégrité référentielle vérifiée';
end $$;
