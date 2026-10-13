-- ROLLBACK de l'alignement staging : restaure EXACTEMENT la variante scindée d'origine
-- (parks_public_read = published seul ; parks_extended_read pour authenticated). STAGING UNIQUEMENT.
-- Une seule transaction ; aucune donnée touchée. Garde-fou : refuse si l'état n'est pas celui « aligné ».
begin;
set local lock_timeout = '5s';

do $$
declare h text;
begin
  select md5(coalesce(qual,'')||'~'||coalesce(with_check,'')) into h
    from pg_policies where schemaname='public' and tablename='parks' and policyname='parks_public_read';
  if h is distinct from '584ffc0f1781e4a34503b391eb1f09be'
     or exists (select 1 from pg_policies where schemaname='public' and tablename='parks' and policyname='parks_extended_read') then
    raise exception 'rollback-align: état « aligné » attendu non trouvé — arrêt';
  end if;
end $$;

create temp table _rb_before on commit drop as
select (select count(*) from parks) n_parks,
       (select md5(string_agg(id::text||moderation_status::text||coalesce(created_by::text,'')||coalesce(commune_id::text,'')||updated_at::text, '|' order by id)) from parks) h_parks;

alter policy parks_public_read on public.parks using (moderation_status = 'published'::park_moderation_status);
create policy parks_extended_read on public.parks for select to authenticated using (
  created_by = auth.uid()
  or exists (select 1 from organization_parks op join team_members tm on tm.organization_id = op.organization_id
             where op.park_id = parks.id and tm.user_id = auth.uid())
  or (commune_id is not null and exists (select 1 from team_members tm2 where tm2.user_id = auth.uid() and tm2.commune_id = parks.commune_id))
  or exists (select 1 from team_members tm3 where tm3.user_id = auth.uid() and tm3.organization_id is null)
);

do $$
declare b record;
begin
  select * into b from _rb_before;
  if (select md5(coalesce(qual,'')||'~'||coalesce(with_check,'')) from pg_policies where schemaname='public' and tablename='parks' and policyname='parks_public_read') <> '004aa1d1febe30cd04b3da4f58d5f3c4'
     or (select md5(coalesce(qual,'')||'~'||coalesce(with_check,'')) from pg_policies where schemaname='public' and tablename='parks' and policyname='parks_extended_read') <> '25cdb096b0a46405de8a0ff9da31ee0c'
     or (select roles::text from pg_policies where schemaname='public' and tablename='parks' and policyname='parks_extended_read') <> '{authenticated}' then
    raise exception 'rollback-align: définitions restaurées ≠ variante staging d''origine';
  end if;
  if (select count(*) from parks) <> b.n_parks then raise exception 'rollback-align: parks modifiée'; end if;
  raise notice 'rollback-align OK';
end $$;
commit;
