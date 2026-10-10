-- ════════════════════════════════════════════════════════════════════════════
-- APPLICATION MANUELLE DE 0047 — à coller EN UNE FOIS dans le SQL Editor Supabase.
-- STAGING D'ABORD (validation), PRODUCTION seulement après accord explicite.
-- Tout est dans UNE transaction : si une instruction échoue, rien n'est appliqué
-- ET rien n'est enregistré dans supabase_migrations.schema_migrations.
-- Fichier généré : migration = supabase/migrations/0047_rls_organization_scope.sql
-- (copiée à l'identique entre les marqueurs MIGRATION / FIN MIGRATION).
-- Retour arrière : supabase/manual/0047_rollback.sql.
-- Après application : rejouer supabase/tests/rls_organization_scope.test.sql
-- (transaction + ROLLBACK, local/Staging UNIQUEMENT, jamais prod).
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- Ne pas faire la queue derrière une transaction longue (import) : DDL = verrou
-- exclusif. Échec rapide ⇒ transaction annulée ⇒ réessayer plus tard.
set local lock_timeout = '10s';

-- Garde-fous (prérequis) : échec ⇒ transaction annulée.
do $$
begin
  if to_regclass('public.organizations') is null or to_regclass('public.communes') is null
     or to_regclass('public.organization_parks') is null or to_regclass('public.parks') is null then
    raise exception 'Prérequis manquant : organizations / communes / organization_parks / parks — mauvais projet ?';
  end if;
  if to_regprocedure('public.is_toboggo_staff(uuid)') is null
     or to_regprocedure('public.is_org_member(uuid,uuid)') is null
     or to_regprocedure('public.is_commune_member(uuid,uuid)') is null then
    raise exception 'Prérequis manquant : is_toboggo_staff / is_org_member / is_commune_member (0002 / 0018)';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public'
        and policyname in ('organizations_read', 'communes_read', 'organization_parks_read')) <> 3 then
    raise exception 'Prérequis : les 3 policies de lecture à remplacer sont introuvables (état inattendu)';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '0047') then
    raise notice '0047 déjà enregistrée : la migration est idempotente, elle est rejouée sans effet de bord.';
  end if;
end $$;

-- ───────────────────────── MIGRATION 0047 ─────────────────────────
-- ════════════════════════════════════════════════════════════════════════════
-- 0047 — RLS : cloisonnement des organisations (Lot A2)
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. Aucune donnée touchée, aucun DROP TABLE / COLUMN / TRIGGER.
-- `DROP POLICY IF EXISTS` uniquement pour recréer, sous le MÊME nom, la même
-- policy resserrée (même motif que 0020 / 0021). Ne modifie aucune migration
-- figée. Ne touche ni `park_public`, ni `parks`, ni aucune policy d'écriture.
--
-- PROBLÈME — trois SELECT valaient `using (true)` ET étaient accordés à `anon` :
--   • organizations.organizations_read          (0018)
--   • communes.communes_read                    (0002, table V1 miroir)
--   • organization_parks.organization_parks_read (0018)
-- Conséquences : n'importe qui (même non connecté) pouvait lister TOUTES les
-- collectivités avec leur `contact_email`, et toutes les relations
-- parc ↔ collectivité, y compris celles de parcs non publiés.
--
-- MODÈLE (constaté en base, voir docs) : `organizations.id` = `communes.id`
-- (même uuid, table V1 tenue en miroir). Le rattachement d'un utilisateur est
-- `team_members` (`organization_id`, miroir `commune_id`) ; `organization_id
-- IS NULL` = staff Toboggo. Les helpers `is_org_member` / `is_toboggo_staff`
-- sont SECURITY DEFINER (pas de récursion RLS).
--
-- CORRECTION
--   1. organizations / communes : lecture = staff Toboggo OU membre de cette
--      organisation. Aucune surface publique (mobile, landing, edge functions)
--      ne lit ces tables : vérifié par grep du dépôt.
--   2. organization_parks : lecture = staff OU membre de l'organisation OU
--      parc PUBLIÉ. Le dernier cas est volontaire : la vue publique
--      `park_public` (security_invoker) calcule `organization_id` /
--      `commune_id` depuis cette table, et l'app mobile s'en sert (EditInfo
--      route la proposition vers la collectivité propriétaire). Ce lien est
--      donc DÉJÀ public pour un parc publié ; seuls les rattachements de parcs
--      non publiés (brouillon / pending / bloqué) deviennent privés.
--
-- INCHANGÉ (vérifié par supabase/tests/rls_organization_scope.test.sql) :
--   • écritures sur organization_parks (insert/update/delete gestionnaire de
--     SON organisation, staff_all, trigger organization_parks_guard) ;
--   • organizations_update / _insert / _delete ; parks_* ; reports_* ;
--   • tous les accès staff Toboggo.
--
-- Hors périmètre (signalé dans la PR, non traité ici) : `activity_insert` /
-- `audit_log_insert` sans portée d'organisation, grants TRUNCATE anon sur
-- certaines tables, auto-vérification `organizations.verified`, rattachement
-- libre d'un parc SANS propriétaire par un gestionnaire.
--
-- ROLLBACK : recréer les 3 policies avec `using (true)` (cf. 0002 / 0018).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. organizations ───────────────────────────────────────────────────────
drop policy if exists organizations_read on public.organizations;
create policy organizations_read on public.organizations for select using (
  is_toboggo_staff(auth.uid())
  or is_org_member(auth.uid(), id)
);

-- ── 2. communes (V1, miroir de organizations — même contact_email) ─────────
drop policy if exists communes_read on public.communes;
create policy communes_read on public.communes for select using (
  is_toboggo_staff(auth.uid())
  or is_commune_member(auth.uid(), id)
);

-- ── 3. organization_parks ──────────────────────────────────────────────────
-- Helper SECURITY DEFINER (même convention que `park_is_visible`, 0018) : lit
-- `parks` SANS repasser par ses policies. Une sous-requête directe sur `parks`
-- depuis cette policy provoque « infinite recursion detected in policy »
-- (les policies de `parks` référencent `organization_parks`).
create or replace function public.park_is_published(p_park_id uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from parks p
    where p.id = p_park_id and p.moderation_status = 'published'
  );
$$;

drop policy if exists organization_parks_read on public.organization_parks;
create policy organization_parks_read on public.organization_parks for select using (
  park_is_published(park_id)                                -- lien déjà public (park_public)
  or is_org_member(auth.uid(), organization_id)
  or is_toboggo_staff(auth.uid())
);

-- ── Vérification structurelle ──────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and policyname in ('organizations_read', 'communes_read', 'organization_parks_read')
      and trim(qual) = 'true'
  ) then
    raise exception '0047 FAIL — une policy de lecture est encore using(true)';
  end if;
  if (select count(*) from pg_policies
      where schemaname = 'public'
        and policyname in ('organizations_read', 'communes_read', 'organization_parks_read')) <> 3 then
    raise exception '0047 FAIL — policy de lecture manquante';
  end if;
  raise notice '0047 OK — organizations / communes / organization_parks : lecture cloisonnée';
end $$;

-- ───────────────────── FIN MIGRATION 0047 ─────────────────────

-- Enregistrement dans le suivi Supabase (dans la même transaction).
insert into supabase_migrations.schema_migrations (version, name)
values ('0047', 'rls_organization_scope')
on conflict (version) do nothing;

commit;
