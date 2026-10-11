-- ════════════════════════════════════════════════════════════════════════════
-- CONTRÔLES APRÈS IMPORT New York (PROD) — LECTURE SEULE (SELECT uniquement).
-- À coller dans le SQL Editor PROD requête par requête. Valeurs attendues en commentaire
-- (import `--commit` SANS `--publish`, PBF new-york-261004, état avant : 2 216 parcs FR).
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Parcs US : 6 778, tous pending / unverified, sans créateur, pays + fuseau corrects
select count(*) as us, count(*) filter (where moderation_status = 'pending') as pending,
       count(*) filter (where moderation_status <> 'pending') as non_pending,          -- attendu 0
       count(*) filter (where verification_status = 'unverified') as unverified,
       count(*) filter (where created_by is null) as sans_createur,
       count(*) filter (where timezone = 'America/New_York') as tz_ny,
       count(*) filter (where operational_status <> 'active') as non_actifs               -- attendu 0
  from parks where country_code = 'US';                       -- attendu : 6778 / 6778 / 0 / 6778 / 6778 / 6778 / 0

-- 2. FR inchangés : mêmes statuts qu'avant (2202 published, 5 pending, 6 rejected, 3 blocked ; total 2216)
select country_code, moderation_status, count(*) from parks where country_code <> 'US' group by 1, 2 order by 1, 2;

-- 3. Empreinte des parcs hors US = celle de l'état avant (791ab4871f929d02607c0d6a0b670f68 au 2026-10-11)
select md5(coalesce(string_agg(id::text||'|'||name||'|'||moderation_status::text||'|'||coalesce(address_line,'')||'|'||coalesce(city,'')||'|'||latitude::text||'|'||longitude::text, ';' order by id), '')) as h, count(*)
  from parks where country_code <> 'US';

-- 4. Identités OSM : 2 201 + 6 778 = 8 979 ; 0 doublon ; tous les US rattachés
select count(*) as osm_total, count(distinct external_id) as distincts,
       count(*) filter (where p.country_code = 'US') as us
  from external_ids e join parks p on p.id = e.park_id where e.provider = 'osm';   -- 8979 / 8979 / 6778

-- 5. Noms : 676 vrais noms OSM (avec provenance osm sur `name`), 6 102 « Playground » SANS provenance
select count(*) filter (where p.name = 'Playground') as playground,                  -- attendu 6102
       (select count(*) from park_attribute_sources pas join parks q on q.id = pas.park_id
          join park_sources ps on ps.id = pas.source_id
         where q.country_code = 'US' and pas.attribute_key = 'name' and ps.source_type = 'osm') as noms_osm_provenance  -- 676
  from parks p where p.country_code = 'US';

-- 6. Sources US : uniquement osm (6 778) ; aucune humaine
select ps.source_type, count(*) from park_sources ps join parks p on p.id = ps.park_id where p.country_code = 'US' group by 1;

-- 7. Équipements US (available) : swing 34, water_play 29, play_structure 22, slide 7, climbing 5, seesaw 1, sandbox 1 ;
--    attributs : surface_type 319, fence_status 28, wheelchair_access 66 (toutes valeurs)
select f.code, count(*) filter (where pf.status = 'available') as available, count(*) as total
  from park_features pf join features f on f.id = pf.feature_id join parks p on p.id = pf.park_id
 where p.country_code = 'US' group by 1 order by 2 desc;

-- 8. Coordonnées : toutes dans l'emprise de l'État de New York (attendu hors_emprise = 0)
select count(*) filter (where not (latitude between 40.4 and 45.1 and longitude between -79.9 and -71.6)) as hors_emprise,
       count(*) filter (where latitude = 0 and longitude = 0) as zero_zero
  from parks where country_code = 'US';

-- 9. Adresses US OSM (14 attendues avec champs adresse ; format 0049 « rue, ville, ÉTAT ZIP »)
select address_line, city, admin_area_1, postal_code, formatted_address
  from park_public where country_code = 'US' and (address_line is not null or city is not null or postal_code is not null) order by 1 limit 20;

-- 10. EXPOSITION : sous le rôle anon, AUCUN parc US pending n'est visible (tout attendu = 0)
begin read only;
set local role anon;
select (select count(*) from park_public where country_code = 'US') as park_public_us,
       (select count(*) from parks where country_code = 'US') as parks_us,
       (select count(*) from external_ids e join parks p on p.id = e.park_id where p.country_code = 'US') as external_ids_us,
       (select count(*) from nearby_parks(40.758, -73.9855, 20000)) as nearby_manhattan,
       (select count(*) from nearby_parks_page(40.758, -73.9855, 20000, 1000)) as page_manhattan,
       (select count(*) from park_public where name ilike '%playground%' and country_code = 'US') as recherche_us;
rollback;

-- 11. Fonctions et vue inchangées (afaf1b9b… / f9de4da3… / ca4d34b8…)
select proname, md5(pg_get_functiondef(oid)) from pg_proc where proname in ('nearby_parks','nearby_parks_page') order by 1;
select md5(pg_get_viewdef('public.park_public'::regclass, true));

-- 12. Volumétrie : parcs 8 994 ; audit_log ≈ +6 778 ; taille base (36 Mo avant)
select (select count(*) from parks) as parcs, (select count(*) from audit_log) as audit_log,
       pg_size_pretty(pg_database_size(current_database())) as taille_db;
