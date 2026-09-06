-- ════════════════════════════════════════════════════════════════════════════
-- 0031 — `parks_v1_compat` : miroir formatted_address ⇄ address_line
--        robuste au sentinel `'—'`
-- ────────────────────────────────────────────────────────────────────────────
-- 0030 a retiré le repli `city` / `name` en INSERT. Il reste que
-- `parks.formatted_address` porte une contrainte `NOT NULL`, comblée par le
-- sentinel `'—'` quand aucune adresse n'est connue.
--
-- Le miroir bidirectionnel de `parks_v1_compat` (migration 0009) ne neutralise
-- que la chaîne vide (`nullif(x, '')`), PAS le sentinel :
--
--   • branche UPDATE, `elsif new.formatted_address is distinct from old…` :
--       new.address_line := nullif(new.formatted_address, '')
--     ⇒ `UPDATE … SET formatted_address = '—'` recopie `'—'` dans
--       `address_line`. Constaté en prod lors du backfill 0030 : 1 parc
--       (« Square Thérèse Dauty »), corrigé manuellement.
--
--   • branche INSERT :
--       new.address_line := coalesce(new.address_line,
--                                    nullif(new.formatted_address, ''))
--     ⇒ même fuite si un INSERT fournit explicitement
--       `formatted_address = '—'`.
--
-- Conséquence : `address_line = '—'` ⇒ `park_public.formatted_address = '—'`
-- au lieu de `NULL` (la vue compose depuis `address_line`).
--
-- ── Correctif minimal ──────────────────────────────────────────────────────
-- Partout où `formatted_address` alimente `address_line`, neutraliser AUSSI le
-- sentinel : `nullif(nullif(new.formatted_address, ''), '—')`.
--   (2 lignes changées — INSERT + UPDATE. Géo / âges / statut / `city` /
--    sens `address_line → formatted_address` : STRICTEMENT inchangés.)
--
-- Comportement garanti :
--   formatted_address = '—'   ⇒ address_line = NULL
--   address_line = NULL       ⇒ formatted_address peut rester '—'
--   vraie formatted_address   ⇒ peut alimenter address_line
--   vraie address_line        ⇒ peut alimenter formatted_address
--   pas de boucle (trigger BEFORE, uniquement des affectations sur NEW)
--
-- NON DESTRUCTIF : `CREATE OR REPLACE FUNCTION` (0 DROP). Backfill défensif
-- idempotent : `address_line = '—'` (sentinel ayant fui) revient à `NULL`
-- (0 ligne en prod — déjà corrigé ; couvre tout autre environnement).
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
    -- `formatted_address` V1 explicite ET RÉEL (ni '' ni le sentinel '—').
    -- `formatted_address` reste NOT NULL, comblé par '—' si aucune adresse.
    -- On ne retombe JAMAIS sur `city` / `name`, et `'—'` n'est jamais
    -- recopié dans `address_line` : une adresse absente reste absente.
    new.address_line := coalesce(new.address_line,
                                 nullif(nullif(new.formatted_address, ''), '—'));
    new.formatted_address := coalesce(nullif(nullif(new.formatted_address, ''), '—'),
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
      -- sens formatted_address → address_line : `'—'` (comme `''`) NE
      -- renseigne PAS `address_line` — une adresse absente reste absente.
      new.address_line := nullif(nullif(new.formatted_address, ''), '—');
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

-- ── Backfill défensif : neutraliser un sentinel ayant fui dans address_line ──
update parks set address_line = null where address_line = '—';

-- ── Tests comportementaux (fixtures éphémères, UUID fixes) ─────────────────
do $$
declare
  t1 uuid := 'a0310031-0000-4000-a000-000000000001';
  t2 uuid := 'a0310031-0000-4000-a000-000000000002';
  t3 uuid := 'a0310031-0000-4000-a000-000000000003';
  v_al text; v_fa text; v_pub text; v_lat numeric; v_ms text;
begin
  -- ─── T1 : création SANS adresse ────────────────────────────────────────
  insert into parks (id, name, latitude, longitude, country_code, timezone)
  values (t1, 'zzz_0031_fixture', 43.6, 1.44, 'FR', 'Europe/Paris');
  select address_line, formatted_address into v_al, v_fa from parks where id = t1;
  if v_al is not null then raise exception '0031 T1: création sans adresse — address_line=% (attendu NULL)', v_al; end if;
  if v_fa <> '—' then raise exception '0031 T1: création sans adresse — formatted_address=% (attendu ''—'')', v_fa; end if;
  select formatted_address into v_pub from park_public where id = t1;
  if v_pub is not null then raise exception '0031 T1: park_public.formatted_address=% (attendu NULL)', v_pub; end if;

  -- ─── T2 : vraie address_line ⇒ alimente formatted_address ──────────────
  update parks set address_line = '12 Rue du Test' where id = t1;
  select address_line, formatted_address into v_al, v_fa from parks where id = t1;
  if v_fa <> '12 Rue du Test' then raise exception '0031 T2: UPDATE address_line réelle — formatted_address=% (attendu ''12 Rue du Test'')', v_fa; end if;
  select formatted_address into v_pub from park_public where id = t1;
  if v_pub <> '12 Rue du Test' then raise exception '0031 T2: park_public.formatted_address=%', v_pub; end if;

  -- ─── T3 : changement formatted_address = '—' (sentinel) ⇒ address_line NULL
  --         (== le scénario exact du backfill 0030 en prod) ───────────────
  update parks set formatted_address = '—' where id = t1;
  select address_line, formatted_address into v_al, v_fa from parks where id = t1;
  if v_al is not null then raise exception '0031 T3: UPDATE formatted_address=''—'' — address_line=% (attendu NULL)', v_al; end if;
  if v_fa <> '—' then raise exception '0031 T3: formatted_address=% (attendu ''—'')', v_fa; end if;
  select formatted_address into v_pub from park_public where id = t1;
  if v_pub is not null then raise exception '0031 T3: park_public.formatted_address=% (attendu NULL)', v_pub; end if;

  -- ─── T4 : changement formatted_address = vraie adresse ⇒ alimente address_line
  update parks set formatted_address = '7 Rue Autre' where id = t1;
  select address_line, formatted_address into v_al, v_fa from parks where id = t1;
  if v_al <> '7 Rue Autre' then raise exception '0031 T4: UPDATE formatted_address réelle — address_line=% (attendu ''7 Rue Autre'')', v_al; end if;

  -- ─── T5 : changement address_line = NULL ⇒ formatted_address conservé ──
  update parks set address_line = null where id = t1;
  select address_line, formatted_address into v_al, v_fa from parks where id = t1;
  if v_al is not null then raise exception '0031 T5: address_line=% (attendu NULL)', v_al; end if;
  if v_fa is null then raise exception '0031 T5: formatted_address devenu NULL (contrainte NOT NULL / logique violée)'; end if;

  -- ─── T6 : non-régression géo (UPDATE latitude ⇒ lat suit) ─────────────
  update parks set latitude = 44.0 where id = t1;
  select lat into v_lat from parks where id = t1;
  if v_lat is distinct from 44.0 then raise exception '0031 T6: non-régression géo — lat=% (attendu 44.0)', v_lat; end if;

  -- ─── T7 : non-régression statut (UPDATE moderation_status ⇒ status suit)
  update parks set moderation_status = 'published' where id = t1;
  select status::text into v_ms from parks where id = t1;
  if v_ms <> 'published' then raise exception '0031 T7: non-régression statut — status=% (attendu published)', v_ms; end if;

  -- ─── T8 : INSERT explicite formatted_address = '—' ⇒ address_line NULL ─
  insert into parks (id, name, latitude, longitude, country_code, timezone, formatted_address)
  values (t2, 'zzz_0031_fixture2', 43.6, 1.44, 'FR', 'Europe/Paris', '—');
  select address_line, formatted_address into v_al, v_fa from parks where id = t2;
  if v_al is not null then raise exception '0031 T8: INSERT formatted_address=''—'' — address_line=% (attendu NULL)', v_al; end if;
  if v_fa <> '—' then raise exception '0031 T8: formatted_address=% (attendu ''—'')', v_fa; end if;

  -- ─── T9 : INSERT explicite address_line réelle ⇒ formatted_address alimenté
  insert into parks (id, name, latitude, longitude, country_code, timezone, address_line)
  values (t3, 'zzz_0031_fixture3', 43.6, 1.44, 'FR', 'Europe/Paris', '9 Bd Test');
  select address_line, formatted_address into v_al, v_fa from parks where id = t3;
  if v_fa <> '9 Bd Test' then raise exception '0031 T9: INSERT address_line réelle — formatted_address=% (attendu ''9 Bd Test'')', v_fa; end if;

  raise notice '0031 OK — miroir formatted_address ⇄ address_line robuste au sentinel ''—'' (T1..T9 PASS)';
end $$;

-- ── Nettoyage des fixtures (+ lignes d'audit générées) ─────────────────────
delete from parks where id in (
  'a0310031-0000-4000-a000-000000000001',
  'a0310031-0000-4000-a000-000000000002',
  'a0310031-0000-4000-a000-000000000003'
);
delete from audit_log where entity_type = 'parks' and entity_id in (
  'a0310031-0000-4000-a000-000000000001',
  'a0310031-0000-4000-a000-000000000002',
  'a0310031-0000-4000-a000-000000000003'
);

-- ── Assertions structurelles ──────────────────────────────────────────────
do $$
declare n int;
begin
  -- 1. plus aucune ligne `address_line = '—'`
  select count(*) into n from parks where address_line = '—';
  if n > 0 then raise exception '0031: % lignes address_line = ''—'' après backfill', n; end if;

  -- 2. la fonction neutralise bien le sentinel dans les dérivations vers address_line
  select count(*) into n from pg_proc
   where proname = 'parks_v1_compat'
     and prosrc ~ 'nullif\(nullif\(new\.formatted_address, ''''\), ''—''\)';
  if n < 1 then raise exception '0031: parks_v1_compat ne neutralise pas le sentinel ''—'' vers address_line'; end if;

  -- 3. l'ancienne forme non protégée n'existe plus pour la dérivation address_line
  select count(*) into n from pg_proc
   where proname = 'parks_v1_compat'
     and prosrc ~ 'new\.address_line := nullif\(new\.formatted_address, ''''\);';
  if n > 0 then raise exception '0031: parks_v1_compat garde encore la dérivation non protégée vers address_line';
  end if;

  -- 4. la contrainte NOT NULL sur formatted_address est conservée
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'parks'
               and column_name = 'formatted_address' and is_nullable = 'YES') then
    raise exception '0031: formatted_address ne doit pas devenir nullable';
  end if;

  raise notice '0031 OK — assertions structurelles PASS';
end $$;
