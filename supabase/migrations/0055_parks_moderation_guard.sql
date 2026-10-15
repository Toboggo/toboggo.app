-- ════════════════════════════════════════════════════════════════════════════
-- 0055 — parks : un utilisateur ne peut plus s'auto-publier / s'auto-modérer
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. Aucune donnée réécrite, aucune table/colonne/policy supprimée.
-- Ajout d'une fonction et d'UN trigger `BEFORE INSERT OR UPDATE` sur `parks`
-- (même mécanique que `organization_parks_guard`, 0018).
-- (Reprise de `0036_parks_moderation_guard` de la branche feature/v1-hardening, jamais
-- mergée ; renumérotée 0055, débarrassée des fixtures, et CORRIGÉE pour le flux
-- back-office actuel — voir « DIFFÉRENCES AVEC 0036 ».)
--
-- CAUSE
--   • `parks_insert` = `auth.uid() IS NOT NULL` sans contrainte sur `moderation_status`/`status` :
--     tout compte (inscription libre) peut créer un parc DÉJÀ publié en un seul INSERT.
--   • `parks_update` (USING et WITH CHECK = `can_edit_park OR …`) n'a aucune restriction de colonne :
--     le créateur d'un parc — ou n'importe quel membre (contributeur, support) de l'organisation
--     propriétaire — peut passer ce parc à `published` / `blocked` / `rejected`.
--   La RLS ne sait pas protéger « cette colonne-là seulement » : un trigger est le garde-fou minimal.
--   Constaté (lecture seule) sur PROD et STAGING le 15/10/2026 : aucun trigger de ce type ; 0 parc
--   non-`pending` créé par un utilisateur (jamais exploité).
--
-- RÈGLE (alignée sur `canEditPark` / `isGestionnaireOrAbove` du back-office)
--   Changer le statut de modération (colonnes `moderation_status` ET `status` legacy) n'est permis
--   qu'au staff Toboggo ou à un GESTIONNAIRE (pas contributeur / support) de la collectivité
--   propriétaire. Tout autre rôle crée en `pending`.
--
-- PORTÉE : le trigger ne s'applique que si `current_user` est `authenticated` (ou `anon`), c.-à-d. le
-- trafic PostgREST. `postgres` (migrations, SQL Editor, `supabase db query`, import OSM direct,
-- publication par lots en SQL) et `service_role` sont inchangés.
--
-- DIFFÉRENCES AVEC 0036 (branche feature/v1-hardening)
--   0036 autorisait la création directement publiée via `is_commune_gestionnaire(commune_id)` seulement
--   (« flux V1 »). Or le back-office actuel (ParkNew / ParkModal / import CSV) ne renseigne plus
--   `parks.commune_id` : le lien se fait APRÈS l'INSERT via `organization_parks` (createPark). Avec 0036,
--   un gestionnaire n'aurait plus pu créer un parc publié. Correctif côté application dans la même PR :
--   `createPark` insère en `pending`, lie l'organisation, PUIS passe le parc au statut demandé (UPDATE
--   autorisé par la branche `organization_parks`). Ce changement front est compatible avec et sans
--   ce trigger : il doit être DÉPLOYÉ AVANT d'appliquer 0055.
--   Les chemins non-gestionnaire (mobile : toujours `pending`) sont inchangés.
--
-- ROLLBACK : drop trigger parks_moderation_guard_biu on public.parks;
--            drop function public.parks_moderation_guard();
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

create or replace function public.parks_moderation_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Hors trafic PostgREST : migrations / SQL Editor / service_role / imports directs.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Pas de branche organization_parks ici : le lien est créé après l'INSERT (voir en-tête).
    if (new.moderation_status is distinct from 'pending'::park_moderation_status
        or new.status is distinct from 'pending'::park_status)
       and not (
         (new.commune_id is not null and is_commune_gestionnaire(auth.uid(), new.commune_id))
         or is_toboggo_staff(auth.uid())
       ) then
      raise exception 'parks: un parc doit être créé avec le statut "pending" ; seul le staff Toboggo peut le créer directement publié/bloqué/rejeté'
        using errcode = '42501';
    end if;
  else -- UPDATE
    if (new.moderation_status is distinct from old.moderation_status
        or new.status is distinct from old.status)
       and not (
         (old.commune_id is not null and is_commune_gestionnaire(auth.uid(), old.commune_id))
         or exists (
           select 1 from organization_parks op
           where op.park_id = old.id and is_org_gestionnaire(auth.uid(), op.organization_id)
         )
         or is_toboggo_staff(auth.uid())
       ) then
      raise exception 'parks: seul un gestionnaire (collectivité ou organisation propriétaire) ou le staff Toboggo peut modifier le statut de modération de ce parc'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists parks_moderation_guard_biu on public.parks;
create trigger parks_moderation_guard_biu
  before insert or update on public.parks
  for each row execute function public.parks_moderation_guard();

-- ── Assertions structurelles ────────────────────────────────────────────────
do $$
declare src text;
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.parks'::regclass and tgname = 'parks_moderation_guard_biu' and not tgisinternal
  ) then
    raise exception '0055 FAIL — trigger parks_moderation_guard_biu absent sur public.parks';
  end if;

  select pg_get_functiondef(oid) into src
    from pg_proc where proname = 'parks_moderation_guard' and pronamespace = 'public'::regnamespace;
  if src is null then
    raise exception '0055 FAIL — fonction parks_moderation_guard absente';
  end if;
  if src !~ 'moderation_status' or src !~ 'current_user'
     or src !~ 'is_org_gestionnaire' or src !~ 'is_commune_gestionnaire' then
    raise exception '0055 FAIL — parks_moderation_guard ne contient pas les garde-fous attendus';
  end if;
  -- Ne doit pas s'appuyer sur des helpers non filtrés par rôle (contributeur/support passeraient).
  if src ~ 'manages_park' or src ~ 'is_commune_member' then
    raise exception '0055 FAIL — parks_moderation_guard utilise encore manages_park/is_commune_member';
  end if;
  raise notice '0055 OK — parks : statut de modération réservé aux gestionnaires et au staff';
end $$;
