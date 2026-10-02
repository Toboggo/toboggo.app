-- ⚠️ BROUILLON — NON APPLIQUÉ. Ne PAS copier dans supabase/migrations/ sans accord explicite.
-- Contraintes du dépôt : migration ADDITIVE uniquement (aucun DROP, aucune réécriture de 0001→0038),
-- jamais `db push --linked` ni `migration repair` en production ; validation locale puis staging (--db-url) d abord.
-- Numérotation cible : 0039+ (dernière migration existante : 0038).
--
-- Slugs de parc : unicité PAR COMMUNE + historique pour les 301 en cas de
-- renommage. parks.slug existe déjà (migration 0009) mais est vide partout :
-- aucun backfill ici (voir apps/landing/src/lib/seo/slugs.ts pour les règles).

alter table parks
  add constraint parks_slug_format check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

create unique index if not exists parks_place_slug_uidx
  on parks (place_id, slug)
  where slug is not null and place_id is not null;

create table if not exists park_slug_history (
  id          uuid primary key default gen_random_uuid(),
  park_id     uuid not null references parks (id) on delete cascade,
  place_id    uuid references places (id) on delete set null,
  slug        text not null,
  replaced_at timestamptz not null default now(),
  constraint park_slug_history_place_slug_key unique (place_id, slug)
);

create index if not exists park_slug_history_park_idx on park_slug_history (park_id);

alter table park_slug_history enable row level security;
create policy park_slug_history_read  on park_slug_history for select using (true);
create policy park_slug_history_write on park_slug_history for all
  using (is_toboggo_staff(auth.uid()))
  with check (is_toboggo_staff(auth.uid()));

-- Un slug publié ne se réécrit pas en silence : l'ancien est archivé (→ 301 au build).
create or replace function parks_record_slug_change() returns trigger
language plpgsql as $$
begin
  if old.slug is not null and new.slug is distinct from old.slug then
    insert into park_slug_history (park_id, place_id, slug)
    values (old.id, old.place_id, old.slug)
    on conflict (place_id, slug) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists parks_slug_history_bu on parks;
create trigger parks_slug_history_bu
  before update of slug on parks
  for each row execute function parks_record_slug_change();
