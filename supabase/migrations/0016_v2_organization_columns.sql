-- ════════════════════════════════════════════════════════════════════════════
-- 0016 — `organization_id` sur team_members / maintenance / activity_log
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF — `commune_id` est CONSERVÉE sur les 3 tables.
-- Backfill : organization_id := commune_id (les UUID communes == UUID
-- organizations depuis 0008, donc la FK est directe).
--
-- team_members : 3 lignes — 2 super_admin sans commune -> organization_id NULL
--                (= staff Toboggo) ; 1 gestionnaire -> organization_id = son org.
-- maintenance / activity_log : 0 ligne.
--
-- Coexistence : triggers `*_v1_compat` synchronisent commune_id <-> organization_id
-- dans les deux sens. Retirés au futur 0020.
-- ════════════════════════════════════════════════════════════════════════════

-- ── team_members ───────────────────────────────────────────────────────
alter table team_members add column if not exists organization_id uuid;
update team_members set organization_id = commune_id
  where organization_id is null and commune_id is not null;

do $$ begin
  alter table team_members
    add constraint team_members_organization_id_fkey
    foreign key (organization_id) references organizations(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table team_members add constraint team_members_org_email_key unique (organization_id, email);
exception when duplicate_object then null; end $$;

create index if not exists team_members_user_idx on team_members (user_id);

-- Bidirectionnel : INSERT comble la version manquante ; UPDATE laisse gagner la
-- colonne explicitement modifiée (IS DISTINCT FROM) — donc `SET organization_id
-- = NULL` n'est PAS réinjecté depuis l'ancienne commune_id. Aucune boucle.
create or replace function team_members_v1_compat() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.organization_id is null then new.organization_id := new.commune_id; end if;
    if new.commune_id     is null then new.commune_id     := new.organization_id; end if;
  elsif new.organization_id is distinct from old.organization_id then
    new.commune_id := new.organization_id;
  elsif new.commune_id is distinct from old.commune_id then
    new.organization_id := new.commune_id;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists team_members_v1_compat_biu on team_members;
create trigger team_members_v1_compat_biu
  before insert or update on team_members
  for each row execute function team_members_v1_compat();

-- ── maintenance ────────────────────────────────────────────────────────
alter table maintenance add column if not exists organization_id uuid;
update maintenance set organization_id = commune_id
  where organization_id is null and commune_id is not null;

do $$ begin
  alter table maintenance
    add constraint maintenance_organization_id_fkey
    foreign key (organization_id) references organizations(id) on delete cascade;
exception when duplicate_object then null; end $$;

create index if not exists maintenance_org_idx on maintenance (organization_id);

create or replace function maintenance_v1_compat() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.organization_id is null then new.organization_id := new.commune_id; end if;
    if new.commune_id     is null then new.commune_id     := new.organization_id; end if;
  elsif new.organization_id is distinct from old.organization_id then
    new.commune_id := new.organization_id;
  elsif new.commune_id is distinct from old.commune_id then
    new.organization_id := new.commune_id;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists maintenance_v1_compat_biu on maintenance;
create trigger maintenance_v1_compat_biu
  before insert or update on maintenance
  for each row execute function maintenance_v1_compat();

-- maintenance.organization_id : cible v2 = NOT NULL (sûr, table vide + trigger)
do $$
declare c_null int;
begin
  select count(*) into c_null from maintenance where organization_id is null;
  if c_null = 0 then
    execute 'alter table maintenance alter column organization_id set not null';
  else
    raise notice '0016: % maintenance sans organization_id -> NOT NULL non appliqué', c_null;
  end if;
end $$;

-- ── activity_log ───────────────────────────────────────────────────────
alter table activity_log add column if not exists organization_id uuid;
update activity_log set organization_id = commune_id
  where organization_id is null and commune_id is not null;

do $$ begin
  alter table activity_log
    add constraint activity_log_organization_id_fkey
    foreign key (organization_id) references organizations(id) on delete cascade;
exception when duplicate_object then null; end $$;

create index if not exists activity_log_org_idx on activity_log (organization_id);

create or replace function activity_log_v1_compat() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.organization_id is null then new.organization_id := new.commune_id; end if;
    if new.commune_id     is null then new.commune_id     := new.organization_id; end if;
  elsif new.organization_id is distinct from old.organization_id then
    new.commune_id := new.organization_id;
  elsif new.commune_id is distinct from old.commune_id then
    new.organization_id := new.commune_id;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists activity_log_v1_compat_biu on activity_log;
create trigger activity_log_v1_compat_biu
  before insert or update on activity_log
  for each row execute function activity_log_v1_compat();

-- ── Assertions ─────────────────────────────────────────────────────────
do $$
declare
  c_tm_bad int; c_m_bad int; c_al_bad int;
  c_staff int;
begin
  -- team_members : organization_id == commune_id partout où commune_id renseigné
  select count(*) into c_tm_bad from team_members
   where commune_id is not null and organization_id is distinct from commune_id;
  if c_tm_bad > 0 then
    raise exception '0016: % team_members avec organization_id != commune_id', c_tm_bad;
  end if;

  -- les membres sans commune restent staff Toboggo (organization_id NULL)
  select count(*) into c_staff from team_members where commune_id is null and organization_id is null;
  if exists (select 1 from team_members where commune_id is null and organization_id is not null) then
    raise exception '0016: un team_member sans commune a reçu un organization_id (ne doit pas)';
  end if;

  select count(*) into c_m_bad from maintenance
   where commune_id is not null and organization_id is distinct from commune_id;
  if c_m_bad > 0 then raise exception '0016: % maintenance avec organization_id != commune_id', c_m_bad; end if;

  select count(*) into c_al_bad from activity_log
   where commune_id is not null and organization_id is distinct from commune_id;
  if c_al_bad > 0 then raise exception '0016: % activity_log avec organization_id != commune_id', c_al_bad; end if;

  -- toute organization_id renseignée pointe une organization existante
  if exists (
    select 1 from team_members where organization_id is not null
      and not exists (select 1 from organizations o where o.id = organization_id)
  ) then
    raise exception '0016: team_members.organization_id pointe une organization inexistante';
  end if;

  raise notice '0016 OK — organization_id backfillé sur team_members/maintenance/activity_log ; % membres staff Toboggo', c_staff;
end $$;
