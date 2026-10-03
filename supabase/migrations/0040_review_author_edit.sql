-- ════════════════════════════════════════════════════════════════════════════
-- 0040 — Modification de son propre avis (mobile : « Modifier mon avis »)
-- ────────────────────────────────────────────────────────────────────────────
-- ADDITIVE ET IDEMPOTENTE : une colonne, une policy, une fonction + un trigger.
-- Aucune colonne / policy existante modifiée ni supprimée (coexistence V1/V2).
--
-- Constat (lu dans 0021) : `reviews_update` ne laisse passer que le staff
-- Toboggo et les gestionnaires du parc — l'AUTEUR d'un avis ne peut donc pas le
-- modifier. Cette migration :
--   1. ajoute `reviews.edited_at` : horodatage de la dernière modification de
--      CONTENU par l'auteur (note, critères, âge, commentaire). `updated_at`
--      ne convient pas seul : il bouge aussi sur une réponse de la collectivité
--      ou une modération, ce qui afficherait à tort « Modifié le… ».
--   2. ajoute la policy `reviews_update_own` (auteur, avis publié uniquement :
--      un avis signalé/masqué ne peut pas être ré-édité pour contourner la
--      modération).
--   3. ajoute `reviews_author_guard` (BEFORE UPDATE) : quand l'appelant est
--      l'auteur et pas staff Toboggo, seules les colonnes de contenu peuvent
--      changer ; park_id / user_id / author_name / status / flagged / reply* /
--      created_at sont verrouillés. Il renseigne `edited_at`.
-- `created_at` n'est jamais modifié ; `updated_at` est mis à jour par le
-- trigger `reviews_touch` existant ; `parks.rating` / `review_count` sont
-- recalculés par `reviews_after_change` (AFTER INSERT/UPDATE/DELETE) existant.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.reviews add column if not exists edited_at timestamptz;

drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews for update
using (user_id = auth.uid() and status = 'published')
with check (user_id = auth.uid() and status = 'published');

create or replace function public.reviews_author_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Pas d'utilisateur JWT (service_role, migrations) ou pas l'auteur : on ne
  -- touche à rien, les autres policies s'appliquent seules.
  if auth.uid() is null or old.user_id is distinct from auth.uid() then
    return new;
  end if;

  if not is_toboggo_staff(auth.uid()) then
    if new.park_id     is distinct from old.park_id
       or new.user_id     is distinct from old.user_id
       or new.author_name is distinct from old.author_name
       or new.status      is distinct from old.status
       or new.flagged     is distinct from old.flagged
       or new.reply       is distinct from old.reply
       or new.reply_by    is distinct from old.reply_by
       or new.reply_at    is distinct from old.reply_at
       or new.created_at  is distinct from old.created_at then
      raise exception 'reviews: seuls la note, les critères, l''âge et le commentaire sont modifiables par l''auteur'
        using errcode = '42501';
    end if;
  end if;

  if new.rating                 is distinct from old.rating
     or new.cleanliness         is distinct from old.cleanliness
     or new.safety              is distinct from old.safety
     or new.equipment           is distinct from old.equipment
     or new.comfort             is distinct from old.comfort
     or new.recommended_min_age is distinct from old.recommended_min_age
     or new.recommended_max_age is distinct from old.recommended_max_age
     or new.comment             is distinct from old.comment then
    new.edited_at := now();
  end if;

  return new;
end $$;

drop trigger if exists reviews_author_guard on public.reviews;
create trigger reviews_author_guard before update on public.reviews
  for each row execute function public.reviews_author_guard();
