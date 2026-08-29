-- ════════════════════════════════════════════════════════════════════════════
-- 0008 — Organisations (§17) : `organizations` + `organization_parks`
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF.
--   • `communes` est CONSERVÉE (aucun DROP) — supprimée seulement au futur 0020
--   • backfill explicite depuis `communes` puis `parks.commune_id`
--   • les UUID des communes sont RÉUTILISÉS comme UUID des organizations
--     (organizations.id = communes.id) pour que `parks.commune_id`,
--     `team_members.commune_id`, etc. pointent déjà la bonne organisation
--   • idempotent : `create table if not exists` + `on conflict do nothing`
--
-- Données réelles attendues : 2 communes → 2 organizations ;
-- 6 parks avec commune_id → 6 lignes organization_parks ; 11 parks sans org.
-- ════════════════════════════════════════════════════════════════════════════

-- ── §17 organizations ────────────────────────────────────────────────────
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type organization_type not null default 'other',
  country_code char(2),
  contact_email text,
  email_notif boolean not null default false,
  website text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── §17 organization ↔ park (N-N, avec rôle) ────────────────────────────
create table if not exists organization_parks (
  organization_id uuid not null references organizations(id) on delete cascade,
  park_id uuid not null references parks(id) on delete cascade,
  role organization_park_role not null default 'manager',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (organization_id, park_id)
);
create index if not exists organization_parks_park_idx on organization_parks (park_id);

-- ── Backfill communes → organizations (id préservé) ─────────────────────
insert into organizations (id, name, type, country_code, contact_email, email_notif, verified)
select c.id,
       c.name,
       'municipality'::organization_type,
       'FR'::char(2),
       c.contact_email,
       c.email_notif,
       false
from communes c
on conflict (id) do nothing;

-- ── Backfill parks.commune_id → organization_parks ─────────────────────
-- role 'owner' (une commune "possède" ses parcs dans le modèle français).
-- WHERE commune_id is not null : les 11 parcs sans commune restent sans org.
insert into organization_parks (organization_id, park_id, role, verified)
select p.commune_id, p.id, 'owner'::organization_park_role, true
from parks p
where p.commune_id is not null
  and exists (select 1 from organizations o where o.id = p.commune_id)
on conflict (organization_id, park_id) do nothing;

-- ── Assertions ───────────────────────────────────────────────────────────
do $$
declare
  c_communes int; c_orgs_from_communes int;
  c_parks_with_commune int; c_org_parks int;
  c_dangling int;
begin
  select count(*) into c_communes from communes;
  select count(*) into c_orgs_from_communes
    from organizations o where exists (select 1 from communes c where c.id = o.id);
  select count(*) into c_parks_with_commune
    from parks where commune_id is not null;
  select count(*) into c_org_parks from organization_parks;

  -- 1. chaque commune a une organization du même id
  if c_orgs_from_communes < c_communes then
    raise exception '0008: % organizations issues de communes < % communes — backfill incomplet',
      c_orgs_from_communes, c_communes;
  end if;

  -- 2. chaque park avec commune_id valide a sa relation organization_parks
  select count(*) into c_dangling
  from parks p
  where p.commune_id is not null
    and exists (select 1 from organizations o where o.id = p.commune_id)
    and not exists (select 1 from organization_parks op
                    where op.park_id = p.id and op.organization_id = p.commune_id);
  if c_dangling > 0 then
    raise exception '0008: % parcs avec commune_id sans relation organization_parks', c_dangling;
  end if;

  -- 3. aucune relation organization_parks orpheline (park ou org inexistant)
  if exists (
    select 1 from organization_parks op
    where not exists (select 1 from parks p where p.id = op.park_id)
       or not exists (select 1 from organizations o where o.id = op.organization_id)
  ) then
    raise exception '0008: relation(s) organization_parks orpheline(s)';
  end if;

  raise notice '0008 OK — % communes -> % organizations ; % parks avec commune -> % organization_parks',
    c_communes, c_orgs_from_communes, c_parks_with_commune, c_org_parks;
end $$;
