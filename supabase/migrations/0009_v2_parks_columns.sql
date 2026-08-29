-- ════════════════════════════════════════════════════════════════════════════
-- 0009 — `parks` : colonnes du modèle mondial v2 (ajout ADDITIF)
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF — AUCUNE colonne V1 supprimée.
-- `parks` porte APRÈS cette migration les DEUX jeux de colonnes :
--   V1 : commune_id, formatted_address, lat, lng, geom, age_min, age_max,
--        surface, wc, shade, fenced, pmr, benches, water, parking,
--        play_equipment, photos, status
--   v2 : latitude, longitude, location, boundary, country_code, timezone,
--        address_line, postal_code, city, admin_area_1/2, min_age, max_age,
--        ages_derived, moderation_status, operational_status, status_reason,
--        status_from, status_until, verification_status, last_verified_at, slug
--
-- Ordre imposé : ADD (nullable) → UPDATE (backfill) → SET NOT NULL.
-- `country_code` / `timezone` : backfill 'FR' / 'Europe/Paris' pour les parcs
-- existants (tous français), mais SANS DEFAULT — le schéma reste mondial,
-- chaque futur parc devra fournir sa géographie.
--
-- Un trigger de compat `parks_v1_compat` permet à un INSERT/UPDATE de forme v2
-- (qui ne renseigne pas lat/lng/formatted_address) de satisfaire les
-- contraintes NOT NULL V1 pendant la coexistence. Retiré au futur 0020.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Colonnes identité / géo ──────────────────────────────────────────
alter table parks add column if not exists slug          text;
alter table parks add column if not exists latitude      numeric(9,6);
alter table parks add column if not exists longitude     numeric(9,6);
alter table parks add column if not exists boundary      geography(Polygon, 4326);
alter table parks add column if not exists country_code  char(2);
alter table parks add column if not exists timezone      text;

alter table parks add column if not exists address_line  text;
alter table parks add column if not exists postal_code   text;
alter table parks add column if not exists city          text;
alter table parks add column if not exists admin_area_1  text;
alter table parks add column if not exists admin_area_2  text;

alter table parks add column if not exists min_age       smallint;
alter table parks add column if not exists max_age       smallint;
alter table parks add column if not exists ages_derived  boolean not null default true;

alter table parks add column if not exists moderation_status  park_moderation_status;
alter table parks add column if not exists operational_status park_operational_status not null default 'active';
alter table parks add column if not exists status_reason      text;
alter table parks add column if not exists status_from        date;
alter table parks add column if not exists status_until       date;
alter table parks add column if not exists verification_status verification_status not null default 'unverified';
alter table parks add column if not exists last_verified_at   timestamptz;

-- ── 2. Backfill depuis les colonnes V1 ─────────────────────────────────
update parks set latitude  = lat::numeric(9,6)  where latitude  is null;
update parks set longitude = lng::numeric(9,6)  where longitude is null;
update parks set address_line = formatted_address
  where address_line is null and formatted_address is not null;
update parks set min_age = age_min where min_age is null;
update parks set max_age = age_max where max_age is null;
update parks set moderation_status = status::text::park_moderation_status
  where moderation_status is null;
-- les 17 parcs existants ont des âges explicitement saisis en V1
update parks set ages_derived = false;
-- backfill géographie française (parcs existants uniquement — pas de DEFAULT)
update parks set country_code = 'FR'           where country_code is null;
update parks set timezone     = 'Europe/Paris' where timezone     is null;

-- ── 3. Contraintes NOT NULL (APRÈS backfill) ───────────────────────────
alter table parks alter column latitude          set not null;
alter table parks alter column longitude         set not null;
alter table parks alter column country_code      set not null;
alter table parks alter column timezone          set not null;
alter table parks alter column moderation_status set not null;
alter table parks alter column moderation_status set default 'pending';

-- ── 4. Colonne générée `location` (après latitude/longitude NOT NULL) ──
alter table parks add column if not exists location geography(Point, 4326)
  generated always as (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) stored;

-- ── 5. Index v2 (noms distincts des index V1 parks_geom_idx / _status_ / _commune_) ──
create index if not exists parks_location_idx   on parks using gist (location);
create index if not exists parks_boundary_idx   on parks using gist (boundary);
create index if not exists parks_moderation_idx on parks (moderation_status);
create index if not exists parks_operational_idx on parks (operational_status);
create index if not exists parks_country_idx    on parks (country_code);
create index if not exists parks_name_trgm_idx  on parks using gin (name gin_trgm_ops);
create index if not exists parks_created_by_idx on parks (created_by);

-- ── 6. Trigger de compat V1 <-> v2 (coexistence, bidirectionnel) ──────
-- INSERT : si une seule version est fournie, remplir l'autre ; si les deux
--          sont fournies, la forme v2 canonique gagne.
-- UPDATE : la colonne explicitement modifiée gagne et synchronise son équivalent.
-- country_code / timezone NE SONT PAS touchés ici — un nouveau parc doit les
-- fournir explicitement (architecture mondiale). Le backfill 'FR'/'Europe/Paris'
-- ne concerne QUE les 17 lignes historiques (section 2 de cette migration).
-- Aucune boucle : uniquement des affectations sur NEW dans un trigger BEFORE.
create or replace function parks_v1_compat() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    -- géographie : latitude/longitude (v2) canoniques ; à défaut, dérivées de lat/lng
    new.latitude  := coalesce(new.latitude, new.lat::numeric(9,6));
    new.longitude := coalesce(new.longitude, new.lng::numeric(9,6));
    new.lat := new.latitude;
    new.lng := new.longitude;

    -- adresse
    new.address_line := coalesce(new.address_line, nullif(new.formatted_address, ''));
    new.formatted_address := coalesce(nullif(new.formatted_address, ''),
                                      new.address_line, new.city, new.name, '—');

    -- âges : min_age/max_age (v2) canoniques ; les valeurs par défaut V1 (0 / 12)
    -- ne sont pas traitées comme une saisie explicite.
    new.min_age := coalesce(new.min_age, nullif(new.age_min, 0));
    new.max_age := coalesce(new.max_age, nullif(new.age_max, 12));
    new.age_min := coalesce(new.min_age, new.age_min);
    new.age_max := coalesce(new.max_age, new.age_max);

    -- statut : moderation_status (v2) canonique. Un INSERT purement V1 (status
    -- fourni, moderation_status resté au défaut 'pending') impose son status.
    if new.status <> 'pending' and new.moderation_status = 'pending' then
      new.moderation_status := new.status::text::park_moderation_status;
    end if;
    new.status := new.moderation_status::text::park_status;
  else
    -- UPDATE : la colonne explicitement modifiée gagne
    if new.latitude is distinct from old.latitude then new.lat := new.latitude;
    elsif new.lat is distinct from old.lat then new.latitude := new.lat::numeric(9,6); end if;

    if new.longitude is distinct from old.longitude then new.lng := new.longitude;
    elsif new.lng is distinct from old.lng then new.longitude := new.lng::numeric(9,6); end if;

    if new.address_line is distinct from old.address_line then
      new.formatted_address := coalesce(nullif(new.address_line, ''), new.formatted_address);
    elsif new.formatted_address is distinct from old.formatted_address then
      new.address_line := nullif(new.formatted_address, '');
    end if;

    if new.min_age is distinct from old.min_age then new.age_min := coalesce(new.min_age, 0);
    elsif new.age_min is distinct from old.age_min then new.min_age := nullif(new.age_min, 0); end if;

    if new.max_age is distinct from old.max_age then new.age_max := coalesce(new.max_age, 12);
    elsif new.age_max is distinct from old.age_max then new.max_age := nullif(new.age_max, 12); end if;

    if new.moderation_status is distinct from old.moderation_status then
      new.status := new.moderation_status::text::park_status;
    elsif new.status is distinct from old.status then
      new.moderation_status := new.status::text::park_moderation_status;
    end if;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists parks_v1_compat_biu on parks;
create trigger parks_v1_compat_biu
  before insert or update on parks
  for each row execute function parks_v1_compat();

-- ── Assertions ───────────────────────────────────────────────────────────
do $$
declare
  c_total int; c_bad_geo int; c_bad_status int; c_bad_age int; c_null_cc int;
begin
  select count(*) into c_total from parks;

  -- latitude/longitude backfillés et cohérents avec lat/lng
  select count(*) into c_bad_geo from parks
   where latitude is null or longitude is null
      or latitude  is distinct from lat::numeric(9,6)
      or longitude is distinct from lng::numeric(9,6);
  if c_bad_geo > 0 then
    raise exception '0009: % parcs avec latitude/longitude non backfillés depuis lat/lng', c_bad_geo;
  end if;

  -- moderation_status == status (mêmes libellés d''enum)
  select count(*) into c_bad_status from parks
   where moderation_status::text is distinct from status::text;
  if c_bad_status > 0 then
    raise exception '0009: % parcs avec moderation_status != status', c_bad_status;
  end if;

  -- min_age/max_age == age_min/age_max
  select count(*) into c_bad_age from parks
   where min_age is distinct from age_min or max_age is distinct from age_max;
  if c_bad_age > 0 then
    raise exception '0009: % parcs avec min_age/max_age != age_min/age_max', c_bad_age;
  end if;

  -- country_code / timezone NOT NULL pour tous
  select count(*) into c_null_cc from parks where country_code is null or timezone is null;
  if c_null_cc > 0 then
    raise exception '0009: % parcs sans country_code/timezone', c_null_cc;
  end if;

  -- country_code / timezone ne doivent PAS avoir de DEFAULT (schéma mondial)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parks'
      and column_name in ('country_code','timezone') and column_default is not null
  ) then
    raise exception '0009: country_code/timezone ne doivent pas avoir de DEFAULT';
  end if;

  -- le trigger de compat NE DOIT PAS injecter 'FR' / 'Europe/Paris'
  if pg_get_functiondef('parks_v1_compat()'::regprocedure) ~* 'Europe/Paris|''FR''' then
    raise exception '0009: parks_v1_compat() injecte country_code/timezone — interdit';
  end if;

  raise notice '0009 OK — % parcs migrés (aucun perdu), geo/status/ages cohérents V1<->v2', c_total;
end $$;
