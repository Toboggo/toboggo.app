-- ════════════════════════════════════════════════════════════════════════════
-- 0014 — `reports` : évolution ADDITIVE vers le modèle v2
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF — colonnes V1 conservées : reason, equipment, comment, photo,
-- status, resolution_note, resolution_photo, resolution_days, resolved_at.
-- Table VIDE (count = 0).
--
-- Mapping (documenté) :
--   reason   -> category   (report_reason et report_category ont les MÊMES
--                           libellés -> cast direct ::text::report_category)
--   equipment -> equipment_label
--   comment   -> description
--   status    : V1 (open/resolved/dismissed) est un sous-ensemble de v2
--               (+ 'in_progress' ajouté en 0007) -> aucune conversion
--   severity, zone_id, equipment_id, resolved_by : nouveaux, NULL / défaut
--
-- Coexistence : `reason` (V1) est NOT NULL, `category` (v2) reçoit aussi
-- NOT NULL. Le trigger `reports_v1_compat` est BIDIRECTIONNEL (reason<->category,
-- equipment<->equipment_label, comment<->description) -> INSERT V1 ET INSERT V2
-- fonctionnent. Retiré au futur 0020.
-- ════════════════════════════════════════════════════════════════════════════

alter table reports add column if not exists category        report_category;
alter table reports add column if not exists severity        report_severity not null default 'medium';
alter table reports add column if not exists equipment_label text;
alter table reports add column if not exists description     text;
alter table reports add column if not exists zone_id         uuid references park_zones(id) on delete set null;
alter table reports add column if not exists equipment_id    uuid references park_equipment(id) on delete set null;
alter table reports add column if not exists resolved_by     uuid references auth.users(id) on delete set null;

-- ── Backfill (no-op sur table vide) ──────────────────────────────────
update reports set category        = reason::text::report_category where category is null and reason is not null;
update reports set equipment_label = equipment                     where equipment_label is null and equipment is not null;
update reports set description     = comment                       where description is null and comment is not null;

-- ── category NOT NULL : cible v2. Le trigger `reports_v1_compat` (défini
-- plus bas) rend `category` toujours renseignée dès que `reason` OU `category`
-- l'est -> INSERT V1 et INSERT V2 fonctionnent -> on conserve la contrainte.
do $$
declare c_null int;
begin
  select count(*) into c_null from reports where category is null and reason is null;
  if c_null = 0 then
    update reports set category = reason::text::report_category
      where category is null and reason is not null;
    execute 'alter table reports alter column category set not null';
  else
    raise notice '0014: % reports sans category NI reason -> NOT NULL non appliqué', c_null;
  end if;
end $$;

-- ── Trigger de compat V1 <-> v2 (coexistence, bidirectionnel) ──────
-- INSERT : category (v2) canonique ; à défaut dérivée de reason (v1).
--          equipment <-> equipment_label, comment <-> description (comblement).
-- UPDATE : la colonne explicitement modifiée gagne et synchronise son
--          équivalent (IS DISTINCT FROM). Aucune boucle (BEFORE, NEW only).
create or replace function reports_v1_compat() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.category := coalesce(new.category, new.reason::text::report_category);
    new.reason   := new.category::text::report_reason;   -- v2 canonique

    new.equipment_label := coalesce(new.equipment_label, new.equipment);
    new.equipment       := coalesce(new.equipment, new.equipment_label);

    new.description := coalesce(new.description, new.comment);
    new.comment     := coalesce(new.comment, new.description);
  else
    if new.category is distinct from old.category then
      new.reason := new.category::text::report_reason;
    elsif new.reason is distinct from old.reason then
      new.category := new.reason::text::report_category;
    end if;

    if new.equipment_label is distinct from old.equipment_label then
      new.equipment := new.equipment_label;
    elsif new.equipment is distinct from old.equipment then
      new.equipment_label := new.equipment;
    end if;

    if new.description is distinct from old.description then
      new.comment := new.description;
    elsif new.comment is distinct from old.comment then
      new.description := new.comment;
    end if;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists reports_v1_compat_biu on reports;
create trigger reports_v1_compat_biu
  before insert or update on reports
  for each row execute function reports_v1_compat();

-- ── Assertions ─────────────────────────────────────────────────────────
do $$
declare c_total int; c_bad int;
begin
  select count(*) into c_total from reports;

  select count(*) into c_bad from reports
   where (reason is not null and category::text is distinct from reason::text)
      or (equipment is not null and equipment_label is distinct from equipment)
      or (comment is not null and description is distinct from comment);
  if c_bad > 0 then
    raise exception '0014: % reports avec category/equipment_label/description incohérents vs V1', c_bad;
  end if;

  -- report_status doit exposer in_progress (posé en 0007)
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'report_status' and e.enumlabel = 'in_progress'
  ) then
    raise exception '0014: report_status.in_progress absent (0007 non appliqué ?)';
  end if;

  raise notice '0014 OK — reports étendu v2 (% ligne(s)), colonnes V1 conservées', c_total;
end $$;
