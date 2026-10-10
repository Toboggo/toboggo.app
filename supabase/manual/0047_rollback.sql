-- ════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE de 0047 — SQL Editor Supabase, en une fois (une transaction).
-- Restaure les 3 policies de lecture d'origine (0002 / 0018 : `using (true)`).
-- ⚠ Cela RÉ-OUVRE la lecture publique des collectivités (contact_email) et des
-- rattachements parc↔collectivité : à ne faire qu'en cas de régression avérée.
-- Aucune donnée touchée. Retire aussi l'enregistrement de 0047.
-- ════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '10s';

drop policy if exists organizations_read on public.organizations;
create policy organizations_read on public.organizations for select using (true);

drop policy if exists communes_read on public.communes;
create policy communes_read on public.communes for select using (true);

drop policy if exists organization_parks_read on public.organization_parks;
create policy organization_parks_read on public.organization_parks for select using (true);

-- Plus aucune policy ne référence le helper ajouté par 0047.
drop function if exists public.park_is_published(uuid);

delete from supabase_migrations.schema_migrations where version = '0047';

do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public'
        and policyname in ('organizations_read', 'communes_read', 'organization_parks_read')
        and trim(qual) = 'true') <> 3 then
    raise exception '0047 rollback FAIL — policies non restaurées';
  end if;
  raise notice '0047 rollback OK — lecture d''origine restaurée';
end $$;

commit;
