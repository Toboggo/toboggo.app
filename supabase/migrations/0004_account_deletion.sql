-- Lets a signed-in user delete their own auth.users row (and everything that
-- cascades from it — profile, reviews, parks stay but created_by/user_id
-- go null via FK "on delete set null"/"cascade" as defined in 0001_init.sql).
create or replace function delete_own_account() returns void as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$ language plpgsql security definer;

grant execute on function delete_own_account() to authenticated;
