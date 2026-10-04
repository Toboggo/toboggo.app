-- ════════════════════════════════════════════════════════════════════════════
-- 0043 — Confirmations d'informations de parc (« Oui, c'est bon »)
-- ────────────────────────────────────────────────────────────────────────────
-- ADDITIVE ET IDEMPOTENTE : une nouvelle table + policies. Aucune table,
-- colonne, fonction ni policy existante modifiée ; ne dépend que de
-- `is_toboggo_staff(uuid)` et des tables `parks`, `features`, `park_features`.
--
-- Contrat produit (écran mobile « Mes ajouts » → « À vérifier près de chez
-- vous ») :
--   • un parent confirme qu'une information EXISTANTE d'un parc (un équipement
--     / service déjà renseigné « disponible » ou « absent ») est toujours exacte ;
--   • une confirmation est un SIGNAL séparé : elle n'écrit JAMAIS dans
--     `park_features` / `parks` (ni `verified_at`, ni statut) et ne contourne
--     donc ni la modération ni la priorité des sources. Les équipes Toboggo /
--     la collectivité la consultent pour décider de rafraîchir la vérification ;
--   • une seule confirmation par (utilisateur, parc, équipement) ;
--   • insertion refusée si la valeur confirmée ne correspond pas à l'information
--     réellement enregistrée sur un parc publié (pas de confirmation « à
--     l'aveugle ») ;
--   • lecture : l'auteur et le staff Toboggo ; aucun accès anonyme ; pas de
--     UPDATE/DELETE côté client. Suppression du compte → CASCADE (donnée
--     personnelle de l'utilisateur, comme `app_feedback`).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.park_confirmations (
  id               uuid primary key default gen_random_uuid(),
  park_id          uuid not null references public.parks(id) on delete cascade,
  feature_id       uuid not null references public.features(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  confirmed_status public.feature_status not null
    check (confirmed_status in ('available', 'unavailable')),
  created_at       timestamptz not null default now(),
  unique (user_id, park_id, feature_id)
);

create index if not exists park_confirmations_park_idx on public.park_confirmations (park_id, feature_id);

alter table public.park_confirmations enable row level security;

revoke all on public.park_confirmations from anon;
revoke update, delete on public.park_confirmations from authenticated;
grant select, insert on public.park_confirmations to authenticated;

drop policy if exists park_confirmations_select on public.park_confirmations;
create policy park_confirmations_select on public.park_confirmations
  for select to authenticated
  using (user_id = auth.uid() or public.is_toboggo_staff(auth.uid()));

drop policy if exists park_confirmations_insert on public.park_confirmations;
create policy park_confirmations_insert on public.park_confirmations
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.parks p
      join public.park_features pf on pf.park_id = p.id
      where p.id = park_confirmations.park_id
        and p.moderation_status = 'published'
        and pf.feature_id = park_confirmations.feature_id
        and pf.status = park_confirmations.confirmed_status
    )
  );

comment on table public.park_confirmations is
  'Signal « cette information est toujours exacte » d''un parent (1 par utilisateur/parc/équipement). N''écrit jamais park_features. Lecture : auteur + staff Toboggo.';
