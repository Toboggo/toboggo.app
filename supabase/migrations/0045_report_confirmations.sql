-- ════════════════════════════════════════════════════════════════════════════
-- 0045 — Confirmation communautaire des signalements (« Toujours présent » /
--        « Problème résolu »)
-- ────────────────────────────────────────────────────────────────────────────
-- ADDITIVE ET IDEMPOTENTE : une table, deux fonctions, des policies. Aucune
-- table, colonne, fonction ni policy existante modifiée ; `reports` n'est pas
-- touchée (le client actuellement en production continue de fonctionner à
-- l'identique). Ne dépend que de `reports`, `parks`, `is_toboggo_staff(uuid)`
-- et `manages_park(uuid, uuid)`.
--
-- Contrat produit (fiche parc mobile, encart « Un problème a été signalé ») :
--   • un parent connecté, sur place, répond pour UN signalement précis :
--     `still_present` (« Toujours présent ») ou `resolved` (« Problème résolu ») ;
--   • une seule réponse par (utilisateur, signalement), modifiable ;
--   • une réponse est un SIGNAL séparé : elle n'écrit JAMAIS dans `reports`.
--     Un vote « résolu » ne clôture donc pas le signalement : le statut
--     (open / in_progress / resolved / dismissed) reste décidé par la
--     modération (staff Toboggo / gestionnaire du parc) ;
--   • lecture publique LIMITÉE via `park_active_reports()` : catégorie,
--     description, équipement, date, statut et compteurs — jamais l'auteur
--     (user_id, reported_by_name), la photo, ni les notes de résolution ;
--   • écriture uniquement via `respond_to_report()` (utilisateur connecté,
--     signalement actif d'un parc publié) ; la table n'est pas écrivable en
--     direct (RLS + aucun GRANT INSERT/UPDATE/DELETE) ;
--   • lecture directe de la table : l'auteur du vote, le staff Toboggo et les
--     gestionnaires du parc (même périmètre que `reports_read`) → backoffice ;
--   • suppression du compte → CASCADE (donnée personnelle, comme
--     `park_confirmations` / `app_feedback`).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.report_confirmations (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  response   text not null check (response in ('still_present', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, user_id)
);

create index if not exists report_confirmations_report_idx
  on public.report_confirmations (report_id, response);

alter table public.report_confirmations enable row level security;

-- Aucun accès anonyme ; lecture seule (filtrée par RLS) pour les connectés ;
-- aucune écriture directe : tout passe par `respond_to_report()`.
revoke all on public.report_confirmations from anon, authenticated;
grant select on public.report_confirmations to authenticated;

drop policy if exists report_confirmations_select on public.report_confirmations;
create policy report_confirmations_select on public.report_confirmations
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_toboggo_staff(auth.uid())
    or exists (
      select 1 from public.reports r
      where r.id = report_confirmations.report_id
        and public.manages_park(auth.uid(), r.park_id)
    )
  );

comment on table public.report_confirmations is
  'Réponse communautaire à un signalement (still_present | resolved), 1 par utilisateur/signalement. N''écrit jamais reports : la clôture reste à la modération. Écriture via respond_to_report().';

-- ── Lecture publique limitée ────────────────────────────────────────────────
-- Signalements ACTIFS (open / in_progress) d'un parc PUBLIÉ, avec compteurs et
-- réponse de l'appelant. SECURITY DEFINER car `reports_read` n'ouvre la table
-- qu'à l'auteur / au staff / aux gestionnaires.
create or replace function public.park_active_reports(p_park_id uuid)
returns table (
  id                   uuid,
  category             public.report_category,
  description          text,
  equipment_label      text,
  status               public.report_status,
  created_at           timestamptz,
  still_present_count  integer,
  resolved_count       integer,
  my_response          text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.id,
    r.category,
    r.description,
    r.equipment_label,
    r.status,
    r.created_at,
    (select count(*)::int from public.report_confirmations c
       where c.report_id = r.id and c.response = 'still_present'),
    (select count(*)::int from public.report_confirmations c
       where c.report_id = r.id and c.response = 'resolved'),
    (select c.response from public.report_confirmations c
       where c.report_id = r.id and c.user_id = auth.uid())
  from public.reports r
  join public.parks p on p.id = r.park_id
  where r.park_id = p_park_id
    and r.status in ('open', 'in_progress')
    and p.moderation_status = 'published'
  order by r.created_at desc
$$;

revoke all on function public.park_active_reports(uuid) from public;
grant execute on function public.park_active_reports(uuid) to anon, authenticated;

-- ── Réponse (création ou modification) ──────────────────────────────────────
create or replace function public.respond_to_report(p_report_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'respond_to_report: authentification requise' using errcode = '42501';
  end if;
  if p_response is null or p_response not in ('still_present', 'resolved') then
    raise exception 'respond_to_report: réponse invalide' using errcode = '22023';
  end if;

  -- Signalement actif d'un parc publié uniquement (pas de vote « à l'aveugle »
  -- sur un signalement clos, rejeté ou d'un parc non publié).
  if not exists (
    select 1
    from public.reports r
    join public.parks p on p.id = r.park_id
    where r.id = p_report_id
      and r.status in ('open', 'in_progress')
      and p.moderation_status = 'published'
  ) then
    raise exception 'respond_to_report: signalement introuvable ou clos' using errcode = 'P0002';
  end if;

  insert into public.report_confirmations (report_id, user_id, response)
  values (p_report_id, uid, p_response)
  on conflict (report_id, user_id)
  do update set response = excluded.response, updated_at = now();
end $$;

revoke all on function public.respond_to_report(uuid, text) from public;
grant execute on function public.respond_to_report(uuid, text) to authenticated;
