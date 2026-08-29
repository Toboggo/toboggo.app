-- ════════════════════════════════════════════════════════════════════════════
-- Row Level Security.
--   §13 Canonical data (parks + child tables) is never written directly from a
--       community contribution — parents propose via park_edits; only the
--       owning organisation's team or Toboggo staff mutate canonical rows.
--   §17 RBAC is separate for agents / responsables / admins.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Helper functions ─────────────────────────────────────────────────────
create or replace function is_toboggo_staff(p_uid uuid) returns boolean as $$
  select exists (select 1 from team_members where user_id = p_uid and organization_id is null);
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function is_toboggo_admin(p_uid uuid) returns boolean as $$
  select exists (
    select 1 from team_members
    where user_id = p_uid and organization_id is null and role in ('super_admin', 'moderation')
  );
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function org_role(p_uid uuid, p_org_id uuid) returns team_role as $$
  select role from team_members where user_id = p_uid and organization_id = p_org_id limit 1;
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function is_org_member(p_uid uuid, p_org_id uuid) returns boolean as $$
  select org_role(p_uid, p_org_id) is not null;
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function is_org_gestionnaire(p_uid uuid, p_org_id uuid) returns boolean as $$
  select org_role(p_uid, p_org_id) = 'gestionnaire';
$$ language sql stable security definer set search_path = public, pg_temp;

-- Is this user on the team of an organisation linked to this park? (§17 N-N)
create or replace function manages_park(p_uid uuid, p_park_id uuid) returns boolean as $$
  select exists (
    select 1 from organization_parks op
    join team_members tm on tm.organization_id = op.organization_id
    where op.park_id = p_park_id and tm.user_id = p_uid
  ) or is_toboggo_staff(p_uid);
$$ language sql stable security definer set search_path = public, pg_temp;

-- Can this user edit canonical child rows of this park? Park creator (while the
-- record is still theirs), the managing org's team, or Toboggo staff.
create or replace function can_edit_park(p_uid uuid, p_park_id uuid) returns boolean as $$
  select exists (select 1 from parks where id = p_park_id and created_by = p_uid)
    or manages_park(p_uid, p_park_id);
$$ language sql stable security definer set search_path = public, pg_temp;

-- ── Enable RLS ──────────────────────────────────────────────────────────
alter table organizations            enable row level security;
alter table organization_parks       enable row level security;
alter table parks                    enable row level security;
alter table park_sources             enable row level security;
alter table external_ids             enable row level security;
alter table park_names               enable row level security;
alter table park_zones               enable row level security;
alter table park_entrances           enable row level security;
alter table features                 enable row level security;
alter table park_features            enable row level security;
alter table park_equipment           enable row level security;
alter table park_opening_hours       enable row level security;
alter table park_attribute_sources   enable row level security;
alter table park_edits               enable row level security;
alter table audit_log                enable row level security;
alter table reviews                  enable row level security;
alter table park_media               enable row level security;
alter table reports                  enable row level security;
alter table park_scores              enable row level security;
alter table park_duplicate_candidates enable row level security;
alter table profiles                 enable row level security;
alter table team_members             enable row level security;
alter table maintenance              enable row level security;
alter table notifications            enable row level security;
alter table activity_log             enable row level security;
alter table groups                   enable row level security;
alter table group_members            enable row level security;
alter table contact_messages         enable row level security;

-- ── Reusable "can see this park" predicate ──────────────────────────────
-- Published parks are public; unpublished are visible to creator / managing
-- org / Toboggo staff.
create or replace function park_is_visible(p_park_id uuid) returns boolean as $$
  select exists (
    select 1 from parks p where p.id = p_park_id and (
      p.moderation_status = 'published'
      or p.created_by = auth.uid()
      or manages_park(auth.uid(), p.id)
    )
  );
$$ language sql stable security definer set search_path = public, pg_temp;

-- ── organizations (§17) ────────────────────────────────────────────────
create policy organizations_read on organizations for select using (true);
create policy organizations_insert on organizations for insert
  with check (is_toboggo_admin(auth.uid()));
create policy organizations_update on organizations for update using (
  is_toboggo_staff(auth.uid()) or is_org_gestionnaire(auth.uid(), id)
);
create policy organizations_delete on organizations for delete
  using (is_toboggo_admin(auth.uid()));

create policy organization_parks_read on organization_parks for select using (true);

-- Staff Toboggo : gestion globale des rattachements parc <-> organisation.
create policy organization_parks_staff_all on organization_parks for all
  using (is_toboggo_staff(auth.uid()))
  with check (is_toboggo_staff(auth.uid()));

-- Gestionnaire : INSERT une relation pour SON organisation uniquement, et
-- seulement si le parc n'a pas déjà un `owner` dans une AUTRE organisation
-- (empêche de réclamer arbitrairement le parc d'une autre collectivité).
create policy organization_parks_gest_insert on organization_parks for insert
  with check (
    is_org_gestionnaire(auth.uid(), organization_id)
    and not exists (
      select 1 from organization_parks o2
      where o2.park_id = organization_parks.park_id
        and o2.role = 'owner'
        and o2.organization_id <> organization_parks.organization_id
    )
  );

-- Gestionnaire : UPDATE (role / verified) d'une relation de SON organisation.
create policy organization_parks_gest_update on organization_parks for update
  using (is_org_gestionnaire(auth.uid(), organization_id))
  with check (is_org_gestionnaire(auth.uid(), organization_id));

-- Gestionnaire : DELETE d'une relation de SON organisation.
create policy organization_parks_gest_delete on organization_parks for delete
  using (is_org_gestionnaire(auth.uid(), organization_id));

-- Garde-fou : un non-staff ne peut jamais changer la cible (park_id) ni
-- l'organisation (organization_id) d'une relation existante.
create or replace function organization_parks_guard() returns trigger as $$
begin
  if not is_toboggo_staff(auth.uid())
     and (new.park_id is distinct from old.park_id
          or new.organization_id is distinct from old.organization_id) then
    raise exception 'organization_parks: seul le staff Toboggo peut déplacer une relation parc<->organisation';
  end if;
  return new;
end $$ language plpgsql set search_path = public, pg_temp;

create trigger organization_parks_guard_bu
  before update on organization_parks
  for each row execute function organization_parks_guard();

-- ── parks (§2 §13) ─────────────────────────────────────────────────────
create policy parks_read on parks for select using (
  moderation_status = 'published'
  or created_by = auth.uid()
  or manages_park(auth.uid(), id)
);
create policy parks_insert on parks for insert with check (auth.uid() is not null);
create policy parks_update on parks for update using (
  created_by = auth.uid() or manages_park(auth.uid(), id)
);
create policy parks_delete on parks for delete using (
  is_toboggo_admin(auth.uid())
  or exists (
    select 1 from organization_parks op
    where op.park_id = id and is_org_gestionnaire(auth.uid(), op.organization_id)
  )
);

-- ── Canonical child tables: public read (if park visible), managed write ──
create policy park_sources_read on park_sources for select using (park_is_visible(park_id));
create policy park_sources_write on park_sources for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy external_ids_read on external_ids for select using (park_is_visible(park_id));
create policy external_ids_write on external_ids for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_names_read on park_names for select using (park_is_visible(park_id));
create policy park_names_write on park_names for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_zones_read on park_zones for select using (park_is_visible(park_id));
create policy park_zones_write on park_zones for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_entrances_read on park_entrances for select using (park_is_visible(park_id));
create policy park_entrances_write on park_entrances for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_features_read on park_features for select using (park_is_visible(park_id));
create policy park_features_write on park_features for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_equipment_read on park_equipment for select using (park_is_visible(park_id));
create policy park_equipment_write on park_equipment for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_opening_hours_read on park_opening_hours for select using (park_is_visible(park_id));
create policy park_opening_hours_write on park_opening_hours for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

-- §12 provenance: public read (powers "Informations vérifiées"), managed write
create policy park_attr_src_read on park_attribute_sources for select using (park_is_visible(park_id));
create policy park_attr_src_write on park_attribute_sources for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

-- ── features catalogue: public read, Toboggo-staff write (§3) ───────────
create policy features_read on features for select using (true);
create policy features_write on features for all
  using (is_toboggo_staff(auth.uid())) with check (is_toboggo_staff(auth.uid()));

-- ── §13 park_edits / change-requests ───────────────────────────────────
create policy park_edits_read on park_edits for select using (
  user_id = auth.uid()
  or (park_id is not null and manages_park(auth.uid(), park_id))
  or is_toboggo_staff(auth.uid())
);
create policy park_edits_insert on park_edits for insert
  with check (user_id = auth.uid());
create policy park_edits_update on park_edits for update using (
  (park_id is not null and manages_park(auth.uid(), park_id)) or is_toboggo_staff(auth.uid())
);

-- ── §14 audit_log: read for managers/staff, insert via triggers only ────
create policy audit_log_read on audit_log for select using (
  is_toboggo_staff(auth.uid())
  or (entity_type = 'park' and manages_park(auth.uid(), entity_id))
);
create policy audit_log_insert on audit_log for insert with check (auth.uid() is not null);

-- ── §15 reviews ────────────────────────────────────────────────────────
create policy reviews_read on reviews for select using (
  status = 'published' or user_id = auth.uid() or manages_park(auth.uid(), park_id)
);
create policy reviews_insert on reviews for insert with check (user_id = auth.uid());
create policy reviews_update on reviews for update using (
  user_id = auth.uid()
  or exists (
    select 1 from organization_parks op
    where op.park_id = reviews.park_id and is_org_gestionnaire(auth.uid(), op.organization_id)
  )
  or is_toboggo_staff(auth.uid())
);
create policy reviews_delete on reviews for delete using (is_toboggo_admin(auth.uid()));

-- ── §15 park_media ─────────────────────────────────────────────────────
create policy park_media_read on park_media for select using (
  status = 'approved' or user_id = auth.uid() or manages_park(auth.uid(), park_id)
);
create policy park_media_insert on park_media for insert with check (auth.uid() is not null);
create policy park_media_update on park_media for update using (
  user_id = auth.uid() or manages_park(auth.uid(), park_id)
);
create policy park_media_delete on park_media for delete using (
  user_id = auth.uid() or manages_park(auth.uid(), park_id)
);

-- ── §15 reports ────────────────────────────────────────────────────────
create policy reports_read on reports for select using (
  user_id = auth.uid() or manages_park(auth.uid(), park_id)
);
create policy reports_insert on reports for insert with check (auth.uid() is not null);
create policy reports_update on reports for update using (
  manages_park(auth.uid(), park_id) or is_toboggo_admin(auth.uid())
);

-- ── §16 park_scores: public read, managed/service write ────────────────
create policy park_scores_read on park_scores for select using (park_is_visible(park_id));
create policy park_scores_write on park_scores for all
  using (manages_park(auth.uid(), park_id)) with check (manages_park(auth.uid(), park_id));

-- ── §11 duplicate candidates: Toboggo staff only ──────────────────────
create policy park_dupe_all on park_duplicate_candidates for all
  using (is_toboggo_staff(auth.uid())) with check (is_toboggo_staff(auth.uid()));

-- ── profiles ──────────────────────────────────────────────────────────
create policy profiles_self_select on profiles for select using (id = auth.uid());
create policy profiles_self_insert on profiles for insert with check (id = auth.uid());
create policy profiles_self_update on profiles for update using (id = auth.uid());
create policy profiles_staff_read on profiles for select using (is_toboggo_staff(auth.uid()));
create policy profiles_staff_update on profiles for update using (is_toboggo_admin(auth.uid()));

-- ── team_members (§17 RBAC) ───────────────────────────────────────────
create policy team_read on team_members for select using (
  user_id = auth.uid()
  or (organization_id is null and is_toboggo_staff(auth.uid()))
  or (organization_id is not null and is_org_member(auth.uid(), organization_id))
);
create policy team_insert on team_members for insert with check (
  (organization_id is null and is_toboggo_admin(auth.uid()))
  or (organization_id is not null and is_org_gestionnaire(auth.uid(), organization_id))
);
create policy team_update on team_members for update using (
  (organization_id is null and is_toboggo_admin(auth.uid()))
  or (organization_id is not null and is_org_gestionnaire(auth.uid(), organization_id))
);
create policy team_delete on team_members for delete using (
  (organization_id is null and is_toboggo_admin(auth.uid()))
  or (organization_id is not null and is_org_gestionnaire(auth.uid(), organization_id))
);

-- ── maintenance: organisation-internal ───────────────────────────────
create policy maintenance_all on maintenance for all
  using (is_org_member(auth.uid(), organization_id))
  with check (is_org_member(auth.uid(), organization_id));

-- ── notifications: strictly own rows ─────────────────────────────────
create policy notifications_own on notifications for select using (user_id = auth.uid());
create policy notifications_update_own on notifications for update using (user_id = auth.uid());
create policy notifications_insert on notifications for insert with check (true);

-- ── activity_log: readable by the org it belongs to ─────────────────
create policy activity_read on activity_log for select using (
  (organization_id is null and is_toboggo_staff(auth.uid()))
  or (organization_id is not null and is_org_member(auth.uid(), organization_id))
);
create policy activity_insert on activity_log for insert with check (auth.uid() is not null);

-- ── groups / group_members ──────────────────────────────────────────
create policy groups_read on groups for select using (true);
create policy groups_insert on groups for insert with check (created_by = auth.uid());
create policy groups_update on groups for update using (created_by = auth.uid());
create policy group_members_read on group_members for select using (true);
create policy group_members_write on group_members for insert with check (true);
create policy group_members_update on group_members for update using (true);

-- ── contact_messages: anyone submits, Toboggo staff reads ───────────
create policy contact_insert on contact_messages for insert with check (true);
create policy contact_read on contact_messages for select using (is_toboggo_staff(auth.uid()));
