-- ════════════════════════════════════════════════════════════════════════════
-- MESURE de performance (base LOCALE uniquement, transaction annulée) —
-- `nearby_parks` avant / après la migration 0046, sous rôle `anon`.
-- ────────────────────────────────────────────────────────────────────────────
-- Génère ~85 000 parcs synthétiques publiés (≈ le volume de STAGING : zones
-- denses New York / Lyon / Barcelone + fond de carte), puis mesure
-- `EXPLAIN (ANALYZE)` à 2, 10 et 20 km autour de Manhattan, en `anon`.
-- Les chiffres dépendent de la machine : ils illustrent un ordre de grandeur,
-- ne garantissent rien sur STAGING / PROD.
--
-- USAGE :
--   ( echo 'begin;'; cat supabase/tests/nearby_parks_definer_perf.sql; \
--     echo "select * from zzz_measure('AVANT');"; \
--     cat supabase/migrations/0046_nearby_parks_definer.sql; \
--     echo "select * from zzz_measure('APRES');"; echo 'rollback;' ) \
--   | docker exec -i supabase_db_<project> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At
-- ════════════════════════════════════════════════════════════════════════════
set local session_replication_role = replica;   -- pas de triggers : insertion en masse

-- Zones denses (~1 500 parcs sur 20 km autour du centre) + fond de carte.
insert into parks (name, formatted_address, lat, lng, latitude, longitude, country_code, timezone,
                   moderation_status, status, operational_status)
select 'zzz_perf_' || i, '—', la, ln, la, ln, cc, tz, 'published', 'published', 'active'
from (
  select i, 40.758 + (random() - 0.5) * 0.30 as la, -73.9855 + (random() - 0.5) * 0.40 as ln, 'US' as cc, 'America/New_York' as tz
  from generate_series(1, 3000) i
  union all
  select 10000 + i, 45.764 + (random() - 0.5) * 0.30, 4.8357 + (random() - 0.5) * 0.40, 'FR', 'Europe/Paris'
  from generate_series(1, 2500) i
  union all
  select 20000 + i, 41.39 + (random() - 0.5) * 0.30, 2.17 + (random() - 0.5) * 0.40, 'ES', 'Europe/Madrid'
  from generate_series(1, 4500) i
  union all
  select 30000 + i, 41 + random() * 5, -80 + random() * 8, 'US', 'America/New_York'
  from generate_series(1, 38000) i
  union all
  select 80000 + i, 42 + random() * 9, -4 + random() * 12, 'FR', 'Europe/Paris'
  from generate_series(1, 37000) i
) g;
set local session_replication_role = origin;
analyze parks;

create or replace function public.zzz_measure(p_label text)
returns table (etape text, rayon_km int, parcs bigint, ms numeric, plan_parks text)
language plpgsql as $$
declare km int; plan text; t numeric; n bigint; scan text; r record;
begin
  set local role anon;
  perform set_config('request.jwt.claims', '', true);
  foreach km in array array[2, 10, 20] loop
    -- 1er passage (échauffe le cache), puis mesure
    perform count(*) from nearby_parks(40.758, -73.9855, km * 1000);
    plan := '';
    for r in execute format('explain (analyze, timing off, summary on) select * from nearby_parks(40.758, -73.9855, %s)', km * 1000) loop
      plan := plan || E'\n' || r."QUERY PLAN";
    end loop;
    t := (regexp_match(plan, 'Execution Time: ([0-9.]+) ms'))[1]::numeric;
    scan := coalesce((regexp_match(plan, '(Seq Scan|Parallel Seq Scan|Index Scan|Bitmap Heap Scan)[^\n]* on parks'))[1], 'Function Scan (DEFINER, non inliné)');
    select count(*) into n from nearby_parks(40.758, -73.9855, km * 1000);
    etape := p_label; rayon_km := km; parcs := n; ms := t; plan_parks := scan;
    return next;
  end loop;
  reset role;
end $$;
