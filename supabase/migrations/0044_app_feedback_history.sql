-- ════════════════════════════════════════════════════════════════════════════
-- 0044 — Historique des avis sur l'app Toboggo : PHASE 1, compatible ancien front
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIVE ET RÉTROCOMPATIBLE : à appliquer AVANT le déploiement du
-- nouveau front. Le client actuellement en production enregistre l'avis par
-- `upsert(onConflict: "user_id")` (INSERT … ON CONFLICT (user_id) DO UPDATE) :
-- cette migration CONSERVE donc `UNIQUE(user_id)` et n'ajoute aucun trigger
-- BEFORE INSERT (qui se déclencherait avant la résolution du conflit et
-- refuserait une modification faite par l'ancien client). Le contrat de 0039
-- reste intact pour lui : titre + texte envoyés, un avis par utilisateur.
--
--   • titre et commentaire deviennent facultatifs (aucune ligne modifiée) ;
--   • `edited_at` : date de modification (posée par le trigger de garde) ;
--   • seul le DERNIER avis d'un utilisateur est modifiable (policy UPDATE) —
--     avec un avis unique, c'est toujours le sien : sans effet pour l'ancien front ;
--   • vues `app_feedback_latest` / `app_feedback_summary` (security_invoker,
--     RLS d'`app_feedback`, aucun accès anon) : note globale = derniers avis.
--
-- La phase 2 (0045) supprime UNIQUE(user_id) et ajoute le délai de 30 jours :
-- à appliquer APRÈS le déploiement du nouveau front.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.app_feedback drop constraint if exists app_feedback_title_check;
alter table public.app_feedback drop constraint if exists app_feedback_body_check;

alter table public.app_feedback alter column title drop not null;
alter table public.app_feedback alter column body drop not null;

alter table public.app_feedback
  add constraint app_feedback_title_check
    check (title is null or char_length(btrim(title)) between 1 and 100),
  add constraint app_feedback_body_check
    check (body is null or char_length(btrim(body)) between 1 and 2000);

alter table public.app_feedback add column if not exists edited_at timestamptz;

create index if not exists app_feedback_user_created_idx
  on public.app_feedback (user_id, created_at desc, id desc);

-- ── Modification : propriétaire/date de création immuables, edited_at tenu ──
create or replace function public.app_feedback_guard() returns trigger as $$
begin
  new.user_id    := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.edited_at  := now();
  return new;
end $$ language plpgsql set search_path = public, pg_temp;

-- ── Seul le dernier avis de l'utilisateur est modifiable ────────────────────
drop policy if exists app_feedback_update on public.app_feedback;
create policy app_feedback_update on public.app_feedback
  for update to authenticated
  using (
    user_id = auth.uid()
    and not exists (
      select 1 from public.app_feedback newer
      where newer.user_id = app_feedback.user_id
        and (newer.created_at, newer.id) > (app_feedback.created_at, app_feedback.id)
    )
  )
  with check (user_id = auth.uid());

-- ── Dernier avis par utilisateur + synthèse (note globale) ──────────────────
create or replace view public.app_feedback_latest
  with (security_invoker = true) as
  select distinct on (user_id) *
  from public.app_feedback
  order by user_id, created_at desc, id desc;

create or replace view public.app_feedback_summary
  with (security_invoker = true) as
  select
    count(*)::int                                   as rating_count,
    round(avg(rating)::numeric, 2)                  as average_rating,
    count(*) filter (where rating = 1)::int         as count_1,
    count(*) filter (where rating = 2)::int         as count_2,
    count(*) filter (where rating = 3)::int         as count_3,
    count(*) filter (where rating = 4)::int         as count_4,
    count(*) filter (where rating = 5)::int         as count_5,
    (select count(*) from public.app_feedback)::int as total_submissions
  from public.app_feedback_latest;

revoke all on public.app_feedback_latest, public.app_feedback_summary from anon, public;
grant select on public.app_feedback_latest, public.app_feedback_summary to authenticated;

comment on view public.app_feedback_latest is
  'Dernier avis de chaque utilisateur (security_invoker : RLS d''app_feedback).';
