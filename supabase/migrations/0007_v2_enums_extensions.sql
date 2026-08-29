-- ════════════════════════════════════════════════════════════════════════════
-- 0007 — Enums & extensions manquants pour le modèle mondial v2
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. Uniquement des CREATE TYPE / CREATE EXTENSION additifs.
--   • aucun DROP, aucun DELETE/TRUNCATE
--   • aucun enum V1 recréé (park_status, park_surface, report_reason,
--     report_status, age_band, maintenance_recur, team_role, notification_type
--     sont conservés tels quels)
--   • report_status reçoit UNE nouvelle valeur ('in_progress') — ajout only
--
-- Chaque `create type` est idempotent via `exception when duplicate_object`.
-- `ALTER TYPE ... ADD VALUE` s'exécute dans la transaction de la migration
-- (PG >= 12) ; la nouvelle valeur n'est PAS utilisée dans ce fichier, donc
-- aucune restriction "cannot use before commit" n'est violée.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────────────
create extension if not exists postgis;     -- déjà présent (V1 0001) — no-op
create extension if not exists pgcrypto;    -- déjà présent (V1 0001) — no-op
create extension if not exists pg_trgm;     -- §11 similarité de noms (nouveau)

-- ── Enums v2 absents ──────────────────────────────────────────────────────
do $$ begin create type park_moderation_status as enum
  ('draft','pending','published','blocked','rejected');
exception when duplicate_object then null; end $$;

do $$ begin create type park_operational_status as enum
  ('active','temporarily_closed','partially_closed','under_construction','permanently_closed','unknown');
exception when duplicate_object then null; end $$;

do $$ begin create type verification_status as enum
  ('unverified','community_verified','organization_verified','toboggo_verified');
exception when duplicate_object then null; end $$;

do $$ begin create type feature_status as enum
  ('available','unavailable','unknown','temporarily_unavailable');
exception when duplicate_object then null; end $$;

do $$ begin create type feature_category as enum
  ('play','service','environment','accessibility','safety');
exception when duplicate_object then null; end $$;

do $$ begin create type source_type as enum
  ('osm','open_data','municipality','partner','user','toboggo','other');
exception when duplicate_object then null; end $$;

do $$ begin create type edit_status as enum
  ('pending','approved','rejected','auto_approved');
exception when duplicate_object then null; end $$;

do $$ begin create type report_category as enum
  ('broken_equipment','safety','cleanliness','vegetation','accessibility','wrong_info','other');
exception when duplicate_object then null; end $$;

do $$ begin create type report_severity as enum
  ('low','medium','high','critical');
exception when duplicate_object then null; end $$;

do $$ begin create type review_status as enum
  ('published','flagged','hidden','pending');
exception when duplicate_object then null; end $$;

do $$ begin create type media_category as enum
  ('cover','play_area','entrance','equipment','surroundings','accessibility','other');
exception when duplicate_object then null; end $$;

do $$ begin create type media_status as enum
  ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin create type organization_type as enum
  ('municipality','intercommunality','department','region','state','private_operator','association','other');
exception when duplicate_object then null; end $$;

do $$ begin create type organization_park_role as enum
  ('owner','manager','operator','maintainer','contributor');
exception when duplicate_object then null; end $$;

do $$ begin create type equipment_condition as enum
  ('new','good','fair','poor','out_of_service','unknown');
exception when duplicate_object then null; end $$;

do $$ begin create type equipment_status as enum
  ('installed','removed','planned','unknown');
exception when duplicate_object then null; end $$;

do $$ begin create type entrance_type as enum
  ('main','secondary','pmr','parking','service');
exception when duplicate_object then null; end $$;

do $$ begin create type access_level as enum
  ('yes','limited','no','unknown');
exception when duplicate_object then null; end $$;

-- ── report_status : ajout de 'in_progress' (V1 = open/resolved/dismissed) ──
alter type report_status add value if not exists 'in_progress' before 'resolved';

-- ── Assertions ───────────────────────────────────────────────────────────
do $$
declare missing text;
begin
  select string_agg(t, ', ') into missing
  from (values
    ('park_moderation_status'),('park_operational_status'),('verification_status'),
    ('feature_status'),('feature_category'),('source_type'),('edit_status'),
    ('report_category'),('report_severity'),('review_status'),('media_category'),
    ('media_status'),('organization_type'),('organization_park_role'),
    ('equipment_condition'),('equipment_status'),('entrance_type'),('access_level')
  ) v(t)
  where not exists (select 1 from pg_type where typname = v.t);
  if missing is not null then
    raise exception '0007: enums manquants après migration: %', missing;
  end if;

  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'report_status' and e.enumlabel = 'in_progress'
  ) then
    raise exception '0007: report_status.in_progress absent après ALTER TYPE';
  end if;

  raise notice '0007 OK — 18 enums v2 présents, report_status.in_progress ajouté, pg_trgm actif';
end $$;
