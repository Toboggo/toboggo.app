-- ⚠️ BROUILLON — NON APPLIQUÉ. Ne PAS copier dans supabase/migrations/ sans accord explicite.
-- Contraintes du dépôt : migration ADDITIVE uniquement (aucun DROP, aucune réécriture de 0001→0038),
-- jamais `db push --linked` ni `migration repair` en production ; validation locale puis staging (--db-url) d abord.
-- Numérotation cible : 0039+ (dernière migration existante : 0038).
--
-- Contrôle éditorial de l'indexation d'une fiche : NULL = règle automatique
-- (tiers.ts), 'noindex' = jamais indexée, 'index' = forcée (réservé au staff,
-- n'outrepasse JAMAIS une photo sans droits validés ni une donnée de test).

alter table parks
  add column if not exists seo_override text check (seo_override in ('index', 'noindex'));
