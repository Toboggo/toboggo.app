create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table contact_messages enable row level security;

-- Anyone (including signed-out visitors on the landing page) can submit; only
-- Toboggo staff can read.
create policy contact_insert on contact_messages for insert with check (true);
create policy contact_read on contact_messages for select using (is_toboggo_staff(auth.uid()));
