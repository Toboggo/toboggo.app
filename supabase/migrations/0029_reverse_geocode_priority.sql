-- ════════════════════════════════════════════════════════════════════════════
-- 0029 — Priorité de `reverse_geocode` dans source_priority()
-- ════════════════════════════════════════════════════════════════════════════
-- Séparé de 0028 : la valeur d'enum 'reverse_geocode' doit avoir été commitée
-- dans une transaction précédente avant de pouvoir être référencée dans le
-- corps d'une fonction (sinon SQLSTATE 55P04 "unsafe use of new value").
--
-- Ordre de priorité voulu (décision produit) :
--   toboggo (100) > municipality (90) > open_data (80) > partner (70)
--   > osm (50) > reverse_geocode (45) > user (40) > other (10)
--
-- reverse_geocode se place SOUS osm : un tag addr:* OSM explicite reste
-- toujours supérieur à une inférence automatique. Il se place AU-DESSUS de
-- user : une adresse déduite par géocodage est jugée plus fiable qu'une
-- saisie parent non vérifiée — mais reste sous toute source humaine ou
-- officielle. (Le tandem osm/user n'a pas été demandé explicitement par la
-- décision d'architecture ; ce point est une hypothèse assumée, à confirmer.)
--
-- NON DESTRUCTIF : CREATE OR REPLACE FUNCTION (identique en style à 0024,
-- 0 DROP, 0 DELETE/TRUNCATE).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function source_priority(p_source_type source_type)
returns integer
language sql
immutable
as $$
  select case p_source_type
    when 'toboggo'         then 100
    when 'municipality'    then 90
    when 'open_data'       then 80
    when 'partner'         then 70
    when 'osm'             then 50
    when 'reverse_geocode' then 45
    when 'user'            then 40
    when 'other'           then 10
    else 0
  end;
$$;

-- ── Assertions ─────────────────────────────────────────────────────────────
do $$
begin
  if source_priority('osm') <= source_priority('reverse_geocode') then
    raise exception '0029: osm doit rester prioritaire sur reverse_geocode';
  end if;

  if source_priority('reverse_geocode') <= source_priority('user') then
    raise exception '0029: reverse_geocode doit rester prioritaire sur user';
  end if;

  if source_priority('municipality') <= source_priority('reverse_geocode') then
    raise exception '0029: municipality doit rester prioritaire sur reverse_geocode';
  end if;

  if source_priority('toboggo') <= source_priority('reverse_geocode') then
    raise exception '0029: toboggo doit rester prioritaire sur reverse_geocode';
  end if;

  raise notice '0029 OK — source_priority(reverse_geocode) = 45 (entre osm=50 et user=40)';
end $$;
