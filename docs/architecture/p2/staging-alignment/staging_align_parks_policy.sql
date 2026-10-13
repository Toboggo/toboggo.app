-- ════════════════════════════════════════════════════════════════════════════
-- ALIGNEMENT STAGING — policy `parks` : variante scindée (staging) → policy unique (prod)
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠ STAGING UNIQUEMENT. NE PAS APPLIQUER SUR LA PRODUCTION (le garde-fou refuse
--    d'ailleurs de s'exécuter si l'état de départ n'est pas exactement celui du staging).
-- Ce script N'EST PAS une migration du dépôt : il ne touche pas `schema_migrations`.
--
-- ÉTAT DE DÉPART ATTENDU (staging, constaté en lecture seule le 2026-10-12) :
--   parks_public_read  [SELECT, {public}]        = moderation_status = 'published'      (md5 004aa1d1…)
--   parks_extended_read [SELECT, {authenticated}] = created_by / EXISTS inline org / commune V1 / staff (md5 25cdb096…)
-- ÉTAT D'ARRIVÉE (identique à la PRODUCTION, md5 584ffc0f…) :
--   parks_public_read  [SELECT, {public}] = published OR created_by = auth.uid() OR can_edit_park(...)
--                                           OR (commune_id IS NOT NULL AND is_commune_member(...)) OR is_toboggo_staff(...)
--   parks_extended_read supprimée.
-- Équivalence des droits démontrée avant ce script (voir README-alignment.md) : matrice 13 profils × 15 tables
-- + écritures (420 lignes identiques) + 4 mondes aléatoires × 13 profils (104 ensembles identiques).
--
-- Une seule transaction. AUCUNE donnée métier modifiée (DDL de policy uniquement) : l'empreinte des
-- données est calculée avant/après et comparée. Dernière ligne = ROLLBACK (dry-run) ; pour appliquer,
-- utiliser staging_align_parks_policy_COMMIT.sql (même contenu, dernière ligne COMMIT).
-- Pas de `db push`, pas de `migration repair`.
-- ════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';   -- ALTER/DROP POLICY = ACCESS EXCLUSIVE sur parks : échec propre plutôt que blocage

-- 0. PRÉREQUIS / GARDE-FOUS (toute anomalie ⇒ exception ⇒ rien n'est modifié)
do $$
declare r record;
begin
  -- 0.a état exact des 2 policies de départ
  select roles::text as roles, cmd, md5(coalesce(qual,'')||'~'||coalesce(with_check,'')) as h into r
    from pg_policies where schemaname='public' and tablename='parks' and policyname='parks_public_read';
  if r is null or r.cmd <> 'SELECT' or r.roles <> '{public}' or r.h <> '004aa1d1febe30cd04b3da4f58d5f3c4' then
    raise exception 'align: parks_public_read n''est pas la variante staging attendue (%) — arrêt', r;
  end if;
  select roles::text as roles, cmd, md5(coalesce(qual,'')||'~'||coalesce(with_check,'')) as h into r
    from pg_policies where schemaname='public' and tablename='parks' and policyname='parks_extended_read';
  if r is null or r.cmd <> 'SELECT' or r.roles <> '{authenticated}' or r.h <> '25cdb096b0a46405de8a0ff9da31ee0c' then
    raise exception 'align: parks_extended_read absente ou différente de l''attendu (%) — arrêt (production ?)', r;
  end if;
  -- 0.b la table parks n'a que ces 5 policies
  if (select count(*) from pg_policies where schemaname='public' and tablename='parks') <> 5
     or (select count(*) from pg_policies where schemaname='public' and tablename='parks'
          and policyname in ('parks_delete','parks_insert','parks_update','parks_public_read','parks_extended_read')) <> 5 then
    raise exception 'align: jeu de policies de parks inattendu — arrêt';
  end if;
  -- 0.c helpers requis par la policy cible
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace
        and proname in ('can_edit_park','is_commune_member','is_toboggo_staff')) < 3 then
    raise exception 'align: helpers can_edit_park / is_commune_member / is_toboggo_staff manquants — arrêt';
  end if;
  -- 0.d RLS active sur parks, pas de FORCE
  if not exists (select 1 from pg_class where oid='public.parks'::regclass and relrowsecurity and not relforcerowsecurity) then
    raise exception 'align: RLS de parks dans un état inattendu — arrêt';
  end if;
  -- 0.e 0050 absente (ce script précède 0050 ; si 0050 est déjà là, utiliser sa propre garde)
  if exists (select 1 from pg_proc where proname in ('rls_managed_park_ids','rls_member_commune_ids')) then
    raise exception 'align: 0050 semble déjà appliquée — ce script ne s''applique qu''avant 0050';
  end if;
end $$;

-- 0.f empreintes AVANT : données métier + tout le reste des policies
create temp table _al_before on commit drop as
select
  (select count(*) from parks)                                                       as n_parks,
  (select md5(string_agg(id::text||moderation_status::text||coalesce(created_by::text,'')||coalesce(commune_id::text,'')||updated_at::text, '|' order by id)) from parks) as h_parks,
  (select count(*) from team_members)                                                as n_team,
  (select md5(string_agg(t::text, '|' order by t::text)) from team_members t)        as h_team,
  (select count(*) from organization_parks)                                          as n_op,
  (select md5(string_agg(t::text, '|' order by t::text)) from organization_parks t)  as h_op,
  (select count(*) from park_sources)                                                as n_ps,
  (select count(*) from supabase_migrations.schema_migrations)                       as n_migs,
  (select md5(string_agg(version||coalesce(name,''), '|' order by version)) from supabase_migrations.schema_migrations) as h_migs,
  (select count(*) from pg_policies where schemaname='public')                       as n_pol,
  (select md5(string_agg(tablename||policyname||cmd||roles::text||coalesce(qual,'')||coalesce(with_check,''), '|' order by tablename, policyname))
     from pg_policies where schemaname='public' and not (tablename='parks' and policyname in ('parks_public_read','parks_extended_read'))) as h_other_pol;

-- 1. CHANGEMENT (2 instructions, même transaction)
alter policy parks_public_read on public.parks
  using (
    (moderation_status = 'published'::park_moderation_status)
    or (created_by = auth.uid())
    or can_edit_park(auth.uid(), id)
    or ((commune_id is not null) and is_commune_member(auth.uid(), commune_id))
    or is_toboggo_staff(auth.uid())
  );
drop policy parks_extended_read on public.parks;

-- 2. VÉRIFICATIONS APRÈS (toute divergence ⇒ exception ⇒ tout est annulé)
do $$
declare b record; h text;
begin
  select * into b from _al_before;
  select md5(coalesce(qual,'')||'~'||coalesce(with_check,'')) into h
    from pg_policies where schemaname='public' and tablename='parks' and policyname='parks_public_read';
  if h is distinct from '584ffc0f1781e4a34503b391eb1f09be' then
    raise exception 'align: parks_public_read ≠ définition de production (%)', h;
  end if;
  if (select roles::text from pg_policies where schemaname='public' and tablename='parks' and policyname='parks_public_read') <> '{public}'
     or (select cmd from pg_policies where schemaname='public' and tablename='parks' and policyname='parks_public_read') <> 'SELECT' then
    raise exception 'align: rôles/commande de parks_public_read altérés';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='parks' and policyname='parks_extended_read')
     or (select count(*) from pg_policies where schemaname='public' and tablename='parks') <> 4 then
    raise exception 'align: parks_extended_read non supprimée / nombre de policies parks ≠ 4';
  end if;
  if (select count(*) from pg_policies where schemaname='public') <> b.n_pol - 1 then
    raise exception 'align: nombre total de policies inattendu';
  end if;
  if (select md5(string_agg(tablename||policyname||cmd||roles::text||coalesce(qual,'')||coalesce(with_check,''), '|' order by tablename, policyname))
        from pg_policies where schemaname='public' and not (tablename='parks' and policyname in ('parks_public_read','parks_extended_read')))
     is distinct from b.h_other_pol then
    raise exception 'align: une policy hors périmètre a changé';
  end if;
  -- aucune donnée métier ni historique de migrations modifié
  if (select count(*) from parks) <> b.n_parks
     or (select md5(string_agg(id::text||moderation_status::text||coalesce(created_by::text,'')||coalesce(commune_id::text,'')||updated_at::text, '|' order by id)) from parks) is distinct from b.h_parks
     or (select md5(string_agg(t::text, '|' order by t::text)) from team_members t) is distinct from b.h_team
     or (select md5(string_agg(t::text, '|' order by t::text)) from organization_parks t) is distinct from b.h_op
     or (select count(*) from park_sources) <> b.n_ps
     or (select md5(string_agg(version||coalesce(name,''), '|' order by version)) from supabase_migrations.schema_migrations) is distinct from b.h_migs then
    raise exception 'align: une donnée métier ou l''historique des migrations a changé';
  end if;
end $$;

-- 3. Résumé (dernier résultat renvoyé)
select 'ALIGN_OK' as status,
       (select count(*) from pg_policies where schemaname='public' and tablename='parks') as parks_policies,
       (select md5(coalesce(qual,'')||'~'||coalesce(with_check,'')) from pg_policies where tablename='parks' and policyname='parks_public_read') as parks_public_read_md5,
       b.n_parks, b.n_team, b.n_op, b.n_ps, b.n_migs, (select count(*) from pg_policies where schemaname='public') as policies_after
  from _al_before b;

rollback;   -- DRY-RUN. (staging_align_parks_policy_COMMIT.sql : même contenu, dernière ligne `commit;`)
