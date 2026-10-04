-- ════════════════════════════════════════════════════════════════════════════
-- 0044 — Historique des avis sur l'application Toboggo (`app_feedback`)
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIVE : aucune ligne d'`app_feedback` n'est supprimée ni réécrite.
-- Fait évoluer 0039 (un avis unique par utilisateur) vers un historique :
--
--   • plusieurs avis par utilisateur (retrait de UNIQUE(user_id)) ;
--   • titre devenu facultatif (l'UI ne le demande plus ; les titres existants
--     sont conservés) ; commentaire facultatif ;
--   • un NOUVEL avis n'est possible que 30 jours après la création du dernier
--     avis (une modification ne redémarre pas le délai). Contrôle serveur par
--     trigger BEFORE INSERT + verrou consultatif par utilisateur : deux
--     requêtes concurrentes sont sérialisées, la seconde est refusée ;
--   • seul le DERNIER avis d'un utilisateur est modifiable (policy UPDATE) ;
--     date de modification enregistrée dans `edited_at`, `created_at` immuable ;
--   • note globale = dernier avis de chaque utilisateur : vues
--     `app_feedback_latest` et `app_feedback_summary` (security_invoker → la
--     RLS s'applique : auteur = ses propres lignes, admin Toboggo = tout ;
--     aucun accès anonyme).
--
-- Compatibilité transition : un ancien client qui fait encore
-- upsert(onConflict: user_id) échoue (plus de contrainte unique) → message
-- générique côté app, rien n'est corrompu. Le front doit être déployé après
-- cette migration.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.app_feedback drop constraint if exists app_feedback_user_id_key;
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

-- ── Nouvel avis : délai de 30 jours, sérialisé par utilisateur ──────────────
create or replace function public.app_feedback_before_insert() returns trigger as $$
declare
  last_created timestamptz;
begin
  -- Sérialise les insertions concurrentes d'un même utilisateur : la seconde
  -- attend le commit de la première puis voit sa ligne.
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

comment on table public.app_feedback is
  'Avis sur l''app Toboggo : historique par utilisateur (nouvel avis ≥ 30 j après le dernier, seul le dernier modifiable). Privé : auteur + admins Toboggo. Supprimé avec le compte (cascade).';
comment on view public.app_feedback_latest is
  'Dernier avis de chaque utilisateur (security_invoker : RLS d''app_feedback).';
