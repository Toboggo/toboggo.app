-- ════════════════════════════════════════════════════════════════════════════
-- 0045 — Historique des avis sur l'app Toboggo : PHASE 2 (après déploiement du front)
-- ────────────────────────────────────────────────────────────────────────────
-- PRÉREQUIS : 0044 appliquée ET nouveau front déployé en production. Après cette
-- migration, un ancien client (upsert onConflict user_id) n'a plus de contrainte
-- unique à inférer : son enregistrement échoue avec un message générique, sans
-- rien corrompre.
--
--   • retrait de UNIQUE(user_id) : plusieurs avis par utilisateur, anciens conservés ;
--   • un NOUVEL avis n'est possible que 30 jours après la création du dernier
--     (une modification ne redémarre pas le délai). Contrôle serveur : trigger
--     BEFORE INSERT + verrou consultatif par utilisateur → deux requêtes
--     concurrentes sont sérialisées, la seconde est refusée
--     (`app_feedback_too_soon`, hint = date autorisée ISO UTC).
-- Aucune ligne n'est supprimée ni réécrite.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.app_feedback drop constraint if exists app_feedback_user_id_key;

create or replace function public.app_feedback_before_insert() returns trigger as $$
declare
  last_created timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('app_feedback:' || new.user_id::text, 0));

  select max(created_at) into last_created from public.app_feedback where user_id = new.user_id;
  if last_created is not null and now() < last_created + interval '30 days' then
    raise exception 'app_feedback_too_soon'
      using errcode = 'P0001',
            hint = to_char((last_created + interval '30 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;
  return new;
end $$ language plpgsql set search_path = public, pg_temp;

drop trigger if exists app_feedback_before_insert on public.app_feedback;
create trigger app_feedback_before_insert before insert on public.app_feedback
  for each row execute function public.app_feedback_before_insert();

comment on table public.app_feedback is
  'Avis sur l''app Toboggo : historique par utilisateur (nouvel avis ≥ 30 j après le dernier, seul le dernier modifiable). Privé : auteur + admins Toboggo. Supprimé avec le compte (cascade).';
