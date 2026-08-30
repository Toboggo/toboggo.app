-- ════════════════════════════════════════════════════════════════════════════
-- 0021 — Corrections RLS restantes de coexistence V2 (Phase 5C.1)
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. Aucun DROP TABLE / DROP COLUMN / DELETE / TRUNCATE.
-- `DROP POLICY` uniquement pour recréer immédiatement la même policy corrigée.
-- Ne modifie PAS 0020. N'est PAS le legacy cleanup destructif (toujours repoussé
-- à un lot ultérieur, conditionné au cutover du front V2).
--
-- CONTEXTE — Phase 5C a montré que 0020 avait aligné les policies `parks_*` sur
-- le modèle V2 (`organization_parks` / `can_edit_park` / `manages_park`), mais
-- que les policies V1 des tables ENFANTS d'un parc reposaient encore sur
-- `parks.commune_id` (colonne V1, NULL dans le modèle V2 canonique où la
-- propriété passe par `organization_parks`). Conséquence : un gestionnaire V2
-- autorisé est bloqué SANS erreur (SELECT vide, UPDATE 0 ligne silencieux).
--
-- P5C-2 — `reports_read` / `reports_update` : le gestionnaire d'une organisation
--         propriétaire du parc ne voit ni ne traite les signalements.
-- P5C-3 — `reviews_update` : la réponse d'un gestionnaire à un avis renvoie un
--         PATCH « réussi » (HTTP 204) mais 0 ligne modifiée.
--
-- AUDIT des policies de la même famille (référence `parks.commune_id` /
-- `is_commune_member` / `is_commune_gestionnaire`) — cf. database-migration.md :
--   • reports_read / reports_update / reviews_update .... CLASSE C → corrigées ICI
--   • parks_public_read / parks_update / parks_delete ... CLASSE B → déjà 0020
--   • maintenance_all / activity_read / team_* .......... CLASSE B → OK (elles
--       filtrent sur le `commune_id` PROPRE de la ligne, tenu à jour par les
--       triggers `*_v1_compat` ; testé PASS en Phase 5C)
--   • park_edit_history.park_history_read .............. CLASSE D → table morte
--       en V2 (0 ligne, aucun trigger, aucune lecture/écriture applicative ;
--       l'historique parc passe par `audit_log`, corrigé en 0020). Laissée au
--       cleanup destructif.
--   • communes.communes_write ......................... CLASSE D → table legacy
--       (l'app écrit `organizations`, policy V2 `organizations_update`). Laissée
--       au cleanup destructif.
--
-- PRINCIPE DE CORRECTION (identique à 0020) : AJOUTER une branche V2 en OR,
-- SANS retirer la branche V1 `commune_id` (coexistence permissive). Aucune
-- extension arbitraire de droits : la branche V2 reproduit la sémantique V1
--   • lecture  = membre (tout rôle) d'une organisation propriétaire OU staff
--   • écriture = gestionnaire d'une organisation propriétaire OU staff/admin
-- ════════════════════════════════════════════════════════════════════════════

-- ── P5C-2 — reports_read ────────────────────────────────────────────────────
-- V1 : reporter OU (parc.commune_id => membre commune) OU staff Toboggo.
-- V2 : `manages_park()` = membre d'une organisation propriétaire OU staff.
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select using (
  user_id = auth.uid()
  or manages_park(auth.uid(), park_id)                                    -- V2 : org propriétaire OU staff Toboggo
  or exists (                                                             -- V1 coexistence
    select 1 from public.parks p
    where p.id = reports.park_id
      and p.commune_id is not null
      and is_commune_member(auth.uid(), p.commune_id)
  )
);

-- ── P5C-2 — reports_update ──────────────────────────────────────────────────
-- V1 : (parc.commune_id => gestionnaire commune) OU is_toboggo_admin.
-- V2 : gestionnaire d'une organisation propriétaire (via organization_parks).
-- USING et WITH CHECK explicites et identiques (le parc d'un signalement ne
-- change pas ; on verrouille quand même les deux côtés, comme 0020).
drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports for update
using (
  is_toboggo_admin(auth.uid())
  or exists (
    select 1 from public.organization_parks op
    where op.park_id = reports.park_id
      and is_org_gestionnaire(auth.uid(), op.organization_id)
  )
  or exists (                                                             -- V1 coexistence
    select 1 from public.parks p
    where p.id = reports.park_id
      and p.commune_id is not null
      and is_commune_gestionnaire(auth.uid(), p.commune_id)
  )
)
with check (
  is_toboggo_admin(auth.uid())
  or exists (
    select 1 from public.organization_parks op
    where op.park_id = reports.park_id
      and is_org_gestionnaire(auth.uid(), op.organization_id)
  )
  or exists (
    select 1 from public.parks p
    where p.id = reports.park_id
      and p.commune_id is not null
      and is_commune_gestionnaire(auth.uid(), p.commune_id)
  )
);

-- ── P5C-3 — reviews_update ─────────────────────────────────────────────────
-- Cette policy ne sert dans l'app QU'À la réponse d'une collectivité à un avis
-- (`replyToReview` — back-office). Il n'existe aucun parcours « l'auteur édite
-- son avis ». Objectif P5C-3 : `gestA reply = rows=1`, `cross-org = rows=0`,
-- `admin = rows=1`, `parent = rows=0` (le parent ne répond pas au nom d'une
-- collectivité, même sur son propre avis).
--
-- V1 : `user_id = auth.uid()` OU (parc.commune_id => gestionnaire) OU staff.
-- V2 : on RETIRE la branche `user_id = auth.uid()` (restriction, pas extension :
--      elle n'autorisait que l'auteur à réécrire sa propre ligne d'avis, y
--      compris les colonnes `reply*` — non voulu, non utilisé) et on AJOUTE la
--      branche « gestionnaire d'une organisation propriétaire » (organization_parks).
--      Branche V1 `parks.commune_id` conservée pour la coexistence.
-- NB : `flagReview()` (mobile) écrit `status='flagged'` via cette policy ; le
--      signalement d'un avis PAR UN TIERS était déjà non fonctionnel sous la
--      policy V1 (l'auteur seul passait) — comportement inchangé, hors périmètre.
-- USING et WITH CHECK explicites et identiques (cohérence avec 0020 ; `park_id`
-- ne change jamais lors d'une réponse).
drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews for update
using (
  is_toboggo_staff(auth.uid())
  or exists (
    select 1 from public.organization_parks op
    where op.park_id = reviews.park_id
      and is_org_gestionnaire(auth.uid(), op.organization_id)
  )
  or exists (                                                             -- V1 coexistence
    select 1 from public.parks p
    where p.id = reviews.park_id
      and p.commune_id is not null
      and is_commune_gestionnaire(auth.uid(), p.commune_id)
  )
)
with check (
  is_toboggo_staff(auth.uid())
  or exists (
    select 1 from public.organization_parks op
    where op.park_id = reviews.park_id
      and is_org_gestionnaire(auth.uid(), op.organization_id)
  )
  or exists (
    select 1 from public.parks p
    where p.id = reviews.park_id
      and p.commune_id is not null
      and is_commune_gestionnaire(auth.uid(), p.commune_id)
  )
);

-- `reviews_delete` (is_toboggo_admin) et `reviews_insert` (user_id = auth.uid())
-- inchangées : pas de dette `parks.commune_id`.

-- ── Assertions ─────────────────────────────────────────────────────────────
do $$
declare
  n int;
begin
  -- branche V2 présente : reports_read via manages_park() (helper V2 basé sur
  -- organization_parks) ; reports_update / reviews_update via organization_parks.
  select count(*) into n from pg_policies
   where schemaname = 'public'
     and (
       (tablename = 'reports' and policyname = 'reports_read'
          and coalesce(qual,'') ~ 'manages_park')
       or (tablename = 'reports' and policyname = 'reports_update'
          and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'organization_parks')
       or (tablename = 'reviews' and policyname = 'reviews_update'
          and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'organization_parks')
     );
  if n <> 3 then
    raise exception '0021: branche V2 manquante — attendu 3 policies, trouvé %', n;
  end if;

  -- non destructif : la branche V1 commune_id est conservée sur les 3
  select count(*) into n from pg_policies
   where schemaname = 'public'
     and (
       (tablename = 'reports' and policyname in ('reports_read','reports_update'))
       or (tablename = 'reviews' and policyname = 'reviews_update')
     )
     and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'commune_id';
  if n <> 3 then
    raise exception '0021: branche V1 commune_id perdue sur une des 3 policies (trouvé %)', n;
  end if;

  raise notice '0021 OK — reports_read / reports_update / reviews_update : branche V2 organization_parks ajoutée, branche V1 conservée (coexistence)';
end $$;
