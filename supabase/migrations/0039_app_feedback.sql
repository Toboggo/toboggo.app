-- ════════════════════════════════════════════════════════════════════════════
-- 0039 — Évaluations de l'application Toboggo (`app_feedback`)
-- ────────────────────────────────────────────────────────────────────────────
-- ADDITIVE ET IDEMPOTENTE : une nouvelle table + index + policies + trigger.
-- Aucune table, colonne, fonction ni policy existante modifiée ; ne dépend que
-- de `is_toboggo_admin(uuid)` (0002/V2) et `touch_updated_at()` (0001).
--
-- Contrat produit :
--   • un seul avis par utilisateur connecté (UNIQUE user_id), modifiable par
--     son auteur (upsert côté app) ;
--   • avis PRIVÉS : lisibles uniquement par leur auteur et les admins Toboggo
--     (`is_toboggo_admin`) ; jamais exposés aux autres utilisateurs ni en anon ;
--   • validation côté serveur : note 1–5, titre et texte non vides après trim,
--     bornes de longueur (titre ≤ 100, texte ≤ 2000) ;
--   • suppression du compte → `on delete cascade` sur auth.users : les avis
--     de l'utilisateur disparaissent avec lui (aucun trigger d'audit sur cette
--     table, donc aucune interaction avec delete_own_account / 0038).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.app_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  title      text not null check (char_length(btrim(title)) between 1 and 100),
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_feedback_created_at_idx on public.app_feedback (created_at desc);

alter table public.app_feedback enable row level security;

-- Pas d'accès anonyme du tout (RLS refuserait de toute façon sans policy).
revoke all on public.app_feedback from anon;
grant select, insert, update on public.app_feedback to authenticated;

drop policy if exists app_feedback_select on public.app_feedback;
create policy app_feedback_select on public.app_feedback
  for select to authenticated
  using (user_id = auth.uid() or public.is_toboggo_admin(auth.uid()));

drop policy if exists app_feedback_insert on public.app_feedback;
create policy app_feedback_insert on public.app_feedback
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists app_feedback_update on public.app_feedback;
create policy app_feedback_update on public.app_feedback
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Pas de policy DELETE : seule la cascade de suppression de compte retire un avis.

-- Propriétaire et date de création immuables ; updated_at toujours maintenu.
create or replace function public.app_feedback_guard() returns trigger as $$
begin
  new.user_id    := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$ language plpgsql set search_path = public, pg_temp;

drop trigger if exists app_feedback_guard on public.app_feedback;
create trigger app_feedback_guard before update on public.app_feedback
  for each row execute function public.app_feedback_guard();

comment on table public.app_feedback is
  'Évaluation de l''app Toboggo (1 par utilisateur, modifiable). Privée : auteur + admins Toboggo. Supprimée avec le compte (cascade).';
