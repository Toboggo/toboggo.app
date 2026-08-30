-- ════════════════════════════════════════════════════════════════════════════
-- 0020 — Corrections de compatibilité runtime V2 (coexistence)
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. Aucun DROP TABLE / DROP COLUMN / DELETE / TRUNCATE.
-- Aucun changement de forme de schéma. Corrige 3 défauts observés en Phase 5B
-- lors des tests fonctionnels réels contre Supabase local V2.
--
-- ⚠️ Ce fichier n'est PAS le "legacy cleanup" du plan (§5 #6). Le nettoyage
--    destructif des colonnes/tables/policies V1 est repoussé à 0021+ et reste
--    conditionné au cutover du front V2.
--
-- D1 — public.link_team_member_on_signup() : SECURITY DEFINER sans search_path
--      → le rôle supabase_auth_admin (search_path = auth) ne résout pas
--      `team_members` / `profiles` → tout signup GoTrue renvoie 500
--      (`relation "team_members" does not exist`). Correctif : `set search_path
--      = ''` + qualification explicite. Logique de liaison inchangée.
--
-- D2 — policy audit_log_read : teste `entity_type = 'park'` alors que
--      audit_row() écrit `entity_type = tg_table_name = 'parks'`. Un
--      gestionnaire ne peut jamais lire l'historique de son parc. Correctif :
--      aligner le littéral sur la valeur réellement stockée ('parks').
--
-- D3 — policies parks_public_read / parks_update / parks_delete : la permission
--      "collectivité" repose uniquement sur `parks.commune_id` (modèle V1). Dans
--      le modèle V2 canonique la propriété passe par `organization_parks`, et
--      `parks.commune_id` peut être NULL. Un gestionnaire V2 autorisé se
--      retrouve alors bloqué (UPDATE 0 ligne silencieux). Correctif : ajouter
--      une branche V2 (`can_edit_park` / `organization_parks` + `is_org_*`) SANS
--      retirer la branche V1 `commune_id` (coexistence, permissive OR).
--      parks_insert : CHECK = `auth.uid() is not null`, aucune dépendance
--      commune_id → inchangée.
-- ════════════════════════════════════════════════════════════════════════════

-- ── D1 ──────────────────────────────────────────────────────────────────────
create or replace function public.link_team_member_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- liaison par e-mail d'un membre d'équipe pré-invité (logique V1 inchangée)
  update public.team_members
     set user_id = new.id
   where lower(email) = lower(new.email)
     and user_id is null;

  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- le trigger auth.users.on_auth_user_created référence la fonction par son nom :
-- `create or replace` suffit, pas besoin de recréer le trigger.

-- ── D2 ──────────────────────────────────────────────────────────────────────
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log
for select using (
  is_toboggo_staff(auth.uid())
  or (entity_type = 'parks' and manages_park(auth.uid(), entity_id))
);

-- ── D3 ──────────────────────────────────────────────────────────────────────
-- parks_public_read : + branche V2 (membre d'une organisation propriétaire)
drop policy if exists parks_public_read on public.parks;
create policy parks_public_read on public.parks
for select using (
  status = 'published'::park_status
  or created_by = auth.uid()
  or can_edit_park(auth.uid(), id)                                   -- V2 : created_by OR manages_park OR staff
  or ((commune_id is not null) and is_commune_member(auth.uid(), commune_id))  -- V1 coexistence
  or is_toboggo_staff(auth.uid())
);

-- parks_update : + branche V2. USING et WITH CHECK explicites et identiques.
drop policy if exists parks_update on public.parks;
create policy parks_update on public.parks
for update
using (
  can_edit_park(auth.uid(), id)
  or ((commune_id is not null) and is_commune_member(auth.uid(), commune_id))
  or is_toboggo_staff(auth.uid())
)
with check (
  can_edit_park(auth.uid(), id)
  or ((commune_id is not null) and is_commune_member(auth.uid(), commune_id))
  or is_toboggo_staff(auth.uid())
);

-- parks_delete : + branche V2 réservée au gestionnaire d'une organisation
-- propriétaire (équivalent V2 de `is_commune_gestionnaire`).
drop policy if exists parks_delete on public.parks;
create policy parks_delete on public.parks
for delete using (
  is_toboggo_admin(auth.uid())
  or ((commune_id is not null) and is_commune_gestionnaire(auth.uid(), commune_id))
  or exists (
    select 1 from public.organization_parks op
    where op.park_id = parks.id
      and is_org_gestionnaire(auth.uid(), op.organization_id)
  )
);
