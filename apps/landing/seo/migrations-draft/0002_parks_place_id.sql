-- ⚠️ BROUILLON — NON APPLIQUÉ. Ne PAS copier dans supabase/migrations/ sans accord explicite.
-- Contraintes du dépôt : migration ADDITIVE uniquement (aucun DROP, aucune réécriture de 0001→0038),
-- jamais `db push --linked` ni `migration repair` en production ; validation locale puis staging (--db-url) d abord.
-- Numérotation cible : 0039+ (dernière migration existante : 0038).
--
-- Rattache chaque parc à une commune de référence. Colonne NULLABLE : aucun
-- backfill ici (rapprochement ville + code postal fait par un script en essai
-- à blanc, local puis staging). parks.city (texte libre) est conservé tel quel.

alter table parks
  add column if not exists place_id uuid references places (id) on delete set null;

create index if not exists parks_place_id_idx on parks (place_id);
