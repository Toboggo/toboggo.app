-- ════════════════════════════════════════════════════════════════════════════
-- 0030 — `parks_v1_compat` : ne plus fabriquer `formatted_address` depuis le nom
-- ────────────────────────────────────────────────────────────────────────────
-- Contexte : audit du chantier adresses. À l'INSERT, le trigger de compat
-- `parks_v1_compat` (migration 0009) devait produire un `formatted_address`
-- non-NULL (colonne V1 `not null` héritée de 0001) même quand l'appelant ne
-- fournit aucune adresse. Sa chaîne de repli était :
--
--   nullif(formatted_address,'') → address_line → city → name → '—'
--
-- Les deux derniers termes (`city`, `name`) FABRIQUENT une adresse : ~99% des
-- 2200 parcs importés (OSM, sans tag `addr:*`) se retrouvent avec
-- `formatted_address = name` en table brute. Comportement non voulu :
-- l'exigence produit est « si aucune adresse n'est connue, elle doit rester
-- absente ; ne jamais fabriquer une adresse à partir du nom du parc ».
--
-- Impact utilisateur réel : nul aujourd'hui. Toutes les lectures applicatives
-- passent par la vue `park_public` (0017) / la RPC `nearby_parks`, qui
-- RECALCULENT `formatted_address` via
--   nullif(concat_ws(', ', address_line, nullif(trim(concat_ws(' ',
--          postal_code, city)), '')), '')
-- soit NULL quand il n'y a ni `address_line` ni `city` ni `postal_code`,
-- sans jamais retomber sur `name`. Cette migration aligne la table brute sur
-- cette sémantique.
--
-- Périmètre volontairement minimal (Tier 1 de l'audit) :
--   • NON DESTRUCTIF — 0 DROP / 0 DELETE / 0 TRUNCATE.
--   • La contrainte `parks.formatted_address NOT NULL` est CONSERVÉE ; le
--     sentinel `'—'` (déjà utilisé comme repli final et dans les fixtures
--     0026) la satisfait quand aucune adresse n'est connue.
--   • Le rendre réellement nullable relève du legacy cleanup V1 (gelé jusqu'au
--     cutover front V2 — cf. 0020) et n'est PAS fait ici.
--   • Branche UPDATE du trigger INCHANGÉE (elle ne comporte déjà aucun repli
--     vers `name`).
--   • `park_public`, `nearby_parks`, `createPark`/`splitParkInput`, les scripts
--     OSM et les types TS ne sont PAS touchés.
--
-- `CREATE OR REPLACE FUNCTION` : corps identique à 0009 à l'exception de la
-- seule ligne du repli `formatted_address` de la branche INSERT.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function parks_v1_compat() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    -- géographie : latitude/longitude (v2) canoniques ; à défaut, dérivées de lat/lng
    new.latitude  := coalesce(new.latitude, new.lat::numeric(9,6));
    new.longitude := coalesce(new.longitude, new.lng::numeric(9,6));
    new.lat := new.latitude;
    new.lng := new.longitude;

    -- adresse : `address_line` (v2) canonique ; à défaut, dérivée d'un
    -- `formatted_address` V1 explicite. `formatted_address` reste NOT NULL —
    -- comblé par le sentinel '—' quand AUCUNE adresse n'est connue. On ne
    -- retombe JAMAIS sur `city` ou `name` : une adresse absente reste absente.
    new.address_line := coalesce(new.address_line, nullif(new.formatted_address, ''));
    new.formatted_address := coalesce(nullif(new.formatted_address, ''),
                                      new.address_line, '—');

    -- âges : min_age/max_age (v2) canoniques ; les valeurs par défaut V1 (0 / 12)
    -- ne sont pas traitées comme une saisie explicite.
    new.min_age := coalesce(new.min_age, nullif(new.age_min, 0));
    new.max_age := coalesce(new.max_age, nullif(new.age_max, 12));
    new.age_min := coalesce(new.min_age, new.age_min);
    new.age_max := coalesce(new.max_age, new.age_max);

    -- statut : moderation_status (v2) canonique. Un INSERT purement V1 (status
    -- fourni, moderation_status resté au défaut 'pending') impose son status.
    if new.status <> 'pending' and new.moderation_status = 'pending' then
      new.moderation_status := new.status::text::park_moderation_status;
    end if;
    new.status := new.moderation_status::text::park_status;
  else
    -- UPDATE : la colonne explicitement modifiée gagne
    if new.latitude is distinct from old.latitude then new.lat := new.latitude;
    elsif new.lat is distinct from old.lat then new.latitude := new.lat::numeric(9,6); end if;

    if new.longitude is distinct from old.longitude then new.lng := new.longitude;
    elsif new.lng is distinct from old.lng then new.longitude := new.lng::numeric(9,6); end if;

    if new.address_line is distinct from old.address_line then
      new.formatted_address := coalesce(nullif(new.address_line, ''), new.formatted_address);
    elsif new.formatted_address is distinct from old.formatted_address then
      new.address_line := nullif(new.formatted_address, '');
    end if;

    if new.min_age is distinct from old.min_age then new.age_min := coalesce(new.min_age, 0);
    elsif new.age_min is distinct from old.age_min then new.min_age := nullif(new.age_min, 0); end if;

    if new.max_age is distinct from old.max_age then new.age_max := coalesce(new.max_age, 12);
    elsif new.age_max is distinct from old.age_max then new.max_age := nullif(new.age_max, 12); end if;

    if new.moderation_status is distinct from old.moderation_status then
      new.status := new.moderation_status::text::park_status;
    elsif new.status is distinct from old.status then
      new.moderation_status := new.status::text::park_moderation_status;
    end if;
  end if;
  return new;
end $$ language plpgsql;

-- le trigger `parks_v1_compat_biu` référence la fonction par son nom :
-- `create or replace` suffit, pas besoin de recréer le trigger.

-- ── Backfill conservateur des lignes manifestement polluées ────────────────
-- Uniquement `formatted_address = name` ET aucune donnée d'adresse réelle
-- (address_line NULL ET city NULL). Les lignes avec un `address_line`/`city`
-- réel ne sont PAS touchées, même si leur `formatted_address` vaut le nom.
update parks
   set formatted_address = '—'
 where formatted_address = name
   and address_line is null
   and city is null;

-- ── Assertions ───────────────────────────────────────────────────────────
do $$
declare
  n_polluted int;
  n_fn_name  int;
begin
  -- 1. plus aucune ligne « nom recopié en adresse » sans vraie adresse
  select count(*) into n_polluted from parks
   where formatted_address = name
     and address_line is null
     and city is null;
  if n_polluted > 0 then
    raise exception '0030: % parcs ont encore formatted_address = name sans adresse réelle', n_polluted;
  end if;

  -- 2. la fonction ne référence plus `new.name` / `new.city` dans le repli adresse
  select count(*) into n_fn_name
    from pg_proc
   where proname = 'parks_v1_compat'
     and prosrc ~ 'new\.address_line,\s*new\.city,\s*new\.name';
  if n_fn_name > 0 then
    raise exception '0030: parks_v1_compat() retombe encore sur city/name pour formatted_address';
  end if;

  -- 3. la contrainte NOT NULL est toujours là (Tier 1 ne la retire pas)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parks'
      and column_name = 'formatted_address' and is_nullable = 'YES'
  ) then
    raise exception '0030: formatted_address ne doit PAS devenir nullable dans cette migration';
  end if;

  raise notice '0030 OK — repli formatted_address = address_line -> ''—'' ; plus de fabrication depuis city/name';
end $$;
