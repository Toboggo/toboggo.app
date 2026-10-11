-- ════════════════════════════════════════════════════════════════════════════
-- ÉTAT AVANT IMPORT New York (PROD) — LECTURE SEULE. Compléter par
--   python3 scripts/osm/prod-import-snapshot.py prod --out backups/prod-ny-import-pre --exclude-country US
-- ════════════════════════════════════════════════════════════════════════════
-- 0. Horloge de la base = IMPORT_STARTED_AT à passer au rollback ciblé (noter la valeur, la copier telle quelle)
select now() as import_started_at;

-- 1. Aucun parc US ni dans l'emprise NY (attendu 0 / 0)
select (select count(*) from parks where country_code = 'US') as us,
       (select count(*) from parks where latitude between 40.4 and 45.1 and longitude between -79.9 and -71.6) as emprise_ny;

-- 2. Statuts et pays (attendu : FR published 2202, pending 5, rejected 6, blocked 3 = 2216)
select country_code, moderation_status, count(*) from parks group by 1, 2 order by 1, 2;

-- 3. Identités OSM (attendu 2201) et sources (osm 2201, reverse_geocode 2200, municipality 2, toboggo 2)
select (select count(*) from external_ids where provider = 'osm') as osm_ids;
select source_type, count(*) from park_sources group by 1 order by 1;

-- 4. Fonctions/vue (afaf1b9b…, f9de4da3…, ca4d34b8…) — doivent être identiques à l'état attendu avant de lancer
select proname, md5(pg_get_functiondef(oid)) from pg_proc where proname in ('nearby_parks','nearby_parks_page','us_state_abbr') order by 1;
select md5(pg_get_viewdef('public.park_public'::regclass, true));
