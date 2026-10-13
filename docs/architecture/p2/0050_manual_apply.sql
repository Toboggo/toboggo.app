-- LOT P2 — application MANUELLE et transactionnelle de 0050_rls_read_perf.sql
-- (staging d'abord, puis production, SEULEMENT après accord explicite du fondateur).
--
-- Usage (depuis la racine du repo ; <URL> = chaîne de connexion de l'environnement visé,
-- jamais committée) :
--   1) DRY-RUN (par défaut) — applique, vérifie, puis ROLLBACK : rien n'est conservé
--        psql "<URL>" -v ON_ERROR_STOP=1 -f docs/architecture/p2/0050_manual_apply.sql
--   2) APPLICATION RÉELLE — mêmes vérifications, puis COMMIT
--        psql "<URL>" -v ON_ERROR_STOP=1 -v commit=1 -f docs/architecture/p2/0050_manual_apply.sql
-- Une seule transaction : toute erreur (garde-fou, lock_timeout, vérification) annule tout.
-- Aucun `supabase db push`, aucun `migration repair`. La version 0050 est enregistrée dans
-- supabase_migrations.schema_migrations DANS la même transaction (donc annulée en dry-run,
-- et conservée seulement avec -v commit=1) — même format que les lignes existantes
-- (version '0050', name 'rls_read_perf', statements vide), pour que `supabase migration list`
-- voie local == remote.

\set ON_ERROR_STOP on
\if :{?commit}
\else
  \set commit 0
\endif

begin;

-- 0. Empreinte AVANT (nombre de policies + hash de leurs définitions)
create temp table _p2_before on commit drop as
  select count(*) as n_policies,
         md5(string_agg(tablename||policyname||cmd||coalesce(qual,'')||coalesce(with_check,''), '|'
                        order by tablename, policyname)) as h_all,
         md5(string_agg(tablename||policyname||cmd||coalesce(qual,'')||coalesce(with_check,''), '|'
                        order by tablename, policyname)
             filter (where not (
               (tablename = 'parks' and policyname = 'parks_public_read')
               or (tablename in ('park_sources','park_features','park_names','park_scores','external_ids',
                                 'park_attribute_sources','park_entrances','park_equipment',
                                 'park_opening_hours','park_zones')
                   and policyname ~ '_(read|write|attr_src_write)$')))) as h_untouched
    from pg_policies where schemaname = 'public';

-- 1. La migration elle-même (garde-fous + changements + vérification finale intégrés)
\ir ../../../supabase/migrations/0050_rls_read_perf.sql

-- 2. Vérifications APRÈS : seules les 21 policies visées ont changé
do $$
declare b record; a record;
begin
  select * into b from _p2_before;
  select count(*) as n_policies,
         md5(string_agg(tablename||policyname||cmd||coalesce(qual,'')||coalesce(with_check,''), '|'
                        order by tablename, policyname)
             filter (where not (
               (tablename = 'parks' and policyname = 'parks_public_read')
               or (tablename in ('park_sources','park_features','park_names','park_scores','external_ids',
                                 'park_attribute_sources','park_entrances','park_equipment',
                                 'park_opening_hours','park_zones')
                   and policyname ~ '_(read|write|attr_src_write)$')))) as h_untouched
    into a from pg_policies where schemaname = 'public';
  if a.n_policies <> b.n_policies then
    raise exception 'P2: nombre de policies modifié (% -> %)', b.n_policies, a.n_policies;
  end if;
  if a.h_untouched is distinct from b.h_untouched then
    raise exception 'P2: une policy hors périmètre a changé';
  end if;
  -- WITH CHECK des policies *_write inchangé : aucune n'a perdu sa clause
  if exists (select 1 from pg_policies where schemaname='public' and cmd='ALL'
               and policyname ~ '_(write|attr_src_write)$' and tablename like 'park\_%' and with_check is null) then
    raise exception 'P2: WITH CHECK manquant sur une policy *_write';
  end if;
  raise notice 'P2 vérifications OK : % policies, périmètre respecté', a.n_policies;
end $$;

-- 3. Enregistrement de la version (idempotent ; même transaction que les changements)
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'P2: supabase_migrations.schema_migrations introuvable — enregistrement impossible, tout est annulé';
  end if;
  insert into supabase_migrations.schema_migrations (version, name)
    values ('0050', 'rls_read_perf')
    on conflict (version) do nothing;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '0050' and name = 'rls_read_perf') then
    raise exception 'P2: la version 0050 existe déjà sous un autre nom — vérifier manuellement';
  end if;
  raise notice 'P2: version 0050 enregistrée dans schema_migrations';
end $$;

\if :commit
  \echo '==> COMMIT'
  commit;
\else
  \echo '==> DRY-RUN : ROLLBACK (relancer avec -v commit=1 pour appliquer)'
  rollback;
\endif
