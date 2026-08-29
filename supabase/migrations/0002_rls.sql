-- Row Level Security. Helper functions first, then per-table policies.

create or replace function is_toboggo_staff(p_uid uuid) returns boolean as $$
  select exists (
    select 1 from team_members where user_id = p_uid and commune_id is null
  );
$$ language sql stable security definer;

create or replace function is_toboggo_admin(p_uid uuid) returns boolean as $$
  select exists (
    select 1 from team_members where user_id = p_uid and commune_id is null and role in ('super_admin', 'moderation')
  );
$$ language sql stable security definer;

create or replace function commune_role(p_uid uuid, p_commune_id uuid) returns team_role as $$
  select role from team_members where user_id = p_uid and commune_id = p_commune_id limit 1;
$$ language sql stable security definer;

create or replace function is_commune_gestionnaire(p_uid uuid, p_commune_id uuid) returns boolean as $$
  select commune_role(p_uid, p_commune_id) = 'gestionnaire';
$$ language sql stable security definer;

create or replace function is_commune_member(p_uid uuid, p_commune_id uuid) returns boolean as $$
  select commune_role(p_uid, p_commune_id) is not null;
$$ language sql stable security definer;

alter table profiles enable row level security;
alter table communes enable row level security;
alter table team_members enable row level security;
alter table parks enable row level security;
alter table park_edit_history enable row level security;
alter table reviews enable row level security;
alter table reports enable row level security;
alter table maintenance enable row level security;
alter table notifications enable row level security;
alter table activity_log enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;

-- profiles: a user manages only their own row.
create policy profiles_self_select on profiles for select using (id = auth.uid());
create policy profiles_self_upsert on profiles for insert with check (id = auth.uid());
create policy profiles_self_update on profiles for update using (id = auth.uid());

-- communes: public read (needed for the collectivité switcher / display names);
-- write restricted to that commune's gestionnaire or Toboggo staff.
create policy communes_read on communes for select using (true);
create policy communes_write on communes for update using (
  is_commune_gestionnaire(auth.uid(), id) or is_toboggo_staff(auth.uid())
);

-- team_members: visible to members of the same org (commune or Toboggo staff);
-- managed only by gestionnaire/super_admin.
create policy team_read on team_members for select using (
  user_id = auth.uid()
  or (commune_id is null and is_toboggo_staff(auth.uid()))
  or (commune_id is not null and is_commune_member(auth.uid(), commune_id))
);
create policy team_write on team_members for insert with check (
  (commune_id is null and is_toboggo_admin(auth.uid()))
  or (commune_id is not null and is_commune_gestionnaire(auth.uid(), commune_id))
);
create policy team_update on team_members for update using (
  (commune_id is null and is_toboggo_admin(auth.uid()))
  or (commune_id is not null and is_commune_gestionnaire(auth.uid(), commune_id))
);
create policy team_delete on team_members for delete using (
  (commune_id is null and is_toboggo_admin(auth.uid()))
  or (commune_id is not null and is_commune_gestionnaire(auth.uid(), commune_id))
);

-- parks: published parks are public; drafts/pending/blocked/rejected are
-- visible to their creator, the owning commune's team, and Toboggo staff.
create policy parks_public_read on parks for select using (
  status = 'published'
  or created_by = auth.uid()
  or (commune_id is not null and is_commune_member(auth.uid(), commune_id))
  or is_toboggo_staff(auth.uid())
);
create policy parks_insert on parks for insert with check (auth.uid() is not null);
create policy parks_update on parks for update using (
  created_by = auth.uid()
  or (commune_id is not null and is_commune_member(auth.uid(), commune_id))
  or is_toboggo_staff(auth.uid())
);
create policy parks_delete on parks for delete using (
  (commune_id is not null and is_commune_gestionnaire(auth.uid(), commune_id))
  or is_toboggo_admin(auth.uid())
);

create policy park_history_read on park_edit_history for select using (
  exists (
    select 1 from parks p where p.id = park_id and (
      p.created_by = auth.uid()
      or (p.commune_id is not null and is_commune_member(auth.uid(), p.commune_id))
      or is_toboggo_staff(auth.uid())
    )
  )
);
create policy park_history_insert on park_edit_history for insert with check (auth.uid() is not null);

-- reviews: public read; a user writes only their own; reply restricted to
-- the park's commune gestionnaire or Toboggo staff; delete = moderation only.
create policy reviews_read on reviews for select using (true);
create policy reviews_insert on reviews for insert with check (user_id = auth.uid());
create policy reviews_update on reviews for update using (
  user_id = auth.uid()
  or exists (
    select 1 from parks p where p.id = park_id and (
      (p.commune_id is not null and is_commune_gestionnaire(auth.uid(), p.commune_id))
      or is_toboggo_staff(auth.uid())
    )
  )
);
create policy reviews_delete on reviews for delete using (is_toboggo_admin(auth.uid()));

-- reports: creator + the park's commune team + Toboggo staff can see/manage.
create policy reports_read on reports for select using (
  user_id = auth.uid()
  or exists (
    select 1 from parks p where p.id = park_id and (
      (p.commune_id is not null and is_commune_member(auth.uid(), p.commune_id))
      or is_toboggo_staff(auth.uid())
    )
  )
);
create policy reports_insert on reports for insert with check (auth.uid() is not null);
create policy reports_update on reports for update using (
  exists (
    select 1 from parks p where p.id = park_id and (
      (p.commune_id is not null and is_commune_gestionnaire(auth.uid(), p.commune_id))
      or is_toboggo_admin(auth.uid())
    )
  )
);

-- maintenance: commune-internal only.
create policy maintenance_all on maintenance for all using (
  is_commune_member(auth.uid(), commune_id)
) with check (
  is_commune_member(auth.uid(), commune_id)
);

-- notifications: strictly own rows.
create policy notifications_own on notifications for select using (user_id = auth.uid());
create policy notifications_update_own on notifications for update using (user_id = auth.uid());
create policy notifications_insert on notifications for insert with check (true);

-- activity_log: readable by the org it belongs to.
create policy activity_read on activity_log for select using (
  (commune_id is null and is_toboggo_staff(auth.uid()))
  or (commune_id is not null and is_commune_member(auth.uid(), commune_id))
);
create policy activity_insert on activity_log for insert with check (auth.uid() is not null);

-- groups / group_members: any authenticated user can create/join (low
-- sensitivity — a live-location meetup code shared voluntarily by parents).
create policy groups_read on groups for select using (true);
create policy groups_insert on groups for insert with check (created_by = auth.uid());
create policy groups_update on groups for update using (created_by = auth.uid());
create policy group_members_read on group_members for select using (true);
create policy group_members_write on group_members for insert with check (true);
create policy group_members_update on group_members for update using (true);
