with u as (
  select user_id as uid from team_members where user_id is not null
  union select created_by from parks where created_by is not null
  union select null::uuid
), cmp as (
  select u.uid,
    (p.moderation_status='published'::park_moderation_status or p.created_by=u.uid or can_edit_park(u.uid,p.id)
       or (p.commune_id is not null and is_commune_member(u.uid,p.commune_id)) or is_toboggo_staff(u.uid)) as old_v,
    (p.moderation_status='published'::park_moderation_status
       or is_toboggo_staff(u.uid)
       or p.created_by=u.uid
       or p.id in (select op.park_id from organization_parks op join team_members tm on tm.organization_id=op.organization_id where tm.user_id=u.uid)
       or (p.commune_id is not null and p.commune_id in (select tm.commune_id from team_members tm where tm.user_id=u.uid and tm.commune_id is not null))) as new_v
  from u cross join parks p
)
select count(distinct uid) as principals, count(*) as pairs_checked,
       count(*) filter (where old_v is distinct from new_v) as mismatches,
       count(*) filter (where old_v) as visible_pairs
from cmp;
