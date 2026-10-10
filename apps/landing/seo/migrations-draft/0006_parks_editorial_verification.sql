-- ⚠️ BROUILLON — NON APPLIQUÉ. Ne PAS copier dans supabase/migrations/ sans accord explicite.
-- Contraintes du dépôt : migration ADDITIVE uniquement (aucun DROP, aucune réécriture de 0001→0038),
-- jamais `db push --linked` ni `migration repair` en production ; validation locale puis staging (--db-url) d abord.
-- Numérotation cible : 0039+ (dernière migration existante : 0038).
--
-- Vérification éditoriale réelle (signal de qualité du palier 3). Complète
-- parks.verification_status / last_verified_at, aujourd'hui jamais renseignés.

alter table parks
  add column if not exists editorial_verified_at timestamptz,
  add column if not exists editorial_verified_by uuid references auth.users (id) on delete set null,
  add column if not exists editorial_note        text,
  add column if not exists description_reviewed_at timestamptz;

comment on column parks.editorial_verified_at is
  'Date à laquelle un humain a relu la fiche (nom, adresse, équipements). NULL = jamais relue.';
