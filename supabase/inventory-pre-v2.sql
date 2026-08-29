-- ============================================================================
-- Toboggo — Inventaire READ-ONLY de la base V1 (pré-migration mondiale v2)
-- ============================================================================
-- À exécuter tel quel dans le SQL Editor Supabase (projet lié).
--
-- STRICTEMENT LECTURE SEULE. Ce fichier ne contient QUE des SELECT.
--   Aucun INSERT / UPDATE / DELETE / MERGE
--   Aucun CREATE / ALTER / DROP / TRUNCATE
--   Aucun GRANT / REVOKE
--   Aucun bloc DO, aucune fonction à effet de bord
--   Uniquement des fonctions pures : count, min, max, unnest,
--   jsonb_object_keys, jsonb_typeof, split_part, string_to_array,
--   array_length, cardinality, coalesce, exists.
--
-- Résultat : UNE seule grille de résultats, colonnes
--   section | metric | value_num | value_txt
-- triée par section puis par fréquence décroissante.
-- La dernière ligne (section 12) confirme que le script est allé au bout.
-- ============================================================================

with

-- ── SECTION 1 — COUNTS TABLES ───────────────────────────────────────────────
s01 as (
  select '01_counts'::text as section, t as metric, c::numeric as value_num, null::text as value_txt
  from (
    select 'communes'         as t, (select count(*) from communes)         as c union all
    select 'profiles',              (select count(*) from profiles)              union all
    select 'team_members',          (select count(*) from team_members)          union all
    select 'parks',                 (select count(*) from parks)                 union all
    select 'park_edit_history',     (select count(*) from park_edit_history)     union all
    select 'reviews',               (select count(*) from reviews)               union all
    select 'reports',               (select count(*) from reports)               union all
    select 'maintenance',           (select count(*) from maintenance)           union all
    select 'notifications',         (select count(*) from notifications)         union all
    select 'activity_log',          (select count(*) from activity_log)          union all
    select 'groups',                (select count(*) from groups)                union all
    select 'group_members',         (select count(*) from group_members)         union all
    select 'contact_messages',      (select count(*) from contact_messages)
  ) x
),

-- ── SECTION 2 — PARKS ──────────────────────────────────────────────────────
s02 as (
  select '02_parks'::text as section, m as metric, v::numeric as value_num, null::text as value_txt
  from (
    select 'total_parks'                   as m, count(*)                                                             as v from parks union all
    select 'with_commune',                     count(*) filter (where commune_id is not null)                             from parks union all
    select 'without_commune',                  count(*) filter (where commune_id is null)                                 from parks union all
    select 'with_photos',                      count(*) filter (where coalesce(cardinality(photos), 0) > 0)               from parks union all
    select 'with_play_equipment',              count(*) filter (where coalesce(cardinality(play_equipment), 0) > 0)       from parks union all
    select 'wc_true',                          count(*) filter (where wc)                                                 from parks union all
    select 'shade_true',                       count(*) filter (where shade)                                              from parks union all
    select 'fenced_true',                      count(*) filter (where fenced)                                             from parks union all
    select 'pmr_true',                         count(*) filter (where pmr)                                                from parks union all
    select 'benches_true',                     count(*) filter (where benches)                                            from parks union all
    select 'water_true',                       count(*) filter (where water)                                              from parks union all
    select 'parking_true',                     count(*) filter (where parking)                                            from parks union all
    select 'formatted_address_null_or_empty',  count(*) filter (where formatted_address is null
                                                                    or btrim(formatted_address) = '')                    from parks union all
    select 'lat_null',                         count(*) filter (where lat is null)                                        from parks union all
    select 'lng_null',                         count(*) filter (where lng is null)                                        from parks union all
    select 'invalid_lat',                      count(*) filter (where lat is null or lat < -90  or lat > 90)              from parks union all
    select 'invalid_lng',                      count(*) filter (where lng is null or lng < -180 or lng > 180)             from parks union all
    select 'geom_null',                        count(*) filter (where geom is null)                                       from parks union all
    select 'min_age_found',                    min(age_min)                                                              from parks union all
    select 'max_age_found',                    max(age_max)                                                              from parks
  ) x
),

-- ── SECTION 3 — PARK SURFACE ──────────────────────────────────────────────
s03 as (
  select '03_surface'::text as section,
         coalesce(surface::text, '(null)') as metric,
         count(*)::numeric as value_num,
         null::text as value_txt
  from parks
  group by surface
),

-- ── SECTION 4 — PARK STATUS ───────────────────────────────────────────────
s04 as (
  select '04_status'::text as section,
         coalesce(status::text, '(null)') as metric,
         count(*)::numeric as value_num,
         null::text as value_txt
  from parks
  group by status
),

-- ── SECTION 5 — PLAY EQUIPMENT (toutes les valeurs distinctes présentes) ──
s05 as (
  select '05_play_equipment'::text as section,
         pe.val as metric,
         count(*)::numeric as value_num,
         null::text as value_txt
  from parks p
  cross join lateral unnest(p.play_equipment) as pe(val)
  group by pe.val
),

-- ── SECTION 6 — COMMUNES (pas d'emails) ──────────────────────────────────
s06 as (
  select '06_communes'::text as section, m as metric, v::numeric as value_num, null::text as value_txt
  from (
    select 'total'               as m, count(*)                                                                  as v from communes union all
    select 'with_contact_email',      count(*) filter (where contact_email is not null and btrim(contact_email) <> '') from communes union all
    select 'without_contact_email',   count(*) filter (where contact_email is null or btrim(contact_email) = '')       from communes
  ) x
),

-- ── SECTION 7 — TEAM MEMBERS (pas d'emails) ──────────────────────────────
s07a as (
  select '07_team_members'::text as section, m as metric, v::numeric as value_num, null::text as value_txt
  from (
    select 'total'              as m, count(*)                                        as v from team_members union all
    select 'with_user_id',           count(*) filter (where user_id is not null)           from team_members union all
    select 'without_user_id',        count(*) filter (where user_id is null)               from team_members union all
    select 'with_commune_id',        count(*) filter (where commune_id is not null)        from team_members union all
    select 'without_commune_id',     count(*) filter (where commune_id is null)            from team_members
  ) x
),
s07b as (
  select '07_team_roles'::text as section,
         coalesce(role::text, '(null)') as metric,
         count(*)::numeric as value_num,
         null::text as value_txt
  from team_members
  group by role
),

-- ── SECTION 8 — REVIEWS (pas de commentaires) ───────────────────────────
s08a as (
  select '08_reviews'::text as section, m as metric, v::numeric as value_num, null::text as value_txt
  from (
    select 'total_reviews'    as m, count(*)                                                            as v from reviews union all
    select 'with_sub_ratings',     count(*) filter (where sub_ratings is not null)                           from reviews union all
    select 'flagged',              count(*) filter (where flagged)                                           from reviews union all
    select 'with_photo',           count(*) filter (where photo is not null and btrim(photo) <> '')          from reviews union all
    select 'with_reply',           count(*) filter (where reply is not null and btrim(reply) <> '')          from reviews
  ) x
),
s08b as (
  select '08_reviews_stars'::text as section,
         stars::text as metric,
         count(*)::numeric as value_num,
         null::text as value_txt
  from reviews
  group by stars
),
s08c as (
  select '08_reviews_age_band'::text as section,
         coalesce(age_band::text, '(null)') as metric,
         count(*)::numeric as value_num,
         null::text as value_txt
  from reviews
  group by age_band
),
s08d as (
  select '08_reviews_subrating_keys'::text as section,
         kv.key as metric,
         count(*)::numeric as value_num,
         null::text as value_txt
  from reviews r
  cross join lateral jsonb_object_keys(r.sub_ratings) as kv(key)
  where r.sub_ratings is not null
    and jsonb_typeof(r.sub_ratings) = 'object'
  group by kv.key
),

-- ── SECTION 9 — REPORTS (pas de commentaires) ──────────────────────────
s09a as (
  select '09_reports'::text as section, m as metric, v::numeric as value_num, null::text as value_txt
  from (
    select 'total_reports'  as m, count(*)                                                          as v from reports union all
    select 'with_equipment',     count(*) filter (where equipment is not null and btrim(equipment) <> '') from reports union all
    select 'with_comment',       count(*) filter (where comment   is not null and btrim(comment)   <> '') from reports union all
    select 'with_photo',         count(*) filter (where photo     is not null and btrim(photo)     <> '') from reports union all
    select 'resolved',           count(*) filter (where status = 'resolved')                              from reports
  ) x
),
s09b as (
  select '09_reports_reason'::text as section,
         coalesce(reason::text, '(null)') as metric,
         count(*)::numeric as value_num,
         null::text as value_txt
  from reports
  group by reason
),
s09c as (
  select '09_reports_status'::text as section,
         coalesce(status::text, '(null)') as metric,
         count(*)::numeric as value_num,
         null::text as value_txt
  from reports
  group by status
),

-- ── SECTION 10 — ORPHELINS (counts uniquement) ─────────────────────────
s10 as (
  select '10_orphans'::text as section, m as metric, v::numeric as value_num, null::text as value_txt
  from (
    select 'reviews_without_park' as m,
           (select count(*) from reviews r
             where not exists (select 1 from parks p where p.id = r.park_id)) as v
    union all
    select 'reports_without_park',
           (select count(*) from reports r
             where not exists (select 1 from parks p where p.id = r.park_id))
    union all
    select 'maintenance_without_park',
           (select count(*) from maintenance m2
             where not exists (select 1 from parks p where p.id = m2.park_id))
    union all
    select 'parks_with_invalid_commune',
           (select count(*) from parks p
             where p.commune_id is not null
               and not exists (select 1 from communes c where c.id = p.commune_id))
    union all
    select 'team_members_with_invalid_commune',
           (select count(*) from team_members t
             where t.commune_id is not null
               and not exists (select 1 from communes c where c.id = t.commune_id))
    union all
    select 'favorite_references_total',
           (select count(*) from profiles p
             cross join lateral unnest(p.favorites) as f(pid))
    union all
    select 'favorite_references_to_missing_parks',
           (select count(*) from profiles p
             cross join lateral unnest(p.favorites) as f(pid)
             where not exists (select 1 from parks pk where pk.id = f.pid))
  ) x
),

-- ── SECTION 11 — STORAGE (lecture seule sur storage.*) ────────────────
s11a as (
  select '11_storage_objects_per_bucket'::text as section,
         b.name as metric,
         count(o.id)::numeric as value_num,
         null::text as value_txt
  from storage.buckets b
  left join storage.objects o on o.bucket_id = b.id
  group by b.name
),
s11b as (
  select '11_storage_bucket_config'::text as section,
         b.name as metric,
         null::numeric as value_num,
         ('public=' || b.public::text) as value_txt
  from storage.buckets b
),
s11c as (
  -- distribution du nombre de segments de chemin par bucket (pattern des chemins)
  select '11_storage_path_segments'::text as section,
         (o.bucket_id || ' : ' || coalesce(array_length(string_to_array(o.name, '/'), 1), 0)::text || ' segment(s)') as metric,
         count(*)::numeric as value_num,
         null::text as value_txt
  from storage.objects o
  group by o.bucket_id, coalesce(array_length(string_to_array(o.name, '/'), 1), 0)
),
s11d as (
  -- nombre de préfixes distincts (1er segment) par bucket : révèle les dossiers <uuid>/…
  select '11_storage_distinct_prefixes'::text as section,
         o.bucket_id as metric,
         count(distinct split_part(o.name, '/', 1))::numeric as value_num,
         null::text as value_txt
  from storage.objects o
  group by o.bucket_id
),

-- ── SECTION 12 — SANITY CHECK ────────────────────────────────────────
s12 as (
  select '12_sanity'::text as section,
         'inventory_complete' as metric,
         1::numeric as value_num,
         'true'::text as value_txt
)

select section, metric, value_num, value_txt
from (
  select * from s01  union all
  select * from s02  union all
  select * from s03  union all
  select * from s04  union all
  select * from s05  union all
  select * from s06  union all
  select * from s07a union all
  select * from s07b union all
  select * from s08a union all
  select * from s08b union all
  select * from s08c union all
  select * from s08d union all
  select * from s09a union all
  select * from s09b union all
  select * from s09c union all
  select * from s10  union all
  select * from s11a union all
  select * from s11b union all
  select * from s11c union all
  select * from s11d union all
  select * from s12
) all_sections
order by section, value_num desc nulls last, metric;
