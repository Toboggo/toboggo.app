-- ════════════════════════════════════════════════════════════════════════════
-- Seed data. Team members / reviews are not seeded (they need real auth.users
-- rows created via Supabase Auth). Create those through the app.
-- ════════════════════════════════════════════════════════════════════════════

-- ── §3 Feature catalogue (universal codes; labels translated in the UI) ──
insert into features (code, category, label_key, icon_key, value_set, sort_order) values
  -- play
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
  -- service
  ('toilets',        'service', 'feature.toilets',        'toilet',   null, 200),
  ('drinking_water', 'service', 'feature.drinking_water', 'tap',      null, 210),
  ('parking',        'service', 'feature.parking',        'parking',  null, 220),
  ('benches',        'service', 'feature.benches',        'bench',    null, 230),
  ('picnic_tables',  'service', 'feature.picnic_tables',  'picnic',   null, 240),
  ('lighting',       'service', 'feature.lighting',       'light',    null, 250),
  ('bike_parking',   'service', 'feature.bike_parking',   'bike',     null, 260),
  -- §8 environment (enumerated attributes)
  ('fence_status',  'environment', 'feature.fence_status',  'fence',
     '{fully_fenced,partially_fenced,not_fenced,unknown}', 300),
  ('shade_level',   'environment', 'feature.shade_level',   'tree',
     '{none,partial,mostly_shaded,fully_shaded,unknown}', 310),
  ('surface_type',  'environment', 'feature.surface_type',  'ground',
     '{rubber,sand,grass,wood_chips,gravel,concrete,mixed,unknown}', 320),
  -- §7/§8 accessibility
  ('wheelchair_access',  'accessibility', 'feature.wheelchair_access',  'wheelchair', null, 400),
  ('stroller_access',    'accessibility', 'feature.stroller_access',    'stroller',   null, 410),
  ('accessible_toilets', 'accessibility', 'feature.accessible_toilets', 'toilet',     null, 420),
  ('accessible_parking', 'accessibility', 'feature.accessible_parking', 'parking',    null, 430),
  ('inclusive_play',     'accessibility', 'feature.inclusive_play',     'inclusive',  null, 440)
on conflict (code) do nothing;

-- ── §17 Organisations ──────────────────────────────────────────────────
insert into organizations (id, name, type, country_code, contact_email) values
  ('00000000-0000-0000-0000-000000000001', 'Ville de Lyon', 'municipality', 'FR', 'contact@lyon.fr'),
  ('00000000-0000-0000-0000-000000000002', 'Ville de Bordeaux', 'municipality', 'FR', 'contact@bordeaux.fr')
on conflict (id) do nothing;

-- ── Coexistence V1 : lignes `communes` legacy correspondantes ───────────
-- `organizations.id = communes.id` (UUID préservés). Les triggers *_v1_compat
-- (team_members / maintenance / activity_log) mettent `commune_id := organization_id`
-- et les FK `*.commune_id → communes.id` doivent être satisfaites pendant la
-- coexistence. `communes` n'est PAS canonique V2 : le seed la garde seulement
-- alignée sur les organizations de type `municipality` issues de l'ancien modèle.
insert into communes (id, name, contact_email) values
  ('00000000-0000-0000-0000-000000000001', 'Ville de Lyon', 'contact@lyon.fr'),
  ('00000000-0000-0000-0000-000000000002', 'Ville de Bordeaux', 'contact@bordeaux.fr')
on conflict (id) do nothing;
