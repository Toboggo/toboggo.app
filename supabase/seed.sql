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

-- ── §1 §2 Parks (geo-first; country_code + IANA timezone mandatory) ─────
insert into parks (id, name, description, latitude, longitude, country_code, timezone,
  city, postal_code, min_age, max_age, ages_derived, moderation_status, verification_status)
values
  ('10000000-0000-0000-0000-000000000001', 'Parc de la Tête d''Or', 'Grand parc avec plusieurs aires de jeux pour tous âges.',
     45.774200, 4.854800, 'FR', 'Europe/Paris', 'Lyon', '69006', 0, 12, false, 'published', 'organization_verified'),
  ('10000000-0000-0000-0000-000000000002', 'Square Voltaire', 'Petit square de quartier, calme et ombragé.',
     45.759700, 4.856700, 'FR', 'Europe/Paris', 'Lyon', '69003', 0, 6, false, 'published', 'community_verified'),
  ('10000000-0000-0000-0000-000000000003', 'Jardin des Moineaux', null,
     45.741900, 4.831800, 'FR', 'Europe/Paris', 'Lyon', '69007', 0, 6, false, 'published', 'unverified'),
  ('10000000-0000-0000-0000-000000000004', 'Jardin Public', 'Le grand parc historique de Bordeaux.',
     44.847700, -0.575100, 'FR', 'Europe/Paris', 'Bordeaux', '33000', 0, 12, false, 'published', 'organization_verified'),
  ('10000000-0000-0000-0000-000000000005', 'Central Park Playground - Heckscher', null,
     40.769400, -73.974500, 'US', 'America/New_York', 'New York', '10019', 2, 12, false, 'published', 'unverified'),
  ('10000000-0000-0000-0000-000000000006', 'Nouveau parc en attente', 'Proposé par un habitant, en attente de vérification.',
     45.748900, 4.826700, 'FR', 'Europe/Paris', 'Lyon', '69002', 0, 6, true, 'pending', 'unverified')
on conflict (id) do nothing;

insert into organization_parks (organization_id, park_id, role, verified) values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner', true),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'owner', true),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'owner', false),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'owner', false),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'owner', true)
on conflict do nothing;

-- ── §18 A multilingual name ────────────────────────────────────────────
insert into park_names (park_id, lang, name, is_primary) values
  ('10000000-0000-0000-0000-000000000001', 'fr', 'Parc de la Tête d''Or', true),
  ('10000000-0000-0000-0000-000000000001', 'en', 'Parc de la Tête d''Or (Golden Head Park)', false),
  ('10000000-0000-0000-0000-000000000005', 'en', 'Central Park Playground - Heckscher', true)
on conflict do nothing;

-- ── §6 Zones (age ranges per zone) ─────────────────────────────────────
insert into park_zones (park_id, name, min_age, max_age, sort_order) values
  ('10000000-0000-0000-0000-000000000001', 'Aire des petits', 0, 3, 10),
  ('10000000-0000-0000-0000-000000000001', 'Aire principale', 3, 12, 20),
  ('10000000-0000-0000-0000-000000000001', 'Zone multisport', 8, 14, 30),
  ('10000000-0000-0000-0000-000000000004', 'Aire de jeux centrale', 0, 12, 10)
on conflict do nothing;

-- ── §10 Sources ───────────────────────────────────────────────────────
insert into park_sources (park_id, source_type, source_name, source_url) values
  ('10000000-0000-0000-0000-000000000001', 'municipality', 'Ville de Lyon - open data', 'https://data.grandlyon.com'),
  ('10000000-0000-0000-0000-000000000005', 'osm', 'OpenStreetMap', 'https://www.openstreetmap.org')
on conflict do nothing;

insert into external_ids (park_id, provider, external_id) values
  ('10000000-0000-0000-0000-000000000005', 'osm', 'way/123456789')
on conflict do nothing;

-- ── §3 §4 §8 park_features (status: available / unavailable / unknown …) ─
-- Parc de la Tête d'Or — well documented.
insert into park_features (park_id, feature_id, status, value, quantity)
select '10000000-0000-0000-0000-000000000001', f.id, v.status::feature_status, v.value, v.quantity
from (values
  ('slide', 'available', null, 3),
  ('swing', 'available', null, 4),
  ('climbing', 'available', null, null),
  ('sandbox', 'available', null, 1),
  ('toilets', 'available', null, null),
  ('drinking_water', 'available', null, null),
  ('parking', 'available', null, null),
  ('benches', 'available', null, null),
  ('fence_status', 'available', 'fully_fenced', null),
  ('shade_level', 'available', 'mostly_shaded', null),
  ('surface_type', 'available', 'rubber', null),
  ('wheelchair_access', 'available', null, null),
  ('stroller_access', 'available', null, null),
  ('accessible_toilets', 'unknown', null, null),
  ('inclusive_play', 'unavailable', null, null)
) as v(code, status, value, quantity)
join features f on f.code = v.code
on conflict do nothing;

-- Square Voltaire — partial data, some unknowns.
insert into park_features (park_id, feature_id, status, value, quantity)
select '10000000-0000-0000-0000-000000000002', f.id, v.status::feature_status, v.value, v.quantity
from (values
  ('swing', 'available', null, 2),
  ('springer', 'available', null, 2),
  ('toilets', 'unavailable', null, null),
  ('drinking_water', 'unknown', null, null),
  ('fence_status', 'available', 'fully_fenced', null),
  ('shade_level', 'available', 'partial', null),
  ('surface_type', 'available', 'rubber', null)
) as v(code, status, value, quantity)
join features f on f.code = v.code
on conflict do nothing;

-- Jardin Public (Bordeaux).
insert into park_features (park_id, feature_id, status, value, quantity)
select '10000000-0000-0000-0000-000000000004', f.id, v.status::feature_status, v.value, v.quantity
from (values
  ('slide', 'available', null, 2),
  ('swing', 'available', null, 3),
  ('carousel', 'available', null, 1),
  ('water_play', 'available', null, null),
  ('toilets', 'available', null, null),
  ('drinking_water', 'available', null, null),
  ('parking', 'available', null, null),
  ('benches', 'available', null, null),
  ('fence_status', 'available', 'fully_fenced', null),
  ('shade_level', 'available', 'mostly_shaded', null),
  ('surface_type', 'available', 'sand', null),
  ('wheelchair_access', 'available', null, null),
  ('stroller_access', 'available', null, null)
) as v(code, status, value, quantity)
join features f on f.code = v.code
on conflict do nothing;

-- ── §9 Opening hours ──────────────────────────────────────────────────
insert into park_opening_hours (park_id, opening_hours, timezone) values
  ('10000000-0000-0000-0000-000000000001', 'Mo-Su 06:30-22:30', 'Europe/Paris'),
  ('10000000-0000-0000-0000-000000000004', 'Mo-Su 07:00-21:00', 'Europe/Paris')
on conflict do nothing;
