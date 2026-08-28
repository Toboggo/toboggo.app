-- ════════════════════════════════════════════════════════════════════════════
-- Storage buckets + API grants.
-- ════════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('park-photos', 'park-photos', true),
       ('avatars', 'avatars', true),
       ('report-photos', 'report-photos', true)
on conflict (id) do nothing;

create policy "Public read park photos" on storage.objects for select using (bucket_id = 'park-photos');
create policy "Public read avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "Public read report photos" on storage.objects for select using (bucket_id = 'report-photos');

create policy "Authenticated upload park photos" on storage.objects for insert
  with check (bucket_id = 'park-photos' and auth.uid() is not null);
create policy "Authenticated upload avatars" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid() is not null);
create policy "Authenticated upload report photos" on storage.objects for insert
  with check (bucket_id = 'report-photos' and auth.uid() is not null);

-- ── Data API grants ──────────────────────────────────────────────────────
-- The consumer app reads the flattened public view unauthenticated.
grant select on park_public to anon, authenticated;
grant select on parks, park_names, park_zones, park_entrances, features, park_features,
  park_equipment, park_opening_hours, park_sources, external_ids, park_attribute_sources,
  reviews, park_media, reports, park_scores, organizations, organization_parks to anon, authenticated;
grant insert, update, delete on parks, park_names, park_zones, park_entrances, park_features,
  park_equipment, park_opening_hours, park_sources, external_ids, park_attribute_sources,
  park_edits, reviews, park_media, reports, park_scores, organizations, organization_parks,
  audit_log, park_duplicate_candidates to authenticated;
grant select, insert, update, delete on profiles, team_members, maintenance, notifications,
  activity_log, groups, group_members to authenticated;
grant select on park_edits, audit_log, park_duplicate_candidates to authenticated;
grant insert on contact_messages to anon, authenticated;
grant select on contact_messages to authenticated;
