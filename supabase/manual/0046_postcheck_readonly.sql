-- ════════════════════════════════════════════════════════════════════════════
-- CONTRÔLES POST-MIGRATION 0046 — LECTURE SEULE (SELECT uniquement).
-- À coller dans le SQL Editor (PROD ou STAGING) APRÈS l'application. Chaque
-- requête indique le résultat attendu. Aucune écriture.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Migration enregistrée (attendu : 1 ligne 0046 / nearby_parks_definer)
select version, name from supabase_migrations.schema_migrations where version = '0046';

-- 2. Fonctions : SECURITY DEFINER, search_path figé, propriétaire = propriétaire de parks,
--    aucun EXECUTE pour PUBLIC (attendu : secdef=true, cfg={"search_path=public, pg_temp"},
--    owner=postgres, public_exec=false, anon/authenticated/service_role=true — sur les 2 lignes)
select p.proname, p.prosecdef as secdef, p.proconfig::text as cfg, pg_get_userbyid(p.proowner) as owner,
       coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a), false) as public_exec,
       has_function_privilege('anon', p.oid, 'execute') as anon_x,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
       has_function_privilege('service_role', p.oid, 'execute') as svc_x,
       md5(pg_get_functiondef(p.oid)) as md5
from pg_proc p where p.proname in ('nearby_parks', 'nearby_parks_page') order by 1;
--    md5 attendus (identiques à STAGING validé) :
--      nearby_parks       afaf1b9b38b69bade82d7974b68c2468
--      nearby_parks_page  f9de4da3164a833dcafe5ce8f92a267d

-- 3. Une seule surcharge nearby_parks (attendu : 1)
select count(*) as nb_nearby_parks from pg_proc where proname = 'nearby_parks' and pronamespace = 'public'::regnamespace;

-- 4. Vue park_public et RLS inchangées (attendu : md5 fae08d091ae8a59acd7f4de48af8b5f8, security_invoker=true, FORCE RLS = false)
select md5(pg_get_viewdef('public.park_public'::regclass, true)) as view_md5,
       (select reloptions::text from pg_class where oid = 'public.park_public'::regclass) as view_opts,
       (select relforcerowsecurity from pg_class where oid = 'public.parks'::regclass) as parks_force_rls;

-- 5. Contrat : 43 colonnes, toutes présentes dans park_public (attendu : nb=43, hors_vue=0 ;
--    si nb=0, aucun parc dans ce rayon : changer le point)
with c as (select jsonb_object_keys(to_jsonb(t)) as k from (select * from nearby_parks(45.764, 4.8357, 20000) limit 1) t)
select (select count(*) from c) as nb,
       (select count(*) from c where k <> 'distance_m'
          and k not in (select column_name from information_schema.columns
                        where table_schema = 'public' and table_name = 'park_public')) as hors_vue;

-- 6. Rôle anon (rôle réel de l'app) : transaction en lecture seule, aucune écriture.
--    Remplacer le point par une zone où PROD a des parcs. Attendu : n > 0, 0 parc non publié,
--    durée raisonnable (< 1 s), jamais d'erreur 57014.
begin read only;
set local role anon;
select count(*) as n,
       count(*) filter (where moderation_status <> 'published' or operational_status = 'permanently_closed') as interdits
from nearby_parks(45.764, 4.8357, 20000);
rollback;

-- 7. Pagination par curseur (anon) : première page puis page suivante via (distance_m, id)
begin read only;
set local role anon;
select id, distance_m from nearby_parks_page(45.764, 4.8357, 20000, 5) order by distance_m, id;
rollback;
-- → rappeler avec les 2 derniers champs : nearby_parks_page(45.764, 4.8357, 20000, 5, <distance_m>, '<id>'::uuid)

-- 8. Aucun parc non publié dans la base proche exposé : comparer le nombre brut et le nombre exposé
select (select count(*) from parks where moderation_status = 'published' and operational_status <> 'permanently_closed'
          and ST_DWithin(location, ST_SetSRID(ST_MakePoint(4.8357, 45.764), 4326)::geography, 20000)) as attendu_publies,
       (select count(*) from nearby_parks(45.764, 4.8357, 20000)) as renvoyes;   -- égaux
