-- ════════════════════════════════════════════════════════════════════════════
-- 0013 — `reviews` : évolution ADDITIVE vers le modèle v2
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF — colonnes V1 conservées : stars, sub_ratings, comment,
-- photo, age_band, flagged, reply, reply_by, reply_at.
-- Table VIDE (count = 0) -> backfill sans effet réel, mais écrit explicitement
-- pour documenter la transformation et rester correct si des lignes existaient.
--
-- Mapping (documenté, non ré-interprété) :
--   stars                -> rating          (même échelle 0.5..5)
--   sub_ratings->>'clean' -> cleanliness ; ->>'safety' -> safety ;
--   ->>'equipment' -> equipment ; ->>'comfort' -> comfort
--   age_band             -> recommended_min_age / recommended_max_age
--     all -> 0..12 ; under3 -> 0..3 ; 3-6 -> 3..6 ; 6-12 -> 6..12
--   flagged              -> status ('flagged' si true, sinon 'published')
--
-- Coexistence : `stars` (V1) est NOT NULL, `rating` (v2) reçoit aussi NOT NULL.
-- Le trigger `reviews_v1_compat` est BIDIRECTIONNEL : rating<->stars et
-- status<->flagged sont synchronisés dans les deux sens -> INSERT V1 (stars
-- fourni) ET INSERT V2 (rating fourni) fonctionnent. Retiré au futur 0020.
-- ════════════════════════════════════════════════════════════════════════════

alter table reviews add column if not exists rating              numeric(2,1);
alter table reviews add column if not exists cleanliness         numeric(2,1);
alter table reviews add column if not exists safety              numeric(2,1);
alter table reviews add column if not exists equipment           numeric(2,1);
alter table reviews add column if not exists comfort             numeric(2,1);
alter table reviews add column if not exists recommended_min_age smallint;
alter table reviews add column if not exists recommended_max_age smallint;
alter table reviews add column if not exists status              review_status not null default 'published';
alter table reviews add column if not exists updated_at          timestamptz  not null default now();

-- ── Backfill (no-op sur table vide) ────────────────────────────────────
update reviews set rating = stars where rating is null and stars is not null;

update reviews set
  cleanliness = nullif(sub_ratings->>'clean',     '')::numeric,
  safety      = nullif(sub_ratings->>'safety',    '')::numeric,
  equipment   = nullif(sub_ratings->>'equipment', '')::numeric,
  comfort     = nullif(sub_ratings->>'comfort',   '')::numeric
where sub_ratings is not null and jsonb_typeof(sub_ratings) = 'object';

update reviews set
  recommended_min_age = case age_band
     when 'all' then 0 when 'under3' then 0 when '3-6' then 3 when '6-12' then 6 end,
  recommended_max_age = case age_band
     when 'all' then 12 when 'under3' then 3 when '3-6' then 6 when '6-12' then 12 end
where age_band is not null;

update reviews set status = case when flagged then 'flagged' else 'published' end::review_status;

-- ── Contraintes v2 (table vide -> sûr) ────────────────────────────────
do $$ begin
  alter table reviews add constraint reviews_rating_range check (rating between 0.5 and 5);
exception when duplicate_object then null; end $$;

-- rating NOT NULL : cible v2. Le trigger `reviews_v1_compat` (défini plus bas)
-- rend `rating` toujours renseigné dès qu'une des deux formes (rating OU stars)
-- l'est -> INSERT V1 et INSERT V2 fonctionnent tous les deux -> on conserve la
-- contrainte. `c_null_rating` protège un staging qui contiendrait déjà des
-- lignes incohérentes (bascule alors en notice, sans bloquer la migration).
do $$
declare c_null_rating int;
begin
  select count(*) into c_null_rating from reviews where rating is null and stars is null;
  if c_null_rating = 0 then
    -- combler d'abord un éventuel rating manquant depuis stars (staging)
    update reviews set rating = stars where rating is null and stars is not null;
    execute 'alter table reviews alter column rating set not null';
  else
    raise notice '0013: % reviews sans rating NI stars -> NOT NULL non appliqué', c_null_rating;
  end if;
end $$;

-- ── Index v2 ─────────────────────────────────────────────────────────
create index if not exists reviews_user_idx on reviews (user_id);

-- ── Trigger de compat V1 <-> v2 (coexistence, bidirectionnel) ────────
-- INSERT : rating (v2) canonique ; à défaut dérivé de stars (v1). Idem
--          status <-> flagged. Après ce trigger, `rating` est toujours
--          renseigné dès qu'une des deux formes l'est -> `rating NOT NULL`
--          reste applicable et les DEUX chemins d'INSERT fonctionnent.
-- UPDATE : la colonne explicitement modifiée gagne et synchronise son
--          équivalent (IS DISTINCT FROM). Aucune boucle (BEFORE, NEW only).
create or replace function reviews_v1_compat() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.rating := coalesce(new.rating, new.stars);   -- v2 canonique
    new.stars  := new.rating;

    if new.flagged and new.status = 'published' then
      -- INSERT purement V1 : flagged fourni, status resté au défaut
      new.status := 'flagged';
    else
      new.flagged := (new.status = 'flagged');
    end if;
  else
    if new.rating is distinct from old.rating then
      new.stars := new.rating;
    elsif new.stars is distinct from old.stars then
      new.rating := new.stars;
    end if;

    if new.status is distinct from old.status then
      new.flagged := (new.status = 'flagged');
    elsif new.flagged is distinct from old.flagged then
      new.status := (case when new.flagged then 'flagged' else 'published' end)::review_status;
    end if;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists reviews_v1_compat_biu on reviews;
create trigger reviews_v1_compat_biu
  before insert or update on reviews
  for each row execute function reviews_v1_compat();

-- `updated_at` : trigger touch (la fonction touch_updated_at existe déjà, V1 0001)
drop trigger if exists reviews_touch on reviews;
create trigger reviews_touch before update on reviews
  for each row execute function touch_updated_at();

-- ── Assertions ─────────────────────────────────────────────────────────
do $$
declare c_total int; c_bad int;
begin
  select count(*) into c_total from reviews;

  select count(*) into c_bad from reviews
   where (stars is not null and rating is distinct from stars)
      or (flagged and status <> 'flagged')
      or (not flagged and status = 'flagged');
  if c_bad > 0 then
    raise exception '0013: % reviews avec rating/status incohérents vs stars/flagged', c_bad;
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='reviews' and column_name='status') then
    raise exception '0013: colonne reviews.status absente';
  end if;

  raise notice '0013 OK — reviews étendu v2 (% ligne(s)), colonnes V1 conservées', c_total;
end $$;
