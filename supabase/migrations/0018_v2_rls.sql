-- ════════════════════════════════════════════════════════════════════════════
-- 0018 — RLS v2 : helpers + policies pour les NOUVELLES tables
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. Aucune policy V1 supprimée ni modifiée.
--
-- Périmètre de CE lot (coexistence) :
--   • helpers v2 (org_role corrigé, is_org_member, is_org_gestionnaire,
--     manages_park, can_edit_park, park_is_visible)
--   • is_toboggo_staff / is_toboggo_admin : `create or replace` vers la forme v2
--     (organization_id is null). Équivalent fonctionnel : organization_id a été
--     backfillé = commune_id en 0016, donc les policies V1 qui les appellent
--     continuent de se comporter à l'identique.
--   • enable RLS + policies sur les 17 tables NOUVELLES (0008→0016)
--
-- HORS périmètre (fait au futur lot post-cutover / 0020) :
--   le durcissement des policies V1 déjà en place sur parks / reviews / reports /
--   profiles / team_members / activity_log / groups / notifications / maintenance.
--   Ces tables gardent leurs policies V1 pendant la coexistence (permissive OR).
--   -> évite toute collision de nom de policy et tout `drop policy`.
--
-- CORRECTIONS de l'audit :
--   • `org_role()` : priorité explicite (super_admin > moderation > gestionnaire
--     > contributeur > support) — déterminisme pour un membre multi-rôles.
--   • toutes les fonctions SECURITY DEFINER : `set search_path = public, pg_temp`.
--   • faille `organization_parks_write` : remplacée par des policies séparées —
--     le gestionnaire ne peut plus réclamer un parc déjà `owner` d'une autre
--     organisation, ni (via trigger `organization_parks_guard`) déplacer une
--     relation existante. Staff Toboggo conserve la gestion globale.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Helpers : staff Toboggo (forme v2) ───────────────────────────────────
create or replace function is_toboggo_staff(p_uid uuid) returns boolean as $$
  select exists (select 1 from team_members where user_id = p_uid and organization_id is null);
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function is_toboggo_admin(p_uid uuid) returns boolean as $$
  select exists (
    select 1 from team_members
    where user_id = p_uid and organization_id is null and role in ('super_admin','moderation')
  );
$$ language sql stable security definer set search_path = public, pg_temp;

-- ── Helper : rôle dans une organisation — PRIORITÉ EXPLICITE (fix) ───────
create or replace function org_role(p_uid uuid, p_org_id uuid) returns team_role as $$
  select role from team_members
  where user_id = p_uid and organization_id = p_org_id
  order by case role
    when 'super_admin'  then 1
    when 'moderation'   then 2
    when 'gestionnaire' then 3
    when 'contributeur' then 4
    when 'support'      then 5
    else 9
  end
  limit 1;
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function is_org_member(p_uid uuid, p_org_id uuid) returns boolean as $$
  select org_role(p_uid, p_org_id) is not null;
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function is_org_gestionnaire(p_uid uuid, p_org_id uuid) returns boolean as $$
  -- identique à migrations-v2-draft ; le fix de déterminisme est dans org_role()
  -- (priorité explicite) : si un membre est gestionnaire + contributeur,
  -- org_role() renvoie désormais 'gestionnaire' de façon déterministe.
  select org_role(p_uid, p_org_id) = 'gestionnaire';
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function manages_park(p_uid uuid, p_park_id uuid) returns boolean as $$
  select exists (
    select 1 from organization_parks op
    join team_members tm on tm.organization_id = op.organization_id
    where op.park_id = p_park_id and tm.user_id = p_uid
  ) or is_toboggo_staff(p_uid);
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function can_edit_park(p_uid uuid, p_park_id uuid) returns boolean as $$
  select exists (select 1 from parks where id = p_park_id and created_by = p_uid)
    or manages_park(p_uid, p_park_id);
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function park_is_visible(p_park_id uuid) returns boolean as $$
  select exists (
    select 1 from parks p where p.id = p_park_id and (
      p.moderation_status = 'published'
      or p.created_by = auth.uid()
      or manages_park(auth.uid(), p.id)
    )
  );
$$ language sql stable security definer set search_path = public, pg_temp;

-- ── Enable RLS sur les tables nouvelles ────────────────────────────────
alter table organizations              enable row level security;
alter table organization_parks         enable row level security;
alter table park_sources               enable row level security;
alter table external_ids               enable row level security;
alter table park_names                 enable row level security;
alter table park_zones                 enable row level security;
alter table park_entrances             enable row level security;
alter table features                   enable row level security;
alter table park_features              enable row level security;
alter table park_equipment             enable row level security;
alter table park_opening_hours         enable row level security;
alter table park_attribute_sources     enable row level security;
alter table park_edits                 enable row level security;
alter table audit_log                  enable row level security;
alter table park_media                 enable row level security;
alter table park_scores                enable row level security;
alter table park_duplicate_candidates  enable row level security;

-- ── organizations (§17) ───────────────────────────────────────────────
create policy organizations_read   on organizations for select using (true);
create policy organizations_insert on organizations for insert
  with check (is_toboggo_admin(auth.uid()));
create policy organizations_update on organizations for update using (
  is_toboggo_staff(auth.uid()) or is_org_gestionnaire(auth.uid(), id)
);
create policy organizations_delete on organizations for delete
  using (is_toboggo_admin(auth.uid()));

create policy organization_parks_read on organization_parks for select using (true);

-- Staff Toboggo : gestion globale des rattachements.
create policy organization_parks_staff_all on organization_parks for all
  using (is_toboggo_staff(auth.uid()))
  with check (is_toboggo_staff(auth.uid()));

-- Gestionnaire : INSERT une relation pour SON organisation uniquement, et
-- seulement si le parc n'a pas déjà un `owner` dans une AUTRE organisation
-- (empêche de « réclamer » un parc appartenant à une autre collectivité).
create policy organization_parks_gest_insert on organization_parks for insert
  with check (
    is_org_gestionnaire(auth.uid(), organization_id)
    and not exists (
      select 1 from organization_parks o2
      where o2.park_id = organization_parks.park_id
        and o2.role = 'owner'
        and o2.organization_id <> organization_parks.organization_id
    )
  );

-- Gestionnaire : UPDATE d'une relation de SON organisation (role / verified).
-- `using` (ancienne ligne) et `with check` (nouvelle ligne) exigent tous deux
-- que organization_id reste le sien -> impossible de déplacer la relation.
-- Le changement de `park_id` / `organization_id` est bloqué par le trigger
-- `organization_parks_guard` ci-dessous.
create policy organization_parks_gest_update on organization_parks for update
  using (is_org_gestionnaire(auth.uid(), organization_id))
  with check (is_org_gestionnaire(auth.uid(), organization_id));

-- Gestionnaire : DELETE d'une relation de SON organisation.
create policy organization_parks_gest_delete on organization_parks for delete
  using (is_org_gestionnaire(auth.uid(), organization_id));

-- Garde-fou : un non-staff ne peut jamais changer la cible (park_id) ni
-- l'organisation (organization_id) d'une relation existante.
create or replace function organization_parks_guard() returns trigger as $$
begin
  if not is_toboggo_staff(auth.uid())
     and (new.park_id is distinct from old.park_id
          or new.organization_id is distinct from old.organization_id) then
    raise exception 'organization_parks: seul le staff Toboggo peut déplacer une relation parc<->organisation';
  end if;
  return new;
end $$ language plpgsql set search_path = public, pg_temp;

drop trigger if exists organization_parks_guard_bu on organization_parks;
create trigger organization_parks_guard_bu
  before update on organization_parks
  for each row execute function organization_parks_guard();

-- ── Tables filles canoniques : lecture si parc visible, écriture gérée ──
create policy park_sources_read  on park_sources  for select using (park_is_visible(park_id));
create policy park_sources_write on park_sources  for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy external_ids_read  on external_ids  for select using (park_is_visible(park_id));
create policy external_ids_write on external_ids  for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_names_read  on park_names  for select using (park_is_visible(park_id));
create policy park_names_write on park_names  for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_zones_read  on park_zones  for select using (park_is_visible(park_id));
create policy park_zones_write on park_zones  for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_entrances_read  on park_entrances  for select using (park_is_visible(park_id));
create policy park_entrances_write on park_entrances  for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_features_read  on park_features  for select using (park_is_visible(park_id));
create policy park_features_write on park_features  for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_equipment_read  on park_equipment  for select using (park_is_visible(park_id));
create policy park_equipment_write on park_equipment  for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_opening_hours_read  on park_opening_hours  for select using (park_is_visible(park_id));
create policy park_opening_hours_write on park_opening_hours  for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

create policy park_attr_src_read  on park_attribute_sources  for select using (park_is_visible(park_id));
create policy park_attr_src_write on park_attribute_sources  for all
  using (can_edit_park(auth.uid(), park_id)) with check (can_edit_park(auth.uid(), park_id));

-- ── features catalogue : lecture publique, écriture staff ──────────────
create policy features_read  on features for select using (true);
create policy features_write on features for all
  using (is_toboggo_staff(auth.uid())) with check (is_toboggo_staff(auth.uid()));

-- ── park_edits (§13) ──────────────────────────────────────────────────
create policy park_edits_read on park_edits for select using (
  user_id = auth.uid()
  or (park_id is not null and manages_park(auth.uid(), park_id))
  or is_toboggo_staff(auth.uid())
);
create policy park_edits_insert on park_edits for insert with check (user_id = auth.uid());
create policy park_edits_update on park_edits for update using (
  (park_id is not null and manages_park(auth.uid(), park_id)) or is_toboggo_staff(auth.uid())
);

-- ── audit_log (§14) : lecture managers/staff, insert via triggers ──────
create policy audit_log_read on audit_log for select using (
  is_toboggo_staff(auth.uid())
  or (entity_type = 'park' and manages_park(auth.uid(), entity_id))
);
create policy audit_log_insert on audit_log for insert with check (auth.uid() is not null);

-- ── park_media (§15) ──────────────────────────────────────────────────
create policy park_media_read on park_media for select using (
  status = 'approved' or user_id = auth.uid() or manages_park(auth.uid(), park_id)
);
create policy park_media_insert on park_media for insert with check (auth.uid() is not null);
create policy park_media_update on park_media for update using (
  user_id = auth.uid() or manages_park(auth.uid(), park_id)
);
create policy park_media_delete on park_media for delete using (
  user_id = auth.uid() or manages_park(auth.uid(), park_id)
);

-- ── park_scores (§16) ─────────────────────────────────────────────────
create policy park_scores_read  on park_scores for select using (park_is_visible(park_id));
create policy park_scores_write on park_scores for all
  using (manages_park(auth.uid(), park_id)) with check (manages_park(auth.uid(), park_id));

-- ── park_duplicate_candidates (§11) : staff Toboggo uniquement ────────
create policy park_dupe_all on park_duplicate_candidates for all
  using (is_toboggo_staff(auth.uid())) with check (is_toboggo_staff(auth.uid()));

-- ── Assertions ─────────────────────────────────────────────────────────
do $$
declare t text; n int; missing text := '';
begin
  foreach t in array array[
    'organizations','organization_parks','park_sources','external_ids','park_names',
    'park_zones','park_entrances','features','park_features','park_equipment',
    'park_opening_hours','park_attribute_sources','park_edits','audit_log',
    'park_media','park_scores','park_duplicate_candidates'
  ] loop
    if not (select relrowsecurity from pg_class where oid = ('public.'||t)::regclass) then
      missing := missing || t || ' ';
    end if;
    select count(*) into n from pg_policies where schemaname='public' and tablename=t;
    if n = 0 then missing := missing || t || '(no-policy) '; end if;
  end loop;
  if missing <> '' then
    raise exception '0018: RLS/policies manquantes: %', missing;
  end if;

  -- org_role déterministe : la fonction contient un ORDER BY
  if not exists (
    select 1 from pg_proc where proname = 'org_role' and pronamespace = 'public'::regnamespace
      and pg_get_functiondef(oid) ilike '%order by%'
  ) then
    raise exception '0018: org_role() sans ORDER BY — fix de priorité non appliqué';
  end if;

  -- tous les helpers SECURITY DEFINER doivent pinner search_path
  declare bad text;
  begin
    select string_agg(p.proname, ', ') into bad
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proname in ('is_toboggo_staff','is_toboggo_admin','org_role','is_org_member',
                        'is_org_gestionnaire','manages_park','can_edit_park','park_is_visible')
      and not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%');
    if bad is not null then
      raise exception '0018: helpers SECURITY DEFINER sans search_path pinné: %', bad;
    end if;
  end;

  -- faille organization_parks corrigée : plus de policy `_write` FOR ALL
  -- gestionnaire ; l'INSERT gestionnaire vérifie l'absence d'owner concurrent.
  if exists (select 1 from pg_policies
             where schemaname='public' and tablename='organization_parks'
               and policyname='organization_parks_write') then
    raise exception '0018: ancienne policy organization_parks_write encore présente';
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='organization_parks'
                   and policyname='organization_parks_gest_insert') then
    raise exception '0018: policy organization_parks_gest_insert absente';
  end if;
  if not exists (select 1 from pg_trigger
                 where tgname='organization_parks_guard_bu' and not tgisinternal) then
    raise exception '0018: trigger organization_parks_guard_bu absent';
  end if;

  raise notice '0018 OK — RLS+policies 17 tables ; helpers SECDEF search_path pinné ; faille organization_parks corrigée ; org_role priorisé';
end $$;
