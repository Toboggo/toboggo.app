-- Rollback de 0050_rls_read_perf.sql — restaure exactement les policies d'origine
-- (0018/0021/0047). Transaction unique ; n'altère aucune donnée.
begin;

alter policy parks_public_read on public.parks
  using (
    (moderation_status = 'published'::park_moderation_status)
    or (created_by = auth.uid())
    or can_edit_park(auth.uid(), id)
    or ((commune_id is not null) and is_commune_member(auth.uid(), commune_id))
    or is_toboggo_staff(auth.uid())
  );

do $$
declare t text;
begin
  foreach t in array array[
    'park_sources:park_sources_read','park_features:park_features_read',
    'park_names:park_names_read','park_scores:park_scores_read',
    'external_ids:external_ids_read','park_attribute_sources:park_attr_src_read',
    'park_entrances:park_entrances_read','park_equipment:park_equipment_read',
    'park_opening_hours:park_opening_hours_read','park_zones:park_zones_read'] loop
    execute format('alter policy %I on public.%I using (park_is_visible(park_id))', split_part(t, ':', 2), split_part(t, ':', 1));
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'park_sources:park_sources_write:can_edit_park','park_features:park_features_write:can_edit_park',
    'park_names:park_names_write:can_edit_park','park_scores:park_scores_write:manages_park',
    'external_ids:external_ids_write:can_edit_park','park_attribute_sources:park_attr_src_write:can_edit_park',
    'park_entrances:park_entrances_write:can_edit_park','park_equipment:park_equipment_write:can_edit_park',
    'park_opening_hours:park_opening_hours_write:can_edit_park','park_zones:park_zones_write:can_edit_park'] loop
    execute format('alter policy %I on public.%I using (%s(auth.uid(), park_id))',
      split_part(t, ':', 2), split_part(t, ':', 1), split_part(t, ':', 3));
  end loop;
end $$;

drop function if exists public.rls_managed_park_ids();
drop function if exists public.rls_member_commune_ids();

-- l'enregistrement fait par 0050_manual_apply.sql est retiré aussi (sinon `migration list` mentirait)
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '0050' and name = 'rls_read_perf';
  end if;
end $$;

do $$
begin
  if (select qual from pg_policies where schemaname='public' and tablename='parks' and policyname='parks_public_read') like '%rls_managed%' then
    raise exception 'rollback 0050 incomplet';
  end if;
  raise notice 'rollback 0050 OK';
end $$;
commit;
