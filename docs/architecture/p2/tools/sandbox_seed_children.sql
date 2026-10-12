set session_replication_role = replica;
-- one row per child table on a spread of parks (published + pending + fixtures), ~1 park out of 10
insert into park_names (park_id, lang, name) select id, 'en', name||' en' from parks where abs(hashtext(id::text))%10=0 or id in (select park_id from organization_parks) or commune_id is not null or created_by is not null;
insert into park_scores (park_id, algorithm_version, overall_score) select id, 'v1', 50 from parks where abs(hashtext(id::text))%10=1 or id in (select park_id from organization_parks) or commune_id is not null or created_by is not null;
insert into park_equipment (park_id) select id from parks where abs(hashtext(id::text))%10=2 or id in (select park_id from organization_parks) or commune_id is not null or created_by is not null;
insert into park_zones (park_id, name) select id, 'z' from parks where abs(hashtext(id::text))%10=3 or id in (select park_id from organization_parks) or commune_id is not null or created_by is not null;
insert into park_opening_hours (park_id, opening_hours, timezone) select id, 'Mo-Su 08:00-20:00', 'UTC' from parks where abs(hashtext(id::text))%10=4 or id in (select park_id from organization_parks) or commune_id is not null or created_by is not null;
insert into park_entrances (park_id, location) select id, st_setsrid(st_makepoint(2.3,48.8),4326)::geography from parks where abs(hashtext(id::text))%10=5 or id in (select park_id from organization_parks) or commune_id is not null or created_by is not null;
analyze;
