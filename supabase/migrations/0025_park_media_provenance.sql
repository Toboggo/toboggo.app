-- ════════════════════════════════════════════════════════════════════════════
-- 0025 — Provenance des médias de parc (`park_media`)
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF — ajoute uniquement des colonnes nullables à `park_media`.
-- Aucun DROP, aucun DELETE, aucune modification de politique RLS.
--
-- Objectif : une photo de parc doit avoir une provenance identifiable.
--   * `source`       — d'où vient la photo (enum `source_type` réutilisé :
--                      'user' = parent/contributeur, 'municipality' = collectivité,
--                      'toboggo' = staff, 'open_data'/'partner' = sources ouvertes…).
--                      NULL = provenance inconnue (médias historiques).
--   * `source_url`   — URL d'origine (page de la photo chez la source).
--   * `author`       — auteur / photographe déclaré.
--   * `license`      — licence d'exploitation ('CC-BY-SA-4.0', '© Ville de …', …).
--   * `attribution`  — mention de crédit prête à afficher.
--
-- Règle produit : OSM ne crée AUCUNE ligne `park_media`. Une image générée,
-- illustrative ou générique ne doit jamais être enregistrée comme photo de parc.
-- Le placeholder Toboggo est un état d'UI, jamais une ligne en base.
--
-- Idempotent : `add column if not exists`.
-- Données réelles : `park_media` vide en local / staging / prod au moment de
-- cette migration -> 0 ligne à rétro-remplir.
-- ════════════════════════════════════════════════════════════════════════════

alter table park_media add column if not exists source       source_type;
alter table park_media add column if not exists source_url   text;
alter table park_media add column if not exists author        text;
alter table park_media add column if not exists license       text;
alter table park_media add column if not exists attribution   text;

comment on column park_media.source is
  'Provenance de la photo (enum source_type). NULL = inconnue. OSM n''insère jamais de park_media.';
comment on column park_media.source_url is 'URL d''origine de la photo chez la source.';
comment on column park_media.author is 'Auteur / photographe déclaré.';
comment on column park_media.license is 'Licence d''exploitation (ex. CC-BY-SA-4.0, © Ville de X).';
comment on column park_media.attribution is 'Mention de crédit prête à afficher.';

-- Rétro-remplissage sûr : les lignes existantes rattachées à un utilisateur
-- sont des dépôts contributeur -> source = 'user'. (0 ligne attendue.)
update park_media
   set source = 'user'
 where source is null
   and user_id is not null;

do $$
declare
  c_media int;
  c_no_source int;
begin
  select count(*) into c_media from park_media;
  select count(*) into c_no_source from park_media where source is null;
  raise notice '0025 OK — park_media: % lignes, % sans provenance (colonnes ajoutées)',
    c_media, c_no_source;
end $$;
