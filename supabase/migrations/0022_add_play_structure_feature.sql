-- 0022 — Ajout de la feature structure de jeu
-- Mapping OSM : playground=structure -> play_structure

insert into features (
  code,
  category,
  label_key,
  icon_key,
  value_set,
  sort_order
)
values (
  'play_structure',
  'play',
  'feature.play_structure',
  'playground',
  null,
  35
)
on conflict (code) do nothing;