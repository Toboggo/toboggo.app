-- Lets Toboggo staff list and suspend app users from the admin back office.
alter table profiles add column suspended boolean not null default false;

create policy profiles_staff_read on profiles for select using (is_toboggo_staff(auth.uid()));
create policy profiles_staff_update on profiles for update using (is_toboggo_admin(auth.uid()));
