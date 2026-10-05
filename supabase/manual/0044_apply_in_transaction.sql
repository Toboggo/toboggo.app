-- ════════════════════════════════════════════════════════════════════════════
-- APPLICATION MANUELLE DE 0044 — à coller EN UNE FOIS dans le SQL Editor Supabase.
-- Projet cible attendu : PRODUCTION (Reference ID dans docs/architecture/database-migration.md).
-- Tout est dans UNE transaction : si une instruction échoue, rien n'est appliqué
-- ET rien n'est enregistré dans supabase_migrations.schema_migrations.
-- Fichier généré : migration = supabase/migrations/0044_app_feedback_history.sql.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- Garde-fous (prérequis 0039) : échec ⇒ transaction annulée.
do $$
begin
  if to_regclass('public.app_feedback') is null then
    raise exception 'Prérequis manquant : table public.app_feedback (0039) absente — mauvais projet ?';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.app_feedback'::regclass and conname = 'app_feedback_user_id_key') then
    raise exception 'Prérequis manquant : UNIQUE(user_id) d''app_feedback (0039) absente';
  end if;
  if not exists (select 1 from pg_proc where proname = 'is_toboggo_admin') then
    raise exception 'Prérequis manquant : fonction is_toboggo_admin';
  end if;
end $$;

-- ───────────────────────── MIGRATION 0044 ─────────────────────────
-- ════════════════════════════════════════════════════════════════════════════
-- 0044 — Historique des avis sur l'app Toboggo (`app_feedback_history`)
-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION UNIQUE, NON DESTRUCTIVE, IDEMPOTENTE, RÉTROCOMPATIBLE.
-- À appliquer AVANT le déploiement du nouveau front ; les anciens clients
-- (upsert(onConflict: "user_id")) continuent de fonctionner avant, pendant et
-- après : `app_feedback` GARDE `UNIQUE(user_id)` et représente l'avis COURANT.
--
-- Architecture :
--   • `app_feedback`            = avis courant (1 ligne max / utilisateur).
--     Modifier cet avis = UPDATE de la ligne (date de création conservée,
--     `edited_at` posé, délai de 30 j NON redémarré). C'est exactement ce que
--     fait l'upsert d'un ancien client : aucun historique n'est jamais touché.
--   • `app_feedback_history`    = avis précédents archivés (dates d'origine
--     conservées). Écrit uniquement par la RPC ci-dessous ; aucune policy
--     d'écriture pour les clients.
--   • RPC `give_app_feedback(rating, body)` (SECURITY DEFINER, transactionnelle,
--     verrou consultatif par utilisateur + FOR UPDATE de la ligne courante) : 1er avis → insère ; sinon, si le
--     courant a ≥ 30 j (depuis sa CRÉATION), l'archive puis le remplace par un
--     nouvel avis ; sinon refuse (`app_feedback_too_soon`, hint = date ISO UTC).
--   • vues security_invoker : `app_feedback_all` (courants + historique, avec
--     `is_current`) et `app_feedback_summary` (note globale = avis COURANTS).
--   • lecture : auteur + admins Toboggo (`is_toboggo_admin`) ; aucun accès anon.
--   • suppression du compte → CASCADE sur auth.users (comme `app_feedback`).
--
-- Aucune ligne existante n'est modifiée ou supprimée.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Avis courant : titre/commentaire facultatifs, date de modification ──────
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

-- Propriétaire et date de création immuables ; updated_at / edited_at tenus.
create or replace function public.app_feedback_guard() returns trigger as $$
begin
  new.user_id    := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.edited_at  := now();
  return new;
end $$ language plpgsql set search_path = public, pg_temp;

-- ── Historique ──────────────────────────────────────────────────────────────
create table if not exists public.app_feedback_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  title       text check (title is null or char_length(btrim(title)) between 1 and 100),
  body        text check (body is null or char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null,
  edited_at   timestamptz,
  archived_at timestamptz not null default now()
);
create index if not exists app_feedback_history_user_idx on public.app_feedback_history (user_id, created_at desc);

alter table public.app_feedback_history enable row level security;
revoke all on public.app_feedback_history from anon, public;
revoke insert, update, delete on public.app_feedback_history from authenticated;
grant select on public.app_feedback_history to authenticated;

drop policy if exists app_feedback_history_select on public.app_feedback_history;
create policy app_feedback_history_select on public.app_feedback_history
  for select to authenticated
  using (user_id = auth.uid() or public.is_toboggo_admin(auth.uid()));

-- ── RPC « Donner un nouvel avis » (et premier avis) ─────────────────────────
create or replace function public.give_app_feedback(p_rating smallint, p_body text default null)
returns public.app_feedback
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid     uuid := auth.uid();
  cur     public.app_feedback;
  result  public.app_feedback;
  body_in text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Sérialise les appels de la RPC pour un même utilisateur (doubles envois, deux appareils).
  perform pg_advisory_xact_lock(hashtextextended('app_feedback:' || uid::text, 0));

  -- Verrouille aussi la ligne courante : le verrou consultatif ne protège pas contre les
  -- UPDATE / upserts des anciens clients. FOR UPDATE attend leur commit puis relit la
  -- version À JOUR : une modification concurrente ne peut pas être perdue entre la lecture,
  -- l'archivage et le remplacement (et inversement, un UPDATE ancien client qui arrive
  -- pendant la RPC attend, puis s'applique à l'avis courant qui existe alors).
  select * into cur from public.app_feedback where user_id = uid for update;

  if found then
    if now() < cur.created_at + interval '30 days' then
      raise exception 'app_feedback_too_soon'
        using errcode = 'P0001',
              hint = to_char((cur.created_at + interval '30 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
    insert into public.app_feedback_history (user_id, rating, title, body, created_at, edited_at)
      values (cur.user_id, cur.rating, cur.title, cur.body, cur.created_at, cur.edited_at);
    delete from public.app_feedback where id = cur.id;
  end if;

  begin
    insert into public.app_feedback (user_id, rating, body) values (uid, p_rating, body_in)
      returning * into result;
  exception when unique_violation then
    -- Un ancien client a inséré entre-temps (il ne prend pas le verrou) : l'avis qui existe est récent.
    raise exception 'app_feedback_too_soon' using errcode = 'P0001',
      hint = to_char((now() + interval '30 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end;
  return result;
end $$;

revoke all on function public.give_app_feedback(smallint, text) from public, anon;
grant execute on function public.give_app_feedback(smallint, text) to authenticated;

-- ── Vues (RLS de l'appelant) ────────────────────────────────────────────────
create or replace view public.app_feedback_all
  with (security_invoker = true) as
  select id, user_id, rating, title, body, created_at, edited_at, true as is_current
    from public.app_feedback
  union all
  select id, user_id, rating, title, body, created_at, edited_at, false as is_current
    from public.app_feedback_history;

-- Note globale = avis COURANTS uniquement ; total_submissions inclut l'historique.
create or replace view public.app_feedback_summary
  with (security_invoker = true) as
  select
    count(*)::int                           as rating_count,
    round(avg(rating)::numeric, 2)          as average_rating,
    count(*) filter (where rating = 1)::int as count_1,
    count(*) filter (where rating = 2)::int as count_2,
    count(*) filter (where rating = 3)::int as count_3,
    count(*) filter (where rating = 4)::int as count_4,
    count(*) filter (where rating = 5)::int as count_5,
    ((select count(*) from public.app_feedback_history) + count(*))::int as total_submissions
  from public.app_feedback;

drop view if exists public.app_feedback_latest;

revoke all on public.app_feedback_all, public.app_feedback_summary from anon, public;
grant select on public.app_feedback_all, public.app_feedback_summary to authenticated;

comment on table public.app_feedback is
  'Avis COURANT sur l''app Toboggo (1 / utilisateur, UNIQUE(user_id) conservé pour les anciens clients). Privé : auteur + admins.';
comment on table public.app_feedback_history is
  'Avis précédents archivés par give_app_feedback(). Lecture auteur + admins ; écriture réservée à la RPC.';

-- ───────────────────── FIN MIGRATION 0044 ─────────────────────

-- Enregistrement dans le suivi Supabase (dans la même transaction).
insert into supabase_migrations.schema_migrations (version, name)
values ('0044', 'app_feedback_history')
on conflict (version) do nothing;

commit;
