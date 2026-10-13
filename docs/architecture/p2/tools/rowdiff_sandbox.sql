\set QUIET on
create temp table _u(uid uuid);
insert into _u values ('a0000000-0000-0000-0000-000000000001'),('a0000000-0000-0000-0000-000000000002'),('a0000000-0000-0000-0000-000000000003'),('a0000000-0000-0000-0000-000000000004'),('a0000000-0000-0000-0000-000000000005'),('a0000000-0000-0000-0000-000000000006'),('a0000000-0000-0000-0000-000000000007'),('5df27eca-2ef3-4d63-9a1d-68610cd76597'),('ffffffff-ffff-ffff-ffff-ffffffffffff'),(null);
do $$
declare u record; n_parks int; n_vis int; n_src int; n_scores int;
begin
  for u in select uid from _u loop
    perform set_config('request.jwt.claims', case when u.uid is null then '{"role":"anon"}' else json_build_object('sub',u.uid,'role','authenticated')::text end, true);
    select count(*) into n_parks from parks p where
      ((p.moderation_status='published'::park_moderation_status) or (p.created_by=auth.uid()) or can_edit_park(auth.uid(),p.id) or (p.commune_id is not null and is_commune_member(auth.uid(),p.commune_id)) or is_toboggo_staff(auth.uid()))
      is distinct from
      (p.moderation_status='published'::park_moderation_status
        or (select is_toboggo_staff((select auth.uid())))
        or p.created_by=(select auth.uid())
        or p.id in (select m from rls_managed_park_ids() m)
        or (p.commune_id is not null and p.commune_id in (select c from rls_member_commune_ids() c)));
    select count(*) into n_vis from parks p where
      (can_edit_park(auth.uid(),p.id) or park_is_visible(p.id)) is distinct from park_is_visible(p.id) or false;
    raise notice 'uid=% parks_policy_mismatch=%', coalesce(u.uid::text,'anon'), n_parks;
  end loop;
end $$;
