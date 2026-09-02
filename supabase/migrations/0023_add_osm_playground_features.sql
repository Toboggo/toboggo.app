-- 0023 — Ajout des features playground OSM manquantes
-- Mapping OSM -> Toboggo

insert into features (
  code,
  category,
  label_key,
  icon_key,
  value_set,
  sort_order
)
values
  ('seesaw',         'play', 'feature.seesaw',         'seesaw',      null, 110),
  ('playhouse',      'play', 'feature.playhouse',      'playhouse',   null, 120),
  ('trampoline',     'play', 'feature.trampoline',     'trampoline',  null, 130),
  ('balance_beam',   'play', 'feature.balance_beam',   'balance',     null, 140),
  ('agility_trail',  'play', 'feature.agility_trail',  'agility',     null, 150),
  ('horizontal_bar', 'play', 'feature.horizontal_bar', 'bar',         null, 160),
  ('hopscotch',      'play', 'feature.hopscotch',      'hopscotch',   null, 170)
on conflict (code) do nothing;