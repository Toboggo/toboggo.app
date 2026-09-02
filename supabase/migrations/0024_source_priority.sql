-- ════════════════════════════════════════════════════════════════════════════
-- 0024 — Priorité des sources & protection des attributs canoniques
-- ════════════════════════════════════════════════════════════════════════════

-- Cette migration centralise la priorité des sources afin qu'une source
-- de faible priorité (ex: OSM) ne puisse pas écraser une donnée Toboggo
-- ou collectivité déjà vérifiée.

create or replace function source_priority(p_source_type source_type)
returns integer
language sql
immutable
as $$
  select case p_source_type
    when 'toboggo'      then 100
    when 'municipality' then 90
    when 'open_data'    then 80
    when 'partner'      then 70
    when 'osm'          then 50
    when 'user'         then 40
    when 'other'        then 10
    else 0
  end;
$$;


-- Retourne la priorité de la source actuellement active pour un attribut.
create or replace function current_attribute_source_priority(
  p_park_id uuid,
  p_attribute_key text
)
returns integer
language sql
stable
as $$
  select coalesce(
    max(source_priority(ps.source_type)),
    0
  )
  from park_attribute_sources pas
  left join park_sources ps
    on ps.id = pas.source_id
  where pas.park_id = p_park_id
    and pas.attribute_key = p_attribute_key
    and pas.is_current = true;
$$;


-- Indique si une source entrante a le droit de remplacer la valeur actuelle.
create or replace function can_source_replace_attribute(
  p_park_id uuid,
  p_attribute_key text,
  p_incoming_source_type source_type
)
returns boolean
language sql
stable
as $$
  select source_priority(p_incoming_source_type)
         >= current_attribute_source_priority(
              p_park_id,
              p_attribute_key
            );
$$;


-- Enregistre une nouvelle valeur canonique pour un attribut
-- et archive automatiquement l'ancienne valeur courante.
create or replace function set_park_attribute_source(
  p_park_id uuid,
  p_attribute_key text,
  p_value_json jsonb,
  p_source_id uuid,
  p_confidence numeric default null,
  p_verified_at timestamptz default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  update park_attribute_sources
  set is_current = false
  where park_id = p_park_id
    and attribute_key = p_attribute_key
    and is_current = true;

  insert into park_attribute_sources (
    park_id,
    attribute_key,
    value_json,
    source_id,
    confidence,
    verified_at,
    is_current
  )
  values (
    p_park_id,
    p_attribute_key,
    p_value_json,
    p_source_id,
    p_confidence,
    p_verified_at,
    true
  )
  returning id into v_id;

  return v_id;
end;
$$;


-- Assertions
do $$
begin
  if source_priority('toboggo') <= source_priority('osm') then
    raise exception '0024: Toboggo doit être prioritaire sur OSM';
  end if;

  if source_priority('municipality') <= source_priority('osm') then
    raise exception '0024: municipality doit être prioritaire sur OSM';
  end if;

  if source_priority('osm') <= source_priority('user') then
    raise exception '0024: OSM doit rester prioritaire sur user non vérifié';
  end if;

  raise notice '0024 OK — source priority functions installed';
end $$;