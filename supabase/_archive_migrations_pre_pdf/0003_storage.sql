-- Storage buckets for user-contributed photos. Public read (photos are shown
-- on published park cards/reviews), authenticated write.

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
