-- ════════════════════════════════════════════════════════════════════════════
-- Fix: OAuth / email sign-up failing with "Database error saving new user".
--
-- link_team_member_on_signup() is SECURITY DEFINER and fires on insert into
-- auth.users. GoTrue runs it as `supabase_auth_admin`, whose search_path does
-- NOT include `public`, so the unqualified `team_members` / `profiles`
-- references resolved to nothing and the trigger raised — which GoTrue reports
-- to the client as error_code=unexpected_failure on the OAuth redirect.
--
-- Schema-qualify every table and pin search_path so it works regardless of the
-- caller's role. Idempotent — safe to run on any environment.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function link_team_member_on_signup() returns trigger as $$
begin
  update public.team_members set user_id = new.id
    where lower(email) = lower(new.email) and user_id is null;
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
