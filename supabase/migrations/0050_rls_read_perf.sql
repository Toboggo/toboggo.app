-- 0050 — RLS lecture : même droits, évaluation sans coût par ligne (LOT P2).
--
-- PROBLÈME (mesuré en prod le 12/10/2026, 8 994 parcs dont 6 783 « pending ») :
-- sous un rôle authentifié, TOUTE lecture de `parks` / `park_public` coûte
-- ~1,5 s (même `count(*)`), et `park_sources` filtré ~2,7 s, contre 5–150 ms
-- sans RLS. Cause : la policy `parks_public_read` appelle, pour chaque parc non
-- publié, `can_edit_park(auth.uid(), id)` — fonction SECURITY DEFINER non
-- « inlinable » qui relance elle-même 3 sous-requêtes (`manages_park`,
-- `is_toboggo_staff`…) — et `is_toboggo_staff` est placé en DERNIER du OR ;
-- `auth.uid()` n'est pas enveloppé dans `(select …)` donc jamais mis en cache.
-- Les policies `*_read` des tables enfants (`park_is_visible(park_id)`) paient
-- le même coût par ligne.
--
-- CORRECTIF — strictement équivalent en droits :
--  1. `parks_public_read` : les fonctions par ligne sont remplacées par des
--     ensembles calculés UNE fois par requête (InitPlan / hashed SubPlan) :
--       • staff            : `(select is_toboggo_staff((select auth.uid())))`
--       • parcs gérés      : `id in (select … rls_managed_park_ids())`
--                            == `manages_park()` hors staff (org_parks ⋈ team_members)
--       • communes V1      : `commune_id in (select … rls_member_commune_ids())`
--                            == `is_commune_member()` (team_members.commune_id)
--       • créateur         : `created_by = (select auth.uid())`
--     La sémantique booléenne du OR est inchangée (mêmes termes, aucune
--     fonction à effet de bord, NULL traité comme false par la policy).
--  2. Tables enfants (policies `*_read` basées sur `park_is_visible`) : on
--     ajoute en tête `(select is_toboggo_staff((select auth.uid())))`. Le staff
--     voyait déjà toute ligne dont le parc existe (`park_is_visible` ⇒
--     `manages_park` ⇒ `is_toboggo_staff`) et `park_id` est NOT NULL avec FK
--     vers `parks` sur ces 10 tables : le résultat est identique. Pour tous les
--     autres rôles l'expression d'origine `park_is_visible(park_id)` est
--     conservée telle quelle (le chemin « commune V1 » n'y a JAMAIS été admis :
--     il ne l'est toujours pas).
--
--  3. Les policies `*_write` de ces 10 tables sont `FOR ALL` : en PostgreSQL
--     elles s'appliquent AUSSI aux SELECT (policies permissives = OR). Leur
--     `USING` (`can_edit_park(...)` / `manages_park(...)`, par ligne) annulait
--     donc le gain côté lecture. On leur ajoute le même court-circuit staff en
--     tête de `USING` uniquement ; `WITH CHECK` n'est pas modifié. Équivalence
--     exacte : `can_edit_park` et `manages_park` incluent `is_toboggo_staff`
--     (staff ⇒ vrai pour tout park_id), donc `staff OR f(...)` ≡ `f(...)`.
--
-- NON TOUCHÉ : `WITH CHECK` des policies d'écriture, policies INSERT/UPDATE/DELETE de `parks`, `park_media_read`,
-- `organization_parks_read`, vues, fonctions existantes (`park_is_visible`,
-- `can_edit_park`, `manages_park`, `is_toboggo_staff` restent en place :
-- elles servent encore aux policies d'écriture).
--
-- Rollback : 0050_rls_read_perf_rollback.sql (docs/architecture/p2/).
-- Transaction unique (le runner Supabase/psql -1 enveloppe le fichier).
--
-- VERROUS : `ALTER POLICY` pose un ACCESS EXCLUSIVE sur la table (11 tables)
-- jusqu'au COMMIT. Le travail est de l'ordre de la milliseconde, mais si une
-- requête longue tient la table, l'ALTER attendrait et ferait file derrière lui
-- toutes les lectures : `lock_timeout` fait échouer proprement la migration
-- (rien n'est modifié) plutôt que de bloquer le service — la relancer ensuite.
set local lock_timeout = '5s';

-- ── 0. Garde-fou : état de départ attendu (sinon on s'arrête sans rien changer)
do $$
declare
  q text;
  t text;
  -- table:policy (le nom de la policy de park_attribute_sources n'est pas « <table>_read »)
  child_tables text[] := array[
    'park_sources:park_sources_read','park_features:park_features_read',
    'park_names:park_names_read','park_scores:park_scores_read',
    'external_ids:external_ids_read','park_attribute_sources:park_attr_src_read',
    'park_entrances:park_entrances_read','park_equipment:park_equipment_read',
    'park_opening_hours:park_opening_hours_read','park_zones:park_zones_read'];
begin
  select qual into q from pg_policies
   where schemaname='public' and tablename='parks' and policyname='parks_public_read' and cmd='SELECT';
  if q is null
     or position('can_edit_park' in q) = 0
     or position('is_commune_member' in q) = 0
     or position('is_toboggo_staff' in q) = 0
     or position('rls_managed_park_ids' in q) > 0 then
    raise exception '0050: parks_public_read dans un état inattendu — arrêt, rien n''est modifié (%)', q;
  end if;

  foreach t in array child_tables loop
    select qual into q from pg_policies
     where schemaname='public' and tablename=split_part(t, ':', 1)
       and policyname=split_part(t, ':', 2) and cmd='SELECT';
    if q is null or q <> 'park_is_visible(park_id)' then
      raise exception '0050: policy % dans un état inattendu (%) — arrêt', t, q;
    end if;
  end loop;

  -- policies FOR ALL des tables enfants (USING == WITH CHECK d'origine)
  foreach t in array array[
    'park_sources:park_sources_write:can_edit_park','park_features:park_features_write:can_edit_park',
    'park_names:park_names_write:can_edit_park','park_scores:park_scores_write:manages_park',
    'external_ids:external_ids_write:can_edit_park','park_attribute_sources:park_attr_src_write:can_edit_park',
    'park_entrances:park_entrances_write:can_edit_park','park_equipment:park_equipment_write:can_edit_park',
    'park_opening_hours:park_opening_hours_write:can_edit_park','park_zones:park_zones_write:can_edit_park'] loop
    select qual into q from pg_policies
     where schemaname='public' and tablename=split_part(t, ':', 1)
       and policyname=split_part(t, ':', 2) and cmd='ALL';
    if q is null or q <> split_part(t, ':', 3) || '(auth.uid(), park_id)' then
      raise exception '0050: policy % dans un état inattendu (%) — arrêt', t, q;
    end if;
  end loop;
end $$;

-- ── 1. Ensembles « de l'appelant » (SECURITY DEFINER comme les helpers existants :
--      lecture de team_members / organization_parks sans dépendre de leur RLS)
create or replace function public.rls_managed_park_ids()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  -- identique au volet « organisation » de manages_park(auth.uid(), park_id)
  select op.park_id
    from organization_parks op
    join team_members tm on tm.organization_id = op.organization_id
   where tm.user_id = auth.uid()
$$;

create or replace function public.rls_member_commune_ids()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  -- identique au volet « commune V1 » : is_commune_member(auth.uid(), commune_id)
  select tm.commune_id
    from team_members tm
   where tm.user_id = auth.uid() and tm.commune_id is not null
$$;

revoke all on function public.rls_managed_park_ids()   from public, anon, authenticated;
revoke all on function public.rls_member_commune_ids() from public, anon, authenticated;
grant execute on function public.rls_managed_park_ids()   to anon, authenticated, service_role;
grant execute on function public.rls_member_commune_ids() to anon, authenticated, service_role;

-- ── 2. parks : même ensemble de conditions, évalué une fois par requête
alter policy parks_public_read on public.parks
  using (
    moderation_status = 'published'::park_moderation_status
    or (select public.is_toboggo_staff((select auth.uid())))
    or created_by = (select auth.uid())
    or id in (select m from public.rls_managed_park_ids() m)
    or (commune_id is not null
        and commune_id in (select c from public.rls_member_commune_ids() c))
  );

-- ── 3. Tables enfants : court-circuit staff, expression d'origine conservée sinon
do $$
declare t text;
begin
  foreach t in array array[
    'park_sources:park_sources_read','park_features:park_features_read',
    'park_names:park_names_read','park_scores:park_scores_read',
    'external_ids:external_ids_read','park_attribute_sources:park_attr_src_read',
    'park_entrances:park_entrances_read','park_equipment:park_equipment_read',
    'park_opening_hours:park_opening_hours_read','park_zones:park_zones_read'] loop
    execute format(
      'alter policy %I on public.%I using ((select public.is_toboggo_staff((select auth.uid()))) or public.park_is_visible(park_id))',
      split_part(t, ':', 2), split_part(t, ':', 1));
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'park_sources:park_sources_write:can_edit_park','park_features:park_features_write:can_edit_park',
    'park_names:park_names_write:can_edit_park','park_scores:park_scores_write:manages_park',
    'external_ids:external_ids_write:can_edit_park','park_attribute_sources:park_attr_src_write:can_edit_park',
    'park_entrances:park_entrances_write:can_edit_park','park_equipment:park_equipment_write:can_edit_park',
    'park_opening_hours:park_opening_hours_write:can_edit_park','park_zones:park_zones_write:can_edit_park'] loop
    execute format(
      'alter policy %I on public.%I using ((select public.is_toboggo_staff((select auth.uid()))) or public.%s(auth.uid(), park_id))',
      split_part(t, ':', 2), split_part(t, ':', 1), split_part(t, ':', 3));
  end loop;
end $$;

-- ── 4. Vérification finale
do $$
declare q text;
begin
  select qual into q from pg_policies
   where schemaname='public' and tablename='parks' and policyname='parks_public_read';
  if position('rls_managed_park_ids' in q) = 0 or position('can_edit_park' in q) > 0 then
    raise exception '0050: parks_public_read non mise à jour';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and cmd='SELECT'
        and qual like '%park_is_visible(park_id)%' and qual like '%is_toboggo_staff%') <> 10 then
    raise exception '0050: policies enfants non mises à jour (attendu 10)';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and cmd='ALL'
        and policyname ~ '_(write|attr_src_write)$' and qual like '(( SELECT is_toboggo_staff%') <> 10 then
    raise exception '0050: policies *_write non mises à jour (attendu 10)';
  end if;
  raise notice '0050 OK — parks_public_read + 10 policies *_read + 10 *_write (USING) réécrites, droits inchangés';
end $$;
