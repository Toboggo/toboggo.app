-- ════════════════════════════════════════════════════════════════════════════
-- 0041 — Pseudo public choisi par l'utilisateur (`profiles.name`)
-- ────────────────────────────────────────────────────────────────────────────
-- ADDITIVE : 1 colonne nullable, 2 fonctions + 2 triggers ; aucune colonne,
-- table ni policy existante modifiée ou supprimée (coexistence V1/V2).
--
-- COMPATIBLE avec la version front actuellement en production : l'ancien client
-- ne connaît pas `name_confirmed_at`, continue de lire/écrire `profiles.name`
-- (le trigger ne rejette que les noms invalides : 3–24 caractères) et son
-- `getOrCreateProfile` ne s'exécute plus que si le trigger d'inscription n'a
-- pas créé la ligne. => appliquer cette migration AVANT de déployer le front.
--
-- 1. `profiles.name_confirmed_at` : horodatage du choix explicite du pseudo.
--    NULL = pseudo pas encore choisi => le front propose l'écran « Choisissez
--    votre pseudo ». Les comptes EXISTANTS sont marqués confirmés (on ne déduit
--    pas qu'un pseudo a été généré depuis l'e-mail : ils le gardent et peuvent
--    le modifier depuis leur profil).
-- 2. `link_team_member_on_signup` : n'invente plus de pseudo à partir du début
--    de l'e-mail (ni du nom Google) : `name` = '' tant que l'utilisateur n'a pas
--    choisi. Liaison d'équipe par e-mail inchangée.
-- 3. `profiles_name_guard` (BEFORE INSERT/UPDATE OF name) : validation serveur
--    d'un choix explicite de pseudo (UPDATE) ; il renseigne `name_confirmed_at`.
--    Règle : après trim + espaces internes réduits, 3 à 24 caractères, sans
--    caractère de contrôle, sans « @ » (jamais d'e-mail en public), sans « < »
--    ni « > ». Pas d'unicité (c'est un nom affiché, pas un identifiant). Ne
--    s'applique qu'à un CHANGEMENT de nom : un pseudo hérité ne bloque jamais
--    une autre mise à jour du profil (favoris, préférences…).
-- 4. `profiles_name_propagate` (AFTER UPDATE OF name) : les avis et signalements
--    stockent une copie dénormalisée (`reviews.author_name`,
--    `reports.reported_by_name`) ; elle est resynchronisée pour que l'existant
--    affiche le nouveau pseudo. `user_id` (propriétaire) n'est jamais touché ;
--    les signalements anonymisés (nom '') le restent (user_id NULL).
--    Les contributions (`park_edits`, `park_media`) résolvent le nom en direct
--    via `profiles` : rien à resynchroniser.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'name_confirmed_at'
  ) then
    alter table public.profiles add column name_confirmed_at timestamptz;
    -- Comptes existants : pseudo conservé et considéré comme confirmé.
    update public.profiles set name_confirmed_at = created_at where btrim(name) <> '';
  end if;
end $$;

-- ── 2. Inscription : plus de pseudo déduit de l'e-mail ───────────────────────
create or replace function public.link_team_member_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- liaison par e-mail d'un membre d'équipe pré-invité (logique inchangée)
  update public.team_members
     set user_id = new.id
   where lower(email) = lower(new.email)
     and user_id is null;

  -- pseudo vide : choisi par l'utilisateur à sa première connexion
  insert into public.profiles (id, name, email)
  values (new.id, '', new.email)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ── 3. Validation serveur du pseudo ──────────────────────────────────────────
create or replace function public.profiles_name_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n text;
begin
  -- création de ligne (trigger d'inscription => '', ou ancien client) : on ne
  -- valide pas, le pseudo n'est « confirmé » que par un choix explicite (UPDATE)
  if tg_op = 'INSERT' then
    new.name := btrim(coalesce(new.name, ''));
    return new;
  end if;
  -- nom inchangé et déjà confirmé : ne bloque jamais une autre mise à jour
  if new.name is not distinct from old.name and new.name_confirmed_at is not null then
    return new;
  end if;

  n := btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g'));
  if char_length(n) < 3 or char_length(n) > 24
     or n ~ '[[:cntrl:]]'
     or position('@' in n) > 0
     or position('<' in n) > 0
     or position('>' in n) > 0 then
    raise exception 'profiles.name invalide : 3 à 24 caractères, sans @ < > ni caractère de contrôle'
      using errcode = '23514', constraint = 'profiles_name_format';
  end if;

  new.name := n;
  new.name_confirmed_at := coalesce(new.name_confirmed_at, now());
  return new;
end;
$$;

drop trigger if exists profiles_name_guard on public.profiles;
create trigger profiles_name_guard
  before insert or update of name on public.profiles
  for each row execute function public.profiles_name_guard();

-- ── 4. Resynchronisation des copies dénormalisées ────────────────────────────
create or replace function public.profiles_name_propagate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_sub    text := current_setting('request.jwt.claim.sub', true);
  saved_claims text := current_setting('request.jwt.claims', true);
begin
  -- Opération système (pas une édition d'avis par l'utilisateur) : on neutralise
  -- l'identité JWT le temps de la resynchronisation pour que d'éventuels gardes
  -- « auteur » sur reviews/reports (ex. reviews_author_guard) ne la bloquent pas.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  update public.reviews set author_name = new.name
   where user_id = new.id and author_name is distinct from new.name;
  update public.reports set reported_by_name = new.name
   where user_id = new.id and reported_by_name <> '' and reported_by_name is distinct from new.name;

  perform set_config('request.jwt.claim.sub', coalesce(saved_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(saved_claims, ''), true);
  return null;
end;
$$;

drop trigger if exists profiles_name_propagate on public.profiles;
create trigger profiles_name_propagate
  after update of name on public.profiles
  for each row
  when (old.name is distinct from new.name and new.name <> '')
  execute function public.profiles_name_propagate();
