-- ════════════════════════════════════════════════════════════════════════════
-- 0015 — `audit_log` générique (§14)
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF — `park_edit_history` (V1) est CONSERVÉE (0 ligne).
-- Backfill park_edit_history -> audit_log : no-op (table source vide).
--
-- Mapping documenté si des lignes existaient :
--   entity_type = 'park' ; entity_id = park_id ; action = action
--   field       = note   (V1 stocke une note libre, pas un nom de champ)
--   old_value / new_value = NULL (V1 ne stocke pas le diff)
--   actor_id    = NULL   (V1 `actor` est un TEXTE, ex. "Ville de Lyon" —
--                          non convertible en uuid ; conservé dans `source`)
--   source      = 'park_edit_history:' || actor
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  field text,
  old_value jsonb,
  new_value jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  source text not null default 'app',
  created_at timestamptz not null default now()
);
create index if not exists audit_log_entity_idx  on audit_log (entity_type, entity_id);
create index if not exists audit_log_actor_idx   on audit_log (actor_id);
create index if not exists audit_log_created_idx on audit_log (created_at desc);

-- ── Backfill park_edit_history -> audit_log (0 ligne attendue) ─────────
insert into audit_log (entity_type, entity_id, action, field, source, created_at)
select 'park', peh.park_id, peh.action, peh.note,
       'park_edit_history:' || coalesce(peh.actor, 'inconnu'),
       peh.created_at
from park_edit_history peh
where not exists (
  select 1 from audit_log a
  where a.entity_type = 'park' and a.entity_id = peh.park_id
    and a.action = peh.action and a.created_at = peh.created_at
    and a.source = 'park_edit_history:' || coalesce(peh.actor, 'inconnu')
);

-- ── Assertions ─────────────────────────────────────────────────────────
do $$
declare c_src int; c_migrated int;
begin
  if to_regclass('public.audit_log') is null then
    raise exception '0015: table audit_log absente';
  end if;

  select count(*) into c_src from park_edit_history;
  select count(*) into c_migrated from audit_log where source like 'park_edit_history:%';
  if c_migrated < c_src then
    raise exception '0015: % lignes audit_log migrées < % lignes park_edit_history', c_migrated, c_src;
  end if;

  raise notice '0015 OK — audit_log créé ; % lignes park_edit_history -> % lignes audit_log (perte connue: actor texte)',
    c_src, c_migrated;
end $$;
