-- ════════════════════════════════════════════════════════════════════════════
-- 0028 — Nouvelle valeur d'enum source_type : 'reverse_geocode'
-- ════════════════════════════════════════════════════════════════════════════
-- Contexte : les tags `addr:*` OSM ne couvrent que ~0,5% des 2201 parcs
-- importés (audit diagnostic du chantier adresses). Le reverse geocoding
-- (Geoapify) devient nécessaire pour le reste, mais ne doit jamais écraser :
--   1. une adresse Toboggo/collectivité vérifiée (source_type toboggo/municipality)
--   2. un tag addr:* OSM explicite (source_type osm)
--
-- Le mécanisme générique park_attribute_sources / source_priority() /
-- can_source_replace_attribute() / set_park_attribute_source() (migration 0024)
-- est déjà conçu pour cette granularité (un "attribute_key" arbitraire par
-- parc, une seule ligne "is_current" à la fois, historisée) : AUCUNE évolution
-- de schéma n'est nécessaire au-delà de ces deux migrations (0028 + 0029).
-- Seuls manquent : (a) cette valeur d'enum, (b) son rang dans source_priority()
-- — traité à part dans 0029, car PostgreSQL interdit d'utiliser une valeur
-- d'enum tout juste ajoutée (ALTER TYPE ... ADD VALUE) dans une fonction
-- créée/remplacée au sein de LA MÊME transaction (SQLSTATE 55P04, testé en
-- local). D'où le split en deux fichiers de migration distincts.
--
-- attribute_key utilisé pour l'adresse : 'address' (une seule clé, valeur
-- jsonb composite {address_line, postal_code, city, admin_area_1, admin_area_2})
-- plutôt que 4 clés séparées — pour garantir qu'un remplacement d'adresse est
-- toujours atomique (jamais un mélange housenumber-OSM + city-reverse-geocode).
--
-- NON DESTRUCTIF : ALTER TYPE ... ADD VALUE est purement additif (0 DROP,
-- 0 DELETE/TRUNCATE).
-- ════════════════════════════════════════════════════════════════════════════

alter type source_type add value if not exists 'reverse_geocode';

-- ── Assertion ──────────────────────────────────────────────────────────────
-- Lookup catalogue pur (pg_enum), pas une comparaison utilisant la valeur —
-- même précaution/pattern que 0007 pour report_status.in_progress.
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'source_type' and e.enumlabel = 'reverse_geocode'
  ) then
    raise exception '0028: source_type.reverse_geocode absent après ALTER TYPE';
  end if;

  raise notice '0028 OK — source_type.reverse_geocode ajouté (priorité définie en 0029)';
end $$;
