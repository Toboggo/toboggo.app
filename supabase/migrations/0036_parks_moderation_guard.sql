-- ════════════════════════════════════════════════════════════════════════════
-- 0036 — parks : un créateur ne peut plus s'auto-publier / s'auto-modérer
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. Aucune donnée réécrite, aucune table/colonne/policy
-- supprimée, aucune migration figée (0001→0035) modifiée. Ajout d'un seul
-- trigger `BEFORE INSERT OR UPDATE` sur `parks` (même mécanique que
-- `organization_parks_guard`, 0018).
--
-- CONTEXTE (audit de confirmation V1 hardening, §1.A)
-- ----------------------------------------------------
-- `can_edit_park(uid, park_id)` = `created_by = uid OR manages_park(...)`
-- (0018_v2_rls.sql). `parks_update` (USING **et** WITH CHECK, 0020) l'utilise
-- sans aucune restriction de colonne : le simple créateur d'un parc peut donc
-- aujourd'hui faire passer SON PROPRE parc à `moderation_status = 'published'`
-- par un `UPDATE` ordinaire, sans jamais être modérateur/gestionnaire/staff.
-- `parks_insert` (0002_rls.sql) est encore plus permissive : `with check
-- (auth.uid() is not null)`, sans aucune contrainte sur `moderation_status` /
-- `status` — un parc peut donc être créé DÉJÀ publié en un seul INSERT, sans
-- jamais passer par un UPDATE. La RLS ne peut pas exprimer "ce champ précis
-- est protégé, les autres non" (elle porte sur la ligne entière) : un trigger
-- est le mécanisme minimal côté DB pour ce garde-fou colonne par colonne.
--
-- Le champ legacy `status` (park_status) est synchronisé bidirectionnellement
-- avec `moderation_status` par `parks_v1_compat_biu` (0009, redéfini depuis) —
-- un contournement en écrivant seulement `status = 'published'` doit donc être
-- bloqué à l'identique. Les deux colonnes sont vérifiées explicitement (contre
-- leur valeur AVANT synchronisation) pour rester correct quel que soit l'ordre
-- d'exécution des triggers `BEFORE` sur `parks` (Postgres les exécute par
-- ordre alphabétique de nom de trigger).
--
-- CORRECTIF (v2 de cette migration, revue complémentaire) — helpers stricts,
-- pas `manages_park()`/`is_commune_member()`
-- ---------------------------------------------------------------------------
-- La v1 de ce garde-fou utilisait `manages_park(...)` et `is_commune_member
-- (...)`, qui n'appliquent AUCUN filtre de rôle : `manages_park()` accepte
-- toute ligne `team_members` de l'organisation propriétaire quel que soit
-- `role` (0018_v2_rls.sql:69-75) ; `is_commune_member()` de même côté V1
-- (0002_rls.sql:23-25). Un `contributeur` ou un `support` de la collectivité
-- passait donc ce garde-fou exactement comme un `gestionnaire` — alors que la
-- règle produit est **déjà documentée dans le repo**, pas inventée ici :
-- `apps/backoffice/src/lib/permissions.ts` (`canEditPark`) dit explicitement
-- *"the product intends only gestionnaire+/staff to edit, validate, block or
-- remove a park"*, et `apps/backoffice/src/lib/orgSession.ts`
-- (`isGestionnaireOrAbove`) code cette règle côté UI :
-- `role === "gestionnaire" || role === "super_admin" || role === "moderation"`
-- (contributeur/support explicitement exclus). Ce garde-fou DB doit donc
-- s'aligner sur des helpers *précis sur le rôle*, déjà présents dans le repo,
-- déjà utilisés pour un besoin identique par `parks_delete` (0020) :
--   • V1 (collectivité, `commune_id`)  → `is_commune_gestionnaire(uid, commune_id)`
--     (0002_rls.sql:19-21 — filtre `role = 'gestionnaire'`).
--   • V2 (organisation, `organization_parks`) → `is_org_gestionnaire(uid, org_id)`
--     (0018_v2_rls.sql:62-67 — filtre `org_role(...) = 'gestionnaire'`), via
--     un `exists` sur `organization_parks` pour résoudre l'organisation
--     propriétaire du parc (même motif que `parks_delete`, 0020).
--   • Staff Toboggo → `is_toboggo_staff(auth.uid())`, INCHANGÉ (tout rôle
--     staff, `organization_id is null` — c'est aussi la portée de `isAdmin`
--     dans le back-office, cf. commentaire `canDeleteReview` de
--     `permissions.ts` : un staff `support` a `isAdmin: true`).
-- `manages_park()` et `is_commune_member()` elles-mêmes ne sont PAS modifiées
-- : elles restent utilisées telles quelles par les policies RLS existantes
-- (`parks_update`, `park_edits_update`, `park_media_*`, etc.) — resserrer leur
-- granularité de rôle pour ces autres usages est un sujet séparé,
-- volontairement hors périmètre de ce lot.
--
-- ASYMÉTRIE INSERT / UPDATE — volontaire, pas un oubli
-- ---------------------------------------------------------------------------
-- Sur INSERT, la branche V2 (`organization_parks`) est structurellement
-- injoignable : `organization_parks.park_id` référence `parks.id`, et la ligne
-- `parks` en cours d'INSERT n'existe pas encore quand le trigger `BEFORE
-- INSERT` s'exécute — aucun `organization_parks` ne peut donc déjà pointer
-- vers elle. C'est cohérent avec le code applicatif réel : `createPark()`
-- (`packages/shared/src/api/parks.ts`) lie l'organisation via un `upsert`
-- sur `organization_parks` **après** que l'INSERT du parc a réussi, jamais
-- avant/pendant. Aucun flux existant ne crée un parc déjà publié via ce
-- chemin V2 en une seule étape ; en fabriquer un ici serait inventer un
-- comportement qui n'existe pas. La branche V2 est donc volontairement
-- absente du cas INSERT et présente uniquement au cas UPDATE (où le lien a
-- pu être créé par une opération précédente).
-- Le flux V1 réellement utilisé par le back-office (`Parks.tsx` import CSV,
-- `ParkModal.tsx`, `parkNew/ParkNew.tsx` via `parkPayload`) publie
-- directement un parc **à la création** via `commune_id` (jamais
-- `organization_id`) : c'est couvert par la branche
-- `is_commune_gestionnaire(auth.uid(), new.commune_id)`, disponible dès
-- l'INSERT puisque `commune_id` est déjà sur la ligne insérée.
--
-- PORTÉE DU GARDE-FOU (ne bloque QUE `postgres`/`service_role`, jamais eux)
-- ---------------------------------------------------------------------------
-- Le trigger ne s'applique que lorsque `current_user = 'authenticated'` —
-- c'est le SEUL rôle Postgres sous lequel PostgREST fait transiter le trafic
-- utilisateur final réel avec RLS pleinement active. `postgres` (migrations,
-- fixtures de test, `supabase db reset`) et `service_role` ont déjà
-- `BYPASSRLS` : les policies RLS elles-mêmes ne s'appliquent pas à eux, et ce
-- garde-fou — qui est un filet complémentaire à la RLS, pas une politique RLS
-- — ne doit pas les bloquer non plus. C'est également le cas de
-- `scripts/osm/import-osm-local.py` (connexion `psycopg` directe en tant que
-- `postgres`, DSN `postgresql://postgres:...`) qui écrit `moderation_status`
-- déjà `published` lors de l'import OSM (2201 parcs en prod) : ce pipeline
-- reste totalement inchangé par cette migration.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.parks_moderation_guard() returns trigger as $$
begin
  -- Cf. section "PORTÉE DU GARDE-FOU" ci-dessus : no-op hors trafic PostgREST
  -- authentifié (migrations / service_role / import OSM direct).
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Pas de branche V2 (`organization_parks`) ici : cf. section "ASYMÉTRIE
    -- INSERT / UPDATE" ci-dessus — structurellement injoignable à ce stade.
    if (new.moderation_status is distinct from 'pending'::park_moderation_status
        or new.status is distinct from 'pending'::park_status)
       and not (
         (new.commune_id is not null and is_commune_gestionnaire(auth.uid(), new.commune_id))
         or is_toboggo_staff(auth.uid())
       ) then
      raise exception 'parks: un parc doit être créé avec le statut "pending" ; seul un gestionnaire de la collectivité ou le staff Toboggo peut le créer directement publié/bloqué/rejeté'
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
$$ language plpgsql set search_path = public, pg_temp;

drop trigger if exists parks_moderation_guard_biu on public.parks;
create trigger parks_moderation_guard_biu
  before insert or update on public.parks
  for each row execute function public.parks_moderation_guard();

-- ════════════════════════════════════════════════════════════════════════════
-- Assertions structurelles
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare src text;
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.parks'::regclass
       and tgname = 'parks_moderation_guard_biu'
       and not tgisinternal
  ) then
    raise exception '0036: trigger parks_moderation_guard_biu absent sur public.parks';
  end if;

  select pg_get_functiondef(oid) into src
    from pg_proc where proname = 'parks_moderation_guard' and pronamespace = 'public'::regnamespace;
  if src is null then
    raise exception '0036: fonction parks_moderation_guard absente';
  end if;
  if src !~ 'moderation_status' or src !~ 'current_user'
     or src !~ 'is_org_gestionnaire' or src !~ 'is_commune_gestionnaire' then
    raise exception '0036: parks_moderation_guard ne contient pas les garde-fous stricts attendus';
  end if;
  -- Régression : ne doit plus s'appuyer sur les helpers non filtrés par rôle
  -- (contributeur/support passaient au travers) — cf. audit de revue.
  if src ~ 'manages_park' or src ~ 'is_commune_member' then
    raise exception '0036: parks_moderation_guard utilise encore manages_park/is_commune_member (non filtrés par rôle)';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Assertions comportementales — rôle migration (postgres / bypass RLS)
-- ────────────────────────────────────────────────────────────────────────────
-- Reproduit exactement le pipeline d'import OSM (`current_user <> 'authenticated'`) :
-- un INSERT direct avec `moderation_status = 'published'` doit rester possible
-- sans qu'aucun `team_members`/`organization_parks` n'existe. Les scénarios
-- multi-identités (créateur simple / contributeur / support / gestionnaire /
-- staff / collectivité) nécessitent la création de comptes `auth.users` et
-- sont couverts par `supabase/tests/parks_moderation_guard.test.sql` (même
-- convention que 0027 → `park_media_moderation.test.sql`).
-- ════════════════════════════════════════════════════════════════════════════
do $$
begin
  insert into public.parks (id, name, latitude, longitude, country_code, timezone, moderation_status)
  values ('00360036-0000-4000-a000-000000000001', 'zzz_test_0036_osm_style', 42.5, 4.5, 'FR', 'Europe/Paris', 'published');
  if (select moderation_status from public.parks where id = '00360036-0000-4000-a000-000000000001') <> 'published' then
    raise exception '0036 FAIL — import direct (postgres) bloqué à tort';
  end if;
  raise notice '0036 OK — INSERT direct moderation_status=published toujours possible hors rôle authenticated (pipeline OSM/migrations non affecté)';
end $$;

delete from public.parks where id = '00360036-0000-4000-a000-000000000001';
delete from public.audit_log where entity_type = 'parks' and entity_id = '00360036-0000-4000-a000-000000000001';

do $$ begin
  raise notice '0036 OK — parks : un simple créateur, un contributeur ou un support ne peuvent plus (auto-)publier/rejeter/bloquer (INSERT ni UPDATE, moderation_status et status) ; seuls gestionnaire (V1/V2) et staff Toboggo le peuvent ; pipeline OSM non affecté';
end $$;
