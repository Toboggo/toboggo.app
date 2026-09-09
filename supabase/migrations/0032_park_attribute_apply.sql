-- ════════════════════════════════════════════════════════════════════════════
-- 0032 — `apply_park_attribute()` : écriture UNIQUE d'un attribut suivi
--        (source → gate de priorité → archive → projection canonique)
-- ────────────────────────────────────────────────────────────────────────────
-- CONTEXTE (audit backups/AUDIT-modele-multisource-2026-09-07.md, D3 Phase 1)
-- ---------------------------------------------------------------------------
-- Le back-office écrit aujourd'hui `parks.*` en direct (`updatePark()` →
-- `supabase.from("parks").update(...)`) SANS créer de ligne
-- `park_attribute_sources`. Conséquence : pour un attribut jamais enregistré
-- par la provenance, `current_attribute_source_priority()` renvoie 0, donc
-- `can_source_replace_attribute(park, attr, 'osm')` = `50 >= 0` = vrai → un
-- réimport OSM écrase silencieusement la correction humaine.
--
-- Les scripts d'import OSM eux-mêmes divergent :
--   • import-osm-local.py  gate name / min_age / max_age / address
--   • import-osm-remote.py gate UNIQUEMENT address (chemin prod)
-- et AUCUN des deux ne gate latitude / longitude.
--
-- OBJECTIF PHASE 1 (strict) — fermer le trou avec le minimum de code robuste :
--   une valeur corrigée/validée manuellement dans Toboggo pour un attribut
--   couvert ne peut plus être écrasée silencieusement par une source
--   automatique moins prioritaire (OSM, reverse_geocode).
--
-- Attributs couverts par cette phase : name, min_age, max_age, address, location.
-- Hors périmètre (documenté, réservé Phase 2) : park_features, source_records,
-- pipeline open data, déduplication multi-source, table d'historique dédiée.
--
-- POURQUOI PAS DE COLONNE `locked` ICI
-- -----------------------------------
-- La protection recherchée = « une source AUTOMATIQUE moins prioritaire ne
-- peut plus écraser ». Le barème existant (`source_priority`, migration 0024)
-- suffit déjà : toute source humaine du back-office est enregistrée en
-- `toboggo` (100) ou `municipality` (90). Or toutes les sources non humaines
-- sont strictement en dessous : `open_data` 80, `partner` 70, `osm` 50,
-- `reverse_geocode` 45, `user` 40, `other` 10. Donc
-- `can_source_replace_attribute(park, attr, <source auto>)` renvoie déjà
-- `false` dès qu'une valeur `toboggo`/`municipality` est enregistrée — sans
-- verrou. Un `locked` ne servirait qu'à bloquer une source de priorité
-- SUPÉRIEURE OU ÉGALE (ex. empêcher un futur flux `partner` d'écraser une
-- valeur `toboggo`, ou un `toboggo` d'écraser un autre `toboggo` par réimport) :
-- c'est un besoin de Phase 2 (flux partenaires / fraîcheur), pas de la
-- fermeture du trou critique. On ne l'ajoute donc pas.
--
-- NON DESTRUCTIF : uniquement `CREATE OR REPLACE FUNCTION` (0 DROP, 0 DELETE
-- hors fixtures de test éphémères nettoyées en fin de migration). Aucune
-- migration figée (0001→0031) touchée. Aucune policy RLS modifiée.
--
-- SÉCURITÉ : `SECURITY INVOKER` (moindre privilège, comme `recalculate_park_score`
-- en 0017). Toutes les écritures internes (`parks`, `park_sources`,
-- `park_attribute_sources`) restent soumises aux policies existantes
-- (`parks_update`, `park_sources_write`, `park_attr_src_write` = `can_edit_park`).
-- Un appelant non autorisé est rejeté par la RLS, exactement comme aujourd'hui.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Conventions de `p_value_json` (identiques à ce qu'écrivent les imports OSM
--    via `set_park_attribute_source`) ──────────────────────────────────────
--   name              scalaire JSON string   ex.  "Square des Tilleuls"
--   min_age / max_age scalaire JSON number    ex.  3
--   address           objet JSON             {address_line, postal_code, city,
--                                              admin_area_1, admin_area_2}
--   location          objet JSON             {lat, lng}
-- ────────────────────────────────────────────────────────────────────────────
create or replace function apply_park_attribute(
  p_park_id       uuid,
  p_attribute_key text,
  p_value_json    jsonb,
  p_source_type   source_type default null,
  p_confidence    numeric     default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid         uuid := auth.uid();
  v_source_type source_type;
  v_source_id   uuid;
  v_row_id      uuid;
  v_existing_id uuid;
  v_text        text;
  v_lat         numeric(9,6);
  v_lng         numeric(9,6);
begin
  if p_park_id is null then
    raise exception 'apply_park_attribute: p_park_id NULL';
  end if;
  if p_value_json is null or p_value_json = 'null'::jsonb then
    raise exception 'apply_park_attribute: p_value_json NULL/JSON-null pour «%»', p_attribute_key;
  end if;
  if p_attribute_key not in ('name','min_age','max_age','address','location') then
    raise exception 'apply_park_attribute: attribut «%» hors périmètre Phase 1 '
                    '(name/min_age/max_age/address/location)', p_attribute_key
      using errcode = 'check_violation';
  end if;

  -- ── Type de source ───────────────────────────────────────────────────────
  -- Contexte AUTHENTIFIÉ (back-office via PostgREST) : la source découle du
  -- rôle réel de l'acteur, `p_source_type` est IGNORÉ — un gestionnaire ne
  -- peut pas se déclarer `toboggo` pour gagner en priorité.
  -- Contexte DE CONFIANCE (migration, psql, script d'import, tests —
  -- `auth.uid()` NULL) : `p_source_type` explicite, défaut `toboggo`.
  if v_uid is null then
    v_source_type := coalesce(p_source_type, 'toboggo');
  elsif is_toboggo_staff(v_uid) then
    v_source_type := 'toboggo';
  elsif manages_park(v_uid, p_park_id) then
    v_source_type := 'municipality';
  else
    raise exception 'apply_park_attribute: acteur % non autorisé à éditer le parc %',
      v_uid, p_park_id
      using errcode = 'insufficient_privilege';
  end if;

  -- ── Gate de priorité (règle EXISTANTE, comparateur `>=`) ─────────────────
  if not can_source_replace_attribute(p_park_id, p_attribute_key, v_source_type) then
    raise exception 'apply_park_attribute: la source % ne peut pas remplacer «%» '
                    '(une source de priorité supérieure protège déjà cette valeur)',
      v_source_type, p_attribute_key
      using errcode = 'check_violation';
  end if;

  -- ── Idempotence : si la valeur courante est DÉJÀ identique ET provient
  --    d'une source du même type, ne rien ré-archiver (une sauvegarde
  --    back-office renvoie souvent le nom / l'adresse inchangés — évite de
  --    faire grossir l'historique pour rien). ─────────────────────────────
  select pas.id into v_existing_id
  from park_attribute_sources pas
  join park_sources ps on ps.id = pas.source_id
  where pas.park_id = p_park_id
    and pas.attribute_key = p_attribute_key
    and pas.is_current
    and ps.source_type = v_source_type
    and pas.value_json = p_value_json;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  -- ── `park_sources` : find-or-create pour ce (parc, type) ─────────────────
  --    (même logique que les scripts d'import : pas de contrainte d'unicité
  --     sur (park_id, source_type), on prend la 1re ligne ou on l'insère)
  select id into v_source_id
  from park_sources
  where park_id = p_park_id and source_type = v_source_type
  limit 1;

  if v_source_id is null then
    insert into park_sources (park_id, source_type, source_name, last_synced_at)
    values (
      p_park_id, v_source_type,
      case v_source_type
        when 'toboggo'      then 'Toboggo — saisie back-office'
        when 'municipality' then 'Collectivité — saisie back-office'
        else v_source_type::text
      end,
      now()
    )
    returning id into v_source_id;
  else
    update park_sources set last_synced_at = now() where id = v_source_id;
  end if;

  -- ── Provenance : archive la valeur courante (is_current=false), insère la
  --    nouvelle (is_current=true). `verified_at = now()` : édition humaine. ──
  v_row_id := set_park_attribute_source(
    p_park_id, p_attribute_key, p_value_json, v_source_id, p_confidence, now()
  );

  -- ── Projection canonique — TOUJOURS via `parks` (jamais les colonnes V1 en
  --    direct) pour laisser le trigger `parks_v1_compat_biu` resynchroniser
  --    lat/lng, age_min/age_max, formatted_address. ────────────────────────
  if p_attribute_key = 'name' then
    v_text := p_value_json #>> '{}';
    if v_text is null or length(btrim(v_text)) = 0 then
      raise exception 'apply_park_attribute: name vide';
    end if;
    update parks set name = v_text where id = p_park_id;

  elsif p_attribute_key = 'min_age' then
    update parks set min_age = (p_value_json #>> '{}')::smallint, ages_derived = false
    where id = p_park_id;

  elsif p_attribute_key = 'max_age' then
    update parks set max_age = (p_value_json #>> '{}')::smallint, ages_derived = false
    where id = p_park_id;

  elsif p_attribute_key = 'address' then
    update parks set
      address_line = p_value_json ->> 'address_line',
      postal_code  = p_value_json ->> 'postal_code',
      city         = p_value_json ->> 'city',
      admin_area_1 = p_value_json ->> 'admin_area_1',
      admin_area_2 = p_value_json ->> 'admin_area_2'
    where id = p_park_id;

  elsif p_attribute_key = 'location' then
    if (p_value_json ->> 'lat') is null or (p_value_json ->> 'lng') is null then
      raise exception 'apply_park_attribute: location attend {"lat":…,"lng":…}';
    end if;
    v_lat := (p_value_json ->> 'lat')::numeric(9,6);
    v_lng := (p_value_json ->> 'lng')::numeric(9,6);
    update parks set latitude = v_lat, longitude = v_lng where id = p_park_id;
  end if;

  return v_row_id;
end $$;

comment on function apply_park_attribute(uuid, text, jsonb, source_type, numeric) is
  'Phase 1 D3 — écriture UNIQUE d''un attribut suivi (name/min_age/max_age/address/'
  'location) : détermine la source (rôle si authentifié, sinon p_source_type), '
  'applique le gate can_source_replace_attribute, archive la provenance courante '
  'via set_park_attribute_source, projette la valeur canonique dans parks. '
  'SECURITY INVOKER : les policies RLS de l''acteur s''appliquent.';

-- ════════════════════════════════════════════════════════════════════════════
-- Tests comportementaux — fixture éphémère, nettoyée en fin de migration.
-- `auth.uid()` est NULL en contexte migration ⇒ `p_source_type` explicite.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  p       uuid := 'a0320032-0000-4000-a000-000000000001';
  s_osm   uuid;
  v_name  text;
  v_city  text;
  v_lat   numeric;
  v_can   boolean;
  n_arch  int;
  n_curr  int;
  v_src   source_type;
begin
  -- ── État initial : parc issu d'OSM, nom 'A' enregistré par OSM (prio 50) ──
  insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status)
  values (p, 'Aire de jeux A', 43.6, 1.44, 'FR', 'Europe/Paris', 'published');

  insert into park_sources (park_id, source_type, source_name)
  values (p, 'osm', 'OpenStreetMap') returning id into s_osm;
  perform set_park_attribute_source(p, 'name', '"Aire de jeux A"'::jsonb, s_osm, 0.700, null);

  -- ── T1 : un admin Toboggo remplace le nom par 'B' ───────────────────────
  perform apply_park_attribute(p, 'name', '"Aire de jeux B"'::jsonb, 'toboggo', 1.0);
  select name into v_name from parks where id = p;
  if v_name is distinct from 'Aire de jeux B' then
    raise exception '0032 T1: parks.name=% (attendu « Aire de jeux B »)', v_name;
  end if;

  -- ── T2 : OSM ne peut plus remplacer `name` ─────────────────────────────
  select can_source_replace_attribute(p, 'name', 'osm') into v_can;
  if v_can then raise exception '0032 T2: OSM peut encore remplacer name après édition humaine'; end if;

  -- ── T3 : ancienne provenance OSM archivée, exactement une courante ──────
  select count(*) filter (where not is_current), count(*) filter (where is_current)
    into n_arch, n_curr
  from park_attribute_sources where park_id = p and attribute_key = 'name';
  if n_arch < 1 then raise exception '0032 T3: provenance OSM non archivée (is_current=false absent)'; end if;
  if n_curr <> 1 then raise exception '0032 T3: % lignes is_current pour name (attendu 1)', n_curr; end if;

  -- ── T4 : la source courante de `name` est bien `toboggo` ───────────────
  select ps.source_type into v_src
  from park_attribute_sources pas join park_sources ps on ps.id = pas.source_id
  where pas.park_id = p and pas.attribute_key = 'name' and pas.is_current;
  if v_src is distinct from 'toboggo' then
    raise exception '0032 T4: source courante de name = % (attendu toboggo)', v_src;
  end if;

  -- ── T5 : réimport OSM simulé (gate) — la valeur humaine 'B' reste ──────
  update parks set name = case
    when can_source_replace_attribute(p, 'name', 'osm') then 'Aire de jeux C' else name end
  where id = p;
  select name into v_name from parks where id = p;
  if v_name is distinct from 'Aire de jeux B' then
    raise exception '0032 T5: un réimport OSM a écrasé la valeur humaine (name=%)', v_name;
  end if;

  -- ── T6 : remplacement NORMAL quand rien de plus prioritaire (min_age) ──
  perform apply_park_attribute(p, 'min_age', '3'::jsonb, 'toboggo', 1.0);
  if (select min_age from parks where id = p) is distinct from 3 then
    raise exception '0032 T6: min_age non projeté';
  end if;

  -- ── T7 : adresse composite (municipality) projetée ────────────────────
  perform apply_park_attribute(
    p, 'address',
    '{"address_line":"1 Rue Test","postal_code":"31000","city":"Toulouse","admin_area_1":null,"admin_area_2":null}'::jsonb,
    'municipality', null
  );
  select city into v_city from parks where id = p;
  if v_city is distinct from 'Toulouse' then raise exception '0032 T7: address.city non projetée (city=%)', v_city; end if;

  -- ── T8 : `municipality` (90) NE PEUT PAS écraser un `name` `toboggo` (100)
  begin
    perform apply_park_attribute(p, 'name', '"Tentative collectivité"'::jsonb, 'municipality', null);
    raise exception '0032 T8: municipality a pu écraser un name toboggo (gate inopérant)';
  exception when check_violation then
    null;  -- comportement attendu
  end;

  -- ── T9 : location — projection + gate ─────────────────────────────────
  perform apply_park_attribute(p, 'location', '{"lat":43.61,"lng":1.45}'::jsonb, 'toboggo', null);
  select latitude into v_lat from parks where id = p;
  if v_lat is distinct from 43.61 then raise exception '0032 T9: latitude non projetée (latitude=%)', v_lat; end if;
  if can_source_replace_attribute(p, 'location', 'osm') then
    raise exception '0032 T9: OSM peut encore écraser une location éditée';
  end if;
  if not can_source_replace_attribute(p, 'location', 'toboggo') then
    raise exception '0032 T9: toboggo ne peut plus re-remplacer sa propre location';
  end if;

  -- ── T10 : non-régression parc PUREMENT OSM (aucune édition humaine) ────
  --         un réimport OSM met toujours à jour `name`.
  declare
    p2 uuid := 'a0320032-0000-4000-a000-000000000002';
    s2 uuid;
  begin
    insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status)
    values (p2, 'Parc OSM pur', 44.0, 2.0, 'FR', 'Europe/Paris', 'published');
    insert into park_sources (park_id, source_type, source_name)
    values (p2, 'osm', 'OpenStreetMap') returning id into s2;
    perform set_park_attribute_source(p2, 'name', '"Parc OSM pur"'::jsonb, s2, 0.700, null);
    if not can_source_replace_attribute(p2, 'name', 'osm') then
      raise exception '0032 T10: OSM bloqué sur un parc pourtant purement OSM (régression)';
    end if;
    delete from parks where id = p2;
  end;

  -- ── T11 : idempotence — ré-appliquer la MÊME valeur/source ne crée pas
  --         de nouvelle ligne d'historique. ─────────────────────────────
  declare
    n_before int;
    n_after  int;
  begin
    select count(*) into n_before from park_attribute_sources
      where park_id = p and attribute_key = 'name';
    perform apply_park_attribute(p, 'name', '"Aire de jeux B"'::jsonb, 'toboggo', 1.0);
    perform apply_park_attribute(p, 'name', '"Aire de jeux B"'::jsonb, 'toboggo', 1.0);
    select count(*) into n_after from park_attribute_sources
      where park_id = p and attribute_key = 'name';
    if n_after <> n_before then
      raise exception '0032 T11: ré-application identique a créé % ligne(s) d''historique', n_after - n_before;
    end if;
  end;

  raise notice '0032 OK — apply_park_attribute : provenance + gate + projection + idempotence (T1..T11 PASS)';
end $$;

-- ── Nettoyage des fixtures (+ lignes d'audit générées par les triggers) ────
delete from parks where id in (
  'a0320032-0000-4000-a000-000000000001',
  'a0320032-0000-4000-a000-000000000002'
);
delete from audit_log where entity_type = 'parks' and entity_id in (
  'a0320032-0000-4000-a000-000000000001',
  'a0320032-0000-4000-a000-000000000002'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Assertions structurelles
-- ════════════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regprocedure('apply_park_attribute(uuid,text,jsonb,source_type,numeric)') is null then
    raise exception '0032: apply_park_attribute(uuid,text,jsonb,source_type,numeric) absente';
  end if;

  -- SECURITY INVOKER (jamais DEFINER) — moindre privilège, RLS de l'acteur
  if (select prosecdef from pg_proc
      where oid = 'apply_park_attribute(uuid,text,jsonb,source_type,numeric)'::regprocedure) then
    raise exception '0032: apply_park_attribute ne doit pas être SECURITY DEFINER';
  end if;

  -- search_path épinglé
  if not exists (
    select 1 from pg_proc p, unnest(coalesce(p.proconfig, array[]::text[])) c
    where p.oid = 'apply_park_attribute(uuid,text,jsonb,source_type,numeric)'::regprocedure
      and c like 'search_path=%'
  ) then
    raise exception '0032: apply_park_attribute sans search_path épinglé';
  end if;

  -- les primitives réutilisées existent toujours (aucune recréation ici)
  if to_regprocedure('set_park_attribute_source(uuid,text,jsonb,uuid,numeric,timestamptz)') is null
     or to_regprocedure('can_source_replace_attribute(uuid,text,source_type)') is null then
    raise exception '0032: primitives de provenance (0024) manquantes';
  end if;

  raise notice '0032 OK — assertions structurelles PASS';
end $$;
