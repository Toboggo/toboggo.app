-- ════════════════════════════════════════════════════════════════════════════
-- 0051 — team_members : écritures bornées à l'organisation (P0-1, isolation tenant)
-- ────────────────────────────────────────────────────────────────────────────
-- ADDITIF / NON DESTRUCTIF : aucune donnée supprimée ou modifiée, aucune colonne
-- retirée. `DROP POLICY IF EXISTS` uniquement pour recréer les 4 policies sous le
-- MÊME nom (même motif que 0020 / 0021 / 0047).
--
-- CAUSE RACINE
--   team_members porte DEUX colonnes de collectivité : `commune_id` (V1) et
--   `organization_id` (V2), synchronisées par le trigger `team_members_v1_compat`
--   qui ne comble que le côté NULL. Or :
--     • les policies team_* (0002, jamais migrées en V2) ne regardent QUE `commune_id` ;
--     • TOUTE l'autorisation V2 (is_org_member, is_org_gestionnaire, org_role,
--       manages_park, organizations_update…) lit `organization_id`.
--   Un gestionnaire de A peut donc insérer (commune_id = A, organization_id = B,
--   user_id = lui-même) : le trigger ne touche pas deux colonnes renseignées, la
--   policy ne voit que commune_id = A (OK), et la ligne le rend gestionnaire de B
--   pour toute la couche V2 (modifier organizations B, ses parcs, etc.). Même
--   chose pour une « invitation » piégée (user_id NULL, e-mail d'un tiers), liée à
--   l'inscription par link_team_member_on_signup(). Un gestionnaire pouvait aussi
--   donner un rôle staff (super_admin / moderation) à une ligne de son équipe.
--
-- CORRECTION
--   1. Invariant en base : CHECK (commune_id IS NOT DISTINCT FROM organization_id).
--      Plus aucune ligne ne peut désigner deux collectivités différentes (vérifié :
--      0 ligne incohérente en production, lecture seule).
--   2. Policies réécrites sur `organization_id` (la colonne que lit toute l'autorisation V2) avec les
--      helpers V2 existants ; INSERT/UPDATE ont un WITH CHECK qui borne la ligne
--      NOUVELLE (on ne peut ni créer ni DÉPLACER une ligne vers une autre
--      collectivité, ni vers le staff Toboggo) et interdit les rôles staff
--      (super_admin, moderation) dans une collectivité.
--   3. Privilèges de table : `anon` ne garde que SELECT (RLS → 0 ligne, comportement
--      inchangé) ; `authenticated` perd TRUNCATE / TRIGGER / REFERENCES (RLS ne
--      s'applique pas à TRUNCATE).
--
-- COMPORTEMENT CONSERVÉ : lecture par les membres de leur collectivité (et de sa
-- propre ligne), gestion par le gestionnaire de SA collectivité, gestion de
-- l'équipe Toboggo (organization_id NULL) par le staff admin, invitation +
-- liaison à l'inscription. Le staff Toboggo n'obtient PAS de droit nouveau sur
-- les équipes des collectivités (inchangé, voir OrganizationDetail.tsx).
--
-- ROLLBACK : recréer les 4 policies de 0002 (clause commune_id / helpers
-- is_commune_*), `alter table team_members drop constraint
-- team_members_org_consistent`, et re-grant si besoin.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Invariant de cohérence commune_id == organization_id ────────────────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.team_members'::regclass and conname = 'team_members_org_consistent'
  ) then
    alter table public.team_members
      add constraint team_members_org_consistent
      check (commune_id is not distinct from organization_id) not valid;
  end if;
end $$;
-- échoue (sans rien modifier) si une ligne incohérente existait ; 0 en production.
alter table public.team_members validate constraint team_members_org_consistent;

-- ── 2. Policies sur organization_id ────────────────────────────────────────
drop policy if exists team_read on public.team_members;
create policy team_read on public.team_members for select using (
  user_id = auth.uid()
  or (organization_id is null and is_toboggo_staff(auth.uid()))
  or (organization_id is not null and is_org_member(auth.uid(), organization_id))
);

-- INSERT : la ligne finale (après trigger de compat) doit être cohérente, bornée à une
-- collectivité DONT L'APPELANT EST GESTIONNAIRE (ou à l'équipe Toboggo pour un admin),
-- et ne jamais porter un rôle staff dans une collectivité.
drop policy if exists team_write on public.team_members;
create policy team_write on public.team_members for insert with check (
  commune_id is not distinct from organization_id
  and (
    (organization_id is null and is_toboggo_admin(auth.uid()))
    or (
      organization_id is not null
      and is_org_gestionnaire(auth.uid(), organization_id)
      and role not in ('super_admin', 'moderation')
    )
  )
);

-- UPDATE : USING borne la ligne EXISTANTE, WITH CHECK la ligne NOUVELLE (sinon USING
-- seul servait de CHECK sur commune_id uniquement et laissait déplacer/promouvoir).
drop policy if exists team_update on public.team_members;
create policy team_update on public.team_members for update
using (
  (organization_id is null and is_toboggo_admin(auth.uid()))
  or (organization_id is not null and is_org_gestionnaire(auth.uid(), organization_id))
)
with check (
  commune_id is not distinct from organization_id
  and (
    (organization_id is null and is_toboggo_admin(auth.uid()))
    or (
      organization_id is not null
      and is_org_gestionnaire(auth.uid(), organization_id)
      and role not in ('super_admin', 'moderation')
    )
  )
);

drop policy if exists team_delete on public.team_members;
create policy team_delete on public.team_members for delete using (
  (organization_id is null and is_toboggo_admin(auth.uid()))
  or (organization_id is not null and is_org_gestionnaire(auth.uid(), organization_id))
);

-- ── 3. Privilèges de table (anon garde SELECT : RLS renvoie 0 ligne, inchangé) ─────────────────────────────────────────────────
revoke insert, update, delete, truncate, trigger, references on table public.team_members from anon;
revoke truncate, trigger, references on table public.team_members from authenticated;

-- ── Vérification structurelle ──────────────────────────────────────────────
do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'team_members'
      and policyname in ('team_read', 'team_write', 'team_update', 'team_delete')) <> 4 then
    raise exception '0051 FAIL — policy team_* manquante';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_members'
             and (coalesce(qual, '') || coalesce(with_check, '')) like '%commune_id IS NOT NULL%') then
    raise exception '0051 FAIL — une policy team_* raisonne encore sur commune_id seul';
  end if;
  if (select with_check from pg_policies where schemaname = 'public' and tablename = 'team_members'
      and policyname = 'team_update') is null then
    raise exception '0051 FAIL — team_update sans WITH CHECK';
  end if;
  if has_table_privilege('anon', 'public.team_members', 'insert,update,delete,truncate') then
    raise exception '0051 FAIL — anon a encore des privilèges d''écriture sur team_members';
  end if;
  raise notice '0051 OK — team_members : écritures bornées à l''organisation';
end $$;
