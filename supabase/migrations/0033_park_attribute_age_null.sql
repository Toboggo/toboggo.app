-- 0033 — D3 Phase 1.1
-- Autorise l'effacement explicite de min_age / max_age via apply_park_attribute.
-- SQL NULL et JSON null sont normalisés en JSON null pour la provenance.
-- Aucun changement de table, policy ou RLS.

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
  v_value_json  jsonb;
  v_text        text;
  v_lat         numeric(9,6);
  v_lng         numeric(9,6);
begin
  if p_park_id is null then
    raise exception 'apply_park_attribute: p_park_id NULL';
  end if;
  -- SQL NULL envoyé par PostgREST et JSON `null` ont la même sémantique :
  -- un effacement explicite. On normalise en JSON null afin de pouvoir
  -- conserver cette assertion dans park_attribute_sources.value_json NOT NULL.
  v_value_json := coalesce(p_value_json, 'null'::jsonb);

  if v_value_json = 'null'::jsonb
     and p_attribute_key not in ('min_age','max_age') then
    raise exception 'apply_park_attribute: valeur NULL interdite pour «%»', p_attribute_key
      using errcode = 'check_violation';
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
    and pas.value_json = v_value_json;
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
    p_park_id, p_attribute_key, v_value_json, v_source_id, p_confidence, now()
  );

  -- ── Projection canonique — TOUJOURS via `parks` (jamais les colonnes V1 en
  --    direct) pour laisser le trigger `parks_v1_compat_biu` resynchroniser
  --    lat/lng, age_min/age_max, formatted_address. ────────────────────────
  if p_attribute_key = 'name' then
    v_text := v_value_json #>> '{}';
    if v_text is null or length(btrim(v_text)) = 0 then
      raise exception 'apply_park_attribute: name vide';
    end if;
    update parks set name = v_text where id = p_park_id;

  elsif p_attribute_key = 'min_age' then
    update parks set
      min_age = case
        when v_value_json = 'null'::jsonb then null
        else (v_value_json #>> '{}')::smallint
      end,
      ages_derived = false
    where id = p_park_id;

  elsif p_attribute_key = 'max_age' then
    update parks set
      max_age = case
        when v_value_json = 'null'::jsonb then null
        else (v_value_json #>> '{}')::smallint
      end,
      ages_derived = false
    where id = p_park_id;

  elsif p_attribute_key = 'address' then
    update parks set
      address_line = v_value_json ->> 'address_line',
      postal_code  = v_value_json ->> 'postal_code',
      city         = v_value_json ->> 'city',
      admin_area_1 = v_value_json ->> 'admin_area_1',
      admin_area_2 = v_value_json ->> 'admin_area_2'
    where id = p_park_id;

  elsif p_attribute_key = 'location' then
    if (v_value_json ->> 'lat') is null or (v_value_json ->> 'lng') is null then
      raise exception 'apply_park_attribute: location attend {"lat":…,"lng":…}';
    end if;
    v_lat := (v_value_json ->> 'lat')::numeric(9,6);
    v_lng := (v_value_json ->> 'lng')::numeric(9,6);
    update parks set latitude = v_lat, longitude = v_lng where id = p_park_id;
  end if;

  return v_row_id;
end $$;


comment on function apply_park_attribute(uuid, text, jsonb, source_type, numeric) is
  'D3 Phase 1.1 — écriture provenance des attributs suivis. Les clears explicites '
  'de min_age/max_age sont acceptés et historisés comme JSON null ; les valeurs '
  'NULL restent interdites pour name/address/location. SECURITY INVOKER.';


-- ─────────────────────────────────────────────────────────────────────
-- Assertions Phase 1.1 — fixtures éphémères, intégralement nettoyées.
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  p uuid := '50000033-0033-4000-8000-000000000033';
  first_clear_id uuid;
  second_clear_id uuid;
begin
  insert into parks (
    id, name, latitude, longitude,
    country_code, timezone,
    min_age, max_age,
    moderation_status, operational_status
  )
  values (
    p, '__0033_age_null_test__', 43.600000, 1.440000,
    'FR', 'Europe/Paris',
    3, 12,
    'published', 'active'
  );

  -- T1 — SQL NULL : clear min_age.
  first_clear_id := apply_park_attribute(
    p, 'min_age', null, 'toboggo', 1.0
  );

  if (select min_age from parks where id = p) is not null then
    raise exception '0033 T1: SQL NULL non projeté vers parks.min_age';
  end if;

  if not exists (
    select 1
    from park_attribute_sources
    where id = first_clear_id
      and park_id = p
      and attribute_key = 'min_age'
      and is_current
      and value_json = 'null'::jsonb
  ) then
    raise exception '0033 T1: provenance JSON null absente';
  end if;

  -- T2 — même clear : idempotent, aucune nouvelle provenance.
  second_clear_id := apply_park_attribute(
    p, 'min_age', 'null'::jsonb, 'toboggo', 1.0
  );

  if second_clear_id is distinct from first_clear_id then
    raise exception '0033 T2: clear null non idempotent';
  end if;

  if (
    select count(*)
    from park_attribute_sources
    where park_id = p
      and attribute_key = 'min_age'
  ) <> 1 then
    raise exception '0033 T2: historique grossi sur clear idempotent';
  end if;

  -- T3 — une source OSM moins prioritaire ne peut pas remplacer le clear humain.
  if can_source_replace_attribute(p, 'min_age', 'osm') then
    raise exception '0033 T3: OSM peut remplacer un clear Toboggo';
  end if;

  -- T4 — JSON null : clear max_age.
  perform apply_park_attribute(
    p, 'max_age', 'null'::jsonb, 'toboggo', 1.0
  );

  if (select max_age from parks where id = p) is not null then
    raise exception '0033 T4: JSON null non projeté vers parks.max_age';
  end if;

  if not exists (
    select 1
    from park_attribute_sources
    where park_id = p
      and attribute_key = 'max_age'
      and is_current
      and value_json = 'null'::jsonb
  ) then
    raise exception '0033 T4: provenance max_age JSON null absente';
  end if;

  -- T5 — null reste interdit pour name.
  begin
    perform apply_park_attribute(p, 'name', null, 'toboggo', 1.0);
    raise exception '0033 T5: name NULL accepté à tort';
  exception
    when check_violation then null;
  end;

  -- T6 — null reste interdit pour address.
  begin
    perform apply_park_attribute(p, 'address', null, 'toboggo', 1.0);
    raise exception '0033 T6: address NULL accepté à tort';
  exception
    when check_violation then null;
  end;

  -- T7 — null reste interdit pour location.
  begin
    perform apply_park_attribute(p, 'location', null, 'toboggo', 1.0);
    raise exception '0033 T7: location NULL accepté à tort';
  exception
    when check_violation then null;
  end;

  -- Nettoyage complet de la fixture.
  delete from park_attribute_sources where park_id = p;
  delete from park_sources where park_id = p;
  delete from parks where id = p;

  raise notice '0033 OK — age clear provenance SQL/JSON null + idempotence + gate (T1..T7 PASS)';
end
$$;
