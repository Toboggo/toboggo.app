-- ════════════════════════════════════════════════════════════════════════════
-- 0052 — activity_log : intégrité du journal (P1-A, forgerie inter-collectivités)
-- ────────────────────────────────────────────────────────────────────────────
-- ADDITIF / NON DESTRUCTIF : aucune donnée supprimée ou modifiée, aucune colonne
-- retirée. `DROP POLICY IF EXISTS` uniquement pour recréer `activity_insert` sous
-- le MÊME nom (même motif que 0020 / 0021 / 0047 / 0051).
--
-- CAUSE
--   La policy `activity_insert` (0002) vaut `with check (auth.uid() is not null)` :
--   TOUT utilisateur connecté (un simple parent, inscription libre) peut insérer une
--   entrée avec n'importe quel `organization_id` / `commune_id` (y compris NULL = journal
--   global du staff), n'importe quel `actor`, `text`, `color` et même `created_at`.
--   Le journal de B (lu par l'interface via `organization_id`) affiche alors une entrée
--   forgée « Support Toboggo ». Les deux colonnes de collectivité peuvent en plus se
--   contredire (même défaut de fond que 0051).
--
-- CHEMINS D'ÉCRITURE LÉGITIMES (inventaire du code, voir la PR)
--   • back-office (`logActivity`, packages/shared/src/api/notifications.ts) :
--       - membre d'une collectivité (gestionnaire OU contributeur) → journal de SA collectivité ;
--       - staff Toboggo → journal global (`organization_id` NULL), éventuellement une collectivité ;
--   • app mobile (AddPark.tsx) : le parent qui ajoute un parc écrit « Parc ajouté » dans le
--     journal global (`park.commune_id` est toujours NULL). Ce chemin est conservé, mais produit
--     désormais par un TRIGGER SECURITY DEFINER sur `parks` (non falsifiable) : l'appel client
--     direct n'est plus accepté pour un non-membre. Aucun trigger/fonction existant n'écrit ici.
--
-- CORRECTION
--   1. Invariant : CHECK (commune_id IS NOT DISTINCT FROM organization_id) (0 ligne incohérente
--      en production, lecture seule : 42 lignes, 0 incohérente).
--   2. `activity_insert` : staff Toboggo (toute entrée) OU membre de l'organisation visée
--      (`is_org_member`). Plus d'écriture dans le journal global ni dans celui d'une autre
--      collectivité par un non-membre.
--   3. BEFORE INSERT : `created_at` = now() pour les rôles client (plus d'antidatage).
--   4. Trigger `parks_activity_user_insert` (SECURITY DEFINER) : recrée l'entrée « Parc ajouté »
--      du parent (journal global, acteur = nom du profil) — uniquement pour un parc créé par
--      l'utilisateur connecté qui n'est ni staff ni membre d'une collectivité (le back-office
--      journalise déjà ses propres créations). Aucun doublon, aucune entrée pour les imports.
--   5. Privilèges : `anon` ne garde que SELECT ; `authenticated` = SELECT + INSERT (journal
--      append-only : plus d'UPDATE / DELETE / TRUNCATE / TRIGGER / REFERENCES).
--
-- LIMITE ASSUMÉE : `actor` reste un texte libre (la table n'a pas de colonne d'identifiant) :
-- un membre peut y écrire le nom d'un collègue DANS SA PROPRE collectivité. Ajouter un
-- `actor_id` serait une évolution de schéma séparée.
--
-- ROLLBACK : recréer `activity_insert` (`with check (auth.uid() is not null)`), supprimer le
-- trigger `parks_activity_user_insert` / `activity_log_integrity_bi` et la contrainte
-- `activity_log_org_consistent`, re-grant si besoin.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Invariant commune_id == organization_id ─────────────────────────────
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.activity_log'::regclass and conname = 'activity_log_org_consistent'
  ) then
    alter table public.activity_log
      add constraint activity_log_org_consistent
      check (commune_id is not distinct from organization_id) not valid;
  end if;
end $$;
alter table public.activity_log validate constraint activity_log_org_consistent;

-- ── 2. Policy d'insertion bornée ───────────────────────────────────────────
drop policy if exists activity_insert on public.activity_log;
create policy activity_insert on public.activity_log for insert with check (
  commune_id is not distinct from organization_id
  and (
    is_toboggo_staff(auth.uid())
    or (organization_id is not null and is_org_member(auth.uid(), organization_id))
  )
);

-- ── 3. created_at non falsifiable par les rôles client ─────────────────────
create or replace function public.activity_log_integrity() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.created_at := now();
  end if;
  return new;
end $$;

drop trigger if exists activity_log_integrity_bi on public.activity_log;
create trigger activity_log_integrity_bi
  before insert on public.activity_log
  for each row execute function public.activity_log_integrity();

-- ── 4. « Parc ajouté » du parent, produit côté serveur ─────────────────────
create or replace function public.activity_log_user_park_added() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- staff et membres de collectivité journalisent eux-mêmes (back-office) : pas de doublon
  if is_toboggo_staff(new.created_by)
     or exists (select 1 from team_members tm where tm.user_id = new.created_by) then
    return null;
  end if;
  insert into activity_log (organization_id, actor, text, color)
  values (
    null,
    coalesce(nullif((select p.name from profiles p where p.id = new.created_by), ''), 'Utilisateur Toboggo'),
    'Parc ajouté : ' || new.name,
    'primary'
  );
  return null;
end $$;

drop trigger if exists parks_activity_user_insert on public.parks;
create trigger parks_activity_user_insert
  after insert on public.parks
  for each row
  when (new.created_by is not null and new.created_by = auth.uid())
  execute function public.activity_log_user_park_added();

-- ── 5. Privilèges de table (journal append-only) ───────────────────────────
revoke insert, update, delete, truncate, trigger, references on table public.activity_log from anon;
revoke update, delete, truncate, trigger, references on table public.activity_log from authenticated;

-- ── Vérification structurelle ──────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_log'
             and policyname = 'activity_insert' and trim(with_check) = '(auth.uid() IS NOT NULL)') then
    raise exception '0052 FAIL — activity_insert est encore « auth.uid() is not null »';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.parks'::regclass and tgname = 'parks_activity_user_insert') then
    raise exception '0052 FAIL — trigger parks_activity_user_insert absent';
  end if;
  if has_table_privilege('anon', 'public.activity_log', 'insert,update,delete,truncate')
     or has_table_privilege('authenticated', 'public.activity_log', 'update,delete,truncate') then
    raise exception '0052 FAIL — privilèges d''écriture résiduels sur activity_log';
  end if;
  raise notice '0052 OK — activity_log : insertion bornée à la collectivité, journal append-only';
end $$;
