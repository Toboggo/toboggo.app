-- ════════════════════════════════════════════════════════════════════════════
-- 0010 — Catalogue `features` + lien `park_features` + backfill depuis les
--        colonnes plates V1 (wc/shade/fenced/pmr/benches/water/parking,
--        surface, play_equipment[]).
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF — les colonnes V1 de `parks` sont conservées.
-- Idempotent : `create table if not exists`, `on conflict do nothing`.
--
-- RÈGLES DE MAPPING (fournies, à ne PAS réinterpréter) :
--   booléens wc / benches / water / parking / pmr :
--     true  -> status 'available'
--     false -> status 'unknown'        (JAMAIS 'unavailable')
--   shade : true  -> shade_level available value 'partial'
--           false -> shade_level unknown   value NULL   (jamais fully_shaded)
--   fenced: true  -> fence_status available value 'partially_fenced'
--           false -> fence_status unknown   value NULL   (jamais fully_fenced)
--   surface : gazon->grass, sable->sand, sol_souple->rubber (status available)
--             non_precise -> surface_type status 'unknown' value NULL
--   play_equipment[] : toboggan->slide, springs->springer, waterplay->water_play,
--             motorcourse->motor_course ; swing/sandbox/climbing/carousel/
--             multisport/zipline -> identique ; status 'available'
-- ════════════════════════════════════════════════════════════════════════════

-- ── §3 Catalogue ─────────────────────────────────────────────────────────
create table if not exists features (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category feature_category not null,
  label_key text not null,
  icon_key text,
  value_set text[],
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── §3 §4 §8 Lien park ↔ feature ────────────────────────────────────────
create table if not exists park_features (
  park_id uuid not null references parks(id) on delete cascade,
  feature_id uuid not null references features(id) on delete cascade,
  status feature_status not null default 'unknown',
  value text,
  quantity int,
  note text,
  source_id uuid,   -- FK ajoutée en 0012 quand park_sources existe
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (park_id, feature_id)
);
create index if not exists park_features_feature_idx on park_features (feature_id);

-- ── Seed du catalogue v2 (identique à supabase/seed.sql) ────────────────
insert into features (code, category, label_key, icon_key, value_set, sort_order) values
  ('slide',        'play',    'feature.slide',        'slide',      null, 10),
  ('swing',        'play',    'feature.swing',        'swing',      null, 20),
  ('climbing',     'play',    'feature.climbing',     'climbing',   null, 30),
  ('sandbox',      'play',    'feature.sandbox',      'sandbox',    null, 40),
  ('springer',     'play',    'feature.springer',     'spring',     null, 50),
  ('zipline',      'play',    'feature.zipline',      'zipline',    null, 60),
  ('carousel',     'play',    'feature.carousel',     'carousel',   null, 70),
  ('motor_course', 'play',    'feature.motor_course', 'bike',       null, 80),
  ('multisport',   'play',    'feature.multisport',   'ball',       null, 90),
  ('water_play',   'play',    'feature.water_play',   'water',      null, 100),
  ('toilets',        'service', 'feature.toilets',        'toilet',  null, 200),
  ('drinking_water', 'service', 'feature.drinking_water', 'tap',     null, 210),
  ('parking',        'service', 'feature.parking',        'parking', null, 220),
  ('benches',        'service', 'feature.benches',        'bench',   null, 230),
  ('picnic_tables',  'service', 'feature.picnic_tables',  'picnic',  null, 240),
  ('lighting',       'service', 'feature.lighting',       'light',   null, 250),
  ('bike_parking',   'service', 'feature.bike_parking',   'bike',    null, 260),
  ('fence_status',  'environment', 'feature.fence_status',  'fence',
     '{fully_fenced,partially_fenced,not_fenced,unknown}', 300),
  ('shade_level',   'environment', 'feature.shade_level',   'tree',
     '{none,partial,mostly_shaded,fully_shaded,unknown}', 310),
  ('surface_type',  'environment', 'feature.surface_type',  'ground',
     '{rubber,sand,grass,wood_chips,gravel,concrete,mixed,unknown}', 320),
  ('wheelchair_access',  'accessibility', 'feature.wheelchair_access',  'wheelchair', null, 400),
  ('stroller_access',    'accessibility', 'feature.stroller_access',    'stroller',   null, 410),
  ('accessible_toilets', 'accessibility', 'feature.accessible_toilets', 'toilet',     null, 420),
  ('accessible_parking', 'accessibility', 'feature.accessible_parking', 'parking',    null, 430),
  ('inclusive_play',     'accessibility', 'feature.inclusive_play',     'inclusive',  null, 440)
on conflict (code) do nothing;

-- ── Backfill : booléens de présence (true->available, false->unknown) ──
insert into park_features (park_id, feature_id, status)
select p.id, f.id,
       (case when p.wc then 'available' else 'unknown' end)::feature_status
from parks p join features f on f.code = 'toilets'
on conflict (park_id, feature_id) do nothing;

insert into park_features (park_id, feature_id, status)
select p.id, f.id,
       (case when p.benches then 'available' else 'unknown' end)::feature_status
from parks p join features f on f.code = 'benches'
on conflict (park_id, feature_id) do nothing;

insert into park_features (park_id, feature_id, status)
select p.id, f.id,
       (case when p.water then 'available' else 'unknown' end)::feature_status
from parks p join features f on f.code = 'drinking_water'
on conflict (park_id, feature_id) do nothing;

insert into park_features (park_id, feature_id, status)
select p.id, f.id,
       (case when p.parking then 'available' else 'unknown' end)::feature_status
from parks p join features f on f.code = 'parking'
on conflict (park_id, feature_id) do nothing;

insert into park_features (park_id, feature_id, status)
select p.id, f.id,
       (case when p.pmr then 'available' else 'unknown' end)::feature_status
from parks p join features f on f.code = 'wheelchair_access'
on conflict (park_id, feature_id) do nothing;

-- ── Backfill : shade -> shade_level ────────────────────────────────────
insert into park_features (park_id, feature_id, status, value)
select p.id, f.id,
       (case when p.shade then 'available' else 'unknown' end)::feature_status,
       (case when p.shade then 'partial' else null end)
from parks p join features f on f.code = 'shade_level'
on conflict (park_id, feature_id) do nothing;

-- ── Backfill : fenced -> fence_status ─────────────────────────────────
insert into park_features (park_id, feature_id, status, value)
select p.id, f.id,
       (case when p.fenced then 'available' else 'unknown' end)::feature_status,
       (case when p.fenced then 'partially_fenced' else null end)
from parks p join features f on f.code = 'fence_status'
on conflict (park_id, feature_id) do nothing;

-- ── Backfill : surface -> surface_type ───────────────────────────────
insert into park_features (park_id, feature_id, status, value)
select p.id, f.id,
       (case when p.surface = 'non_precise' then 'unknown' else 'available' end)::feature_status,
       (case p.surface
          when 'gazon'      then 'grass'
          when 'sable'      then 'sand'
          when 'sol_souple' then 'rubber'
          else null end)
from parks p join features f on f.code = 'surface_type'
on conflict (park_id, feature_id) do nothing;

-- ── Backfill : play_equipment[] -> features catégorie play ──────────
insert into park_features (park_id, feature_id, status)
select p.id, f.id, 'available'::feature_status
from parks p
cross join lateral unnest(p.play_equipment) as pe(code)
join features f on f.code = (case pe.code
    when 'toboggan'    then 'slide'
    when 'springs'     then 'springer'
    when 'waterplay'   then 'water_play'
    when 'motorcourse' then 'motor_course'
    else pe.code end)
on conflict (park_id, feature_id) do nothing;

-- ── Assertions ─────────────────────────────────────────────────────────
do $$
declare
  c_parks int;
  c_always int;             -- park_features attendus pour les 8 features "toujours renseignées"
  c_bad_unavailable int;
  c_bad_shade int; c_bad_fence int; c_bad_surface int;
  c_unmapped_play int;
  c_play_src int; c_play_dst int;
begin
  select count(*) into c_parks from parks;

  -- 1. aucun parc perdu / créé par ce lot
  --    (la migration ne touche que features/park_features)
  --    -> vérifié indirectement : parks inchangé, cf. 0009

  -- 2. les 8 features "toujours renseignées" existent pour chaque parc
  select count(*) into c_always
  from park_features pf join features f on f.id = pf.feature_id
  where f.code in ('toilets','benches','drinking_water','parking',
                   'wheelchair_access','shade_level','fence_status','surface_type');
  if c_always <> c_parks * 8 then
    raise exception '0010: attendu % lignes park_features (8/parc), obtenu %', c_parks * 8, c_always;
  end if;

  -- 3. RÈGLE : jamais false -> 'unavailable' sur les booléens de présence
  select count(*) into c_bad_unavailable
  from park_features pf join features f on f.id = pf.feature_id
  where f.code in ('toilets','benches','drinking_water','parking','wheelchair_access')
    and pf.status = 'unavailable';
  if c_bad_unavailable > 0 then
    raise exception '0010: % park_features de présence en statut unavailable (interdit)', c_bad_unavailable;
  end if;

  -- 4. shade_level : value ∈ {partial, NULL} uniquement
  select count(*) into c_bad_shade
  from park_features pf join features f on f.id = pf.feature_id
  where f.code = 'shade_level' and pf.value is not null and pf.value <> 'partial';
  if c_bad_shade > 0 then
    raise exception '0010: % shade_level avec une value != partial (fully_shaded interdit)', c_bad_shade;
  end if;

  -- 5. fence_status : value ∈ {partially_fenced, NULL} uniquement
  select count(*) into c_bad_fence
  from park_features pf join features f on f.id = pf.feature_id
  where f.code = 'fence_status' and pf.value is not null and pf.value <> 'partially_fenced';
  if c_bad_fence > 0 then
    raise exception '0010: % fence_status avec une value != partially_fenced (fully_fenced interdit)', c_bad_fence;
  end if;

  -- 6. surface_type : value ∈ {grass, sand, rubber, NULL}
  select count(*) into c_bad_surface
  from park_features pf join features f on f.id = pf.feature_id
  where f.code = 'surface_type' and pf.value is not null
    and pf.value not in ('grass','sand','rubber');
  if c_bad_surface > 0 then
    raise exception '0010: % surface_type avec une value hors {grass,sand,rubber}', c_bad_surface;
  end if;

  -- 7. tout code play_equipment V1 mappe vers un feature existant
  select count(*) into c_unmapped_play
  from parks p
  cross join lateral unnest(p.play_equipment) as pe(code)
  where not exists (
    select 1 from features f where f.code = (case pe.code
      when 'toboggan' then 'slide' when 'springs' then 'springer'
      when 'waterplay' then 'water_play' when 'motorcourse' then 'motor_course'
      else pe.code end));
  if c_unmapped_play > 0 then
    raise exception '0010: % codes play_equipment V1 non mappés vers un feature', c_unmapped_play;
  end if;

  -- 8. cohérence du nombre de features "play" migrées
  select count(*) into c_play_src
    from (select distinct p.id,
            (case pe.code when 'toboggan' then 'slide' when 'springs' then 'springer'
                          when 'waterplay' then 'water_play' when 'motorcourse' then 'motor_course'
                          else pe.code end) as code
          from parks p cross join lateral unnest(p.play_equipment) as pe(code)) s;
  select count(*) into c_play_dst
    from park_features pf join features f on f.id = pf.feature_id
    where f.category = 'play' and pf.status = 'available';
  if c_play_dst < c_play_src then
    raise exception '0010: % park_features play < % paires (parc,code) sources', c_play_dst, c_play_src;
  end if;

  raise notice '0010 OK — % parcs ; % park_features "toujours" ; % features play (>= % sources) ; règles booléens/shade/fence/surface respectées',
    c_parks, c_always, c_play_dst, c_play_src;
end $$;
