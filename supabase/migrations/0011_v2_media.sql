-- ════════════════════════════════════════════════════════════════════════════
-- 0011 — `park_media` (§15) : photos de parc comme lignes, plus comme text[]
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF — `parks.photos` (text[]) est conservée.
-- Données réelles : parks.photos vide pour les 17 parcs, buckets Storage
-- (park-photos / avatars / report-photos) à 0 objet -> le backfill ci-dessous
-- ne crée AUCUNE ligne. La requête reste néanmoins générique et sûre :
-- `where coalesce(cardinality(p.photos),0) > 0` garantit 0 insert si tableau vide.
-- Idempotent : `create table if not exists`, `on conflict do nothing`.
--
-- Note : `zone_id` référence `park_zones` (créée en 0012). La colonne est
-- ajoutée ici sans FK ; la FK est posée en 0012.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists park_media (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references parks(id) on delete cascade,
  zone_id uuid,                                   -- FK -> park_zones ajoutée en 0012
  user_id uuid references auth.users(id) on delete set null,
  url text not null,
  category media_category not null default 'other',
  caption text,
  is_cover boolean not null default false,
  status media_status not null default 'approved',
  created_at timestamptz not null default now()
);
create index if not exists park_media_park_idx on park_media (park_id);
create unique index if not exists park_media_one_cover on park_media (park_id) where is_cover;

-- ── Backfill générique parks.photos[] -> park_media ────────────────────
-- 0 ligne attendue (toutes les arrays sont vides). `with ordinality` +
-- `row_number()` : la 1re photo de chaque parc serait is_cover = true.
insert into park_media (park_id, url, category, status, is_cover)
select p.id,
       ph.url,
       'other'::media_category,
       'approved'::media_status,
       (row_number() over (partition by p.id order by ph.ord) = 1) as is_cover
from parks p
cross join lateral unnest(p.photos) with ordinality as ph(url, ord)
where coalesce(cardinality(p.photos), 0) > 0
on conflict do nothing;

-- ── Assertions ─────────────────────────────────────────────────────────
do $$
declare
  c_src_photos int;   -- total d'URLs dans parks.photos
  c_media int;        -- lignes park_media issues du backfill
  c_multi_cover int;  -- parcs avec > 1 cover (violation logique)
begin
  select coalesce(sum(coalesce(cardinality(photos), 0)), 0) into c_src_photos from parks;
  select count(*) into c_media from park_media;

  if c_media < c_src_photos then
    raise exception '0011: % lignes park_media < % URLs sources dans parks.photos', c_media, c_src_photos;
  end if;

  select count(*) into c_multi_cover
  from (select park_id from park_media where is_cover group by park_id having count(*) > 1) x;
  if c_multi_cover > 0 then
    raise exception '0011: % parcs avec plusieurs park_media.is_cover', c_multi_cover;
  end if;

  raise notice '0011 OK — % URLs sources -> % lignes park_media (0 attendu, arrays vides)',
    c_src_photos, c_media;
end $$;
