-- ⚠️ BROUILLON — NON APPLIQUÉ. Ne PAS copier dans supabase/migrations/ sans accord explicite.
-- Contraintes du dépôt : migration ADDITIVE uniquement (aucun DROP, aucune réécriture de 0001→0038),
-- jamais `db push --linked` ni `migration repair` en production ; validation locale puis staging (--db-url) d abord.
-- Numérotation cible : 0039+ (dernière migration existante : 0038).
--
-- Table de référence des communes ("places"). Nom volontairement différent de la
-- table V1 `communes` (collectivités V1, conservée pendant la coexistence).
-- Sert à : fixer l'URL d'une ville (slug unique), fusionner les variantes
-- d'orthographe de parks.city, et porter un contrôle éditorial SEO par ville.
-- Données de référence à importer plus tard depuis une source ouverte (INSEE / geo.api.gouv.fr :
-- licence à vérifier avant import) — AUCUNE donnée n'est insérée ici.

create table if not exists places (
  id              uuid primary key default gen_random_uuid(),
  country_code    char(2)     not null default 'FR',
  insee_code      text,
  name            text        not null,
  slug            text        not null,
  department_code text,
  department_name text,
  region_name     text,
  postal_codes    text[]      not null default '{}',
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  -- contrôle éditorial : NULL = règle automatique (eligibility.ts), sinon forcé
  seo_override    text check (seo_override in ('index', 'noindex')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint places_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint places_country_slug_key unique (country_code, slug),
  constraint places_country_insee_key unique (country_code, insee_code)
);

create index if not exists places_department_idx on places (country_code, department_code);

alter table places enable row level security;

create policy places_read  on places for select using (true);
create policy places_write on places for all
  using (is_toboggo_staff(auth.uid()))
  with check (is_toboggo_staff(auth.uid()));
