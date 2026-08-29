-- ════════════════════════════════════════════════════════════════════════════
-- 0019 — Privilèges (GRANT + REVOKE) sur les nouveaux objets v2
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF POUR LES DONNÉES : uniquement GRANT / REVOKE de privilèges de
-- rôle. `REVOKE ... FROM` retire un DROIT — ce n'est PAS `DELETE`/`TRUNCATE`.
--
-- Pourquoi des REVOKE : Supabase applique par défaut `GRANT ALL` à
-- `anon` / `authenticated` sur toute nouvelle table de `public`
-- (auto_expose_new_tables). Pour respecter le moindre privilège, on remet à
-- plat chaque table sensible : `REVOKE ALL` puis `GRANT` du strict nécessaire.
-- La RLS (0018) reste la barrière d'autorisation ligne à ligne ; les privilèges
-- de table sont la 2e ligne de défense (et bloquent TRUNCATE, qui ignore la RLS).
--
-- Principe : anon = SELECT seul ; authenticated = SELECT + écritures filtrées
-- par RLS ; audit_log = append-only ; park_duplicate_candidates = lecture seule
-- (écritures réservées à service_role, non couvert ici).
--
-- `nearby_parks` a été DROP+CREATE en 0017 -> ses GRANT sont ré-attribués ici.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Vue publique ─────────────────────────────────────────────────────────
revoke all on park_public from anon, authenticated;
grant select on park_public to anon, authenticated;

-- ── Tables du modèle public : anon = SELECT seul ; authenticated = SELECT + CUD ──
revoke all on
  organizations, organization_parks,
  features, park_features,
  park_zones, park_entrances, park_equipment, park_opening_hours,
  park_sources, external_ids, park_names, park_attribute_sources,
  park_media, park_scores, park_edits
from anon, authenticated;

grant select on
  organizations, organization_parks,
  features, park_features,
  park_zones, park_entrances, park_equipment, park_opening_hours,
  park_sources, external_ids, park_names, park_attribute_sources,
  park_media, park_scores
to anon, authenticated;

grant insert, update, delete on
  organizations, organization_parks,
  features, park_features,
  park_zones, park_entrances, park_equipment, park_opening_hours,
  park_sources, external_ids, park_names, park_attribute_sources,
  park_media, park_scores
to authenticated;

-- park_edits : authenticated peut INSERT (contribuer) + SELECT (voir ses
-- demandes) ; l'UPDATE (validation) est possible mais borné par la RLS.
grant select, insert, update on park_edits to authenticated;

-- ── audit_log : append-only. authenticated = INSERT + SELECT, jamais UPD/DEL.
--    En pratique alimenté par le trigger SECURITY DEFINER audit_row().
revoke all on audit_log from anon, authenticated;
grant insert, select on audit_log to authenticated;

-- ── park_duplicate_candidates : lecture seule pour authenticated (RLS =
--    staff). Les écritures sont réservées à un job service_role (dédup batch).
revoke all on park_duplicate_candidates from anon, authenticated;
grant select on park_duplicate_candidates to authenticated;

-- ── Colonnes organization_id ajoutées sur des tables déjà exposées ────
-- (team_members / maintenance / activity_log : privilèges de table inchangés —
--  les nouvelles colonnes héritent du GRANT de table existant.)

-- ── Fonctions / RPC ──────────────────────────────────────────────────────
grant execute on function nearby_parks(double precision, double precision, int) to anon, authenticated;
grant execute on function find_duplicate_parks(double precision, double precision, text, int, uuid) to authenticated;
grant execute on function recalculate_park_score(uuid) to authenticated;
grant execute on function increment_park_views(uuid) to anon, authenticated;
grant execute on function fstatus(uuid, text) to anon, authenticated;
grant execute on function fvalue(uuid, text) to anon, authenticated;

-- ── Assertions ─────────────────────────────────────────────────────────
do $$
declare c_missing int; c_anon_write int;
begin
  -- park_public lisible par anon
  if not has_table_privilege('anon', 'public.park_public', 'SELECT') then
    raise exception '0019: anon ne peut pas SELECT park_public';
  end if;

  -- anon lit les tables du modèle public
  select count(*) into c_missing
  from (values ('features'),('park_features'),('park_media'),('organization_parks'),
               ('park_names'),('park_scores')) v(t)
  where not has_table_privilege('anon', 'public.'||v.t, 'SELECT');
  if c_missing > 0 then
    raise exception '0019: % table(s) publiques non lisibles par anon', c_missing;
  end if;

  -- anon N'A AUCUN privilège d'écriture (INS/UPD/DEL) sur les tables v2
  select count(*) into c_anon_write
  from (values
    ('organizations'),('organization_parks'),('features'),('park_features'),
    ('park_zones'),('park_entrances'),('park_equipment'),('park_opening_hours'),
    ('park_sources'),('external_ids'),('park_names'),('park_attribute_sources'),
    ('park_media'),('park_scores'),('park_edits'),('audit_log'),
    ('park_duplicate_candidates')
  ) v(t)
  where has_table_privilege('anon', 'public.'||v.t, 'INSERT')
     or has_table_privilege('anon', 'public.'||v.t, 'UPDATE')
     or has_table_privilege('anon', 'public.'||v.t, 'DELETE');
  if c_anon_write > 0 then
    raise exception '0019: anon conserve un privilège d''écriture sur % table(s) v2', c_anon_write;
  end if;

  -- nearby_parks exécutable par anon (grant ré-attribué après DROP)
  if not has_function_privilege('anon',
       'public.nearby_parks(double precision, double precision, int)', 'EXECUTE') then
    raise exception '0019: anon ne peut pas EXECUTE nearby_parks (grant non ré-attribué)';
  end if;

  -- audit_log : authenticated = INSERT + SELECT uniquement (append-only)
  if has_table_privilege('authenticated', 'public.audit_log', 'UPDATE')
     or has_table_privilege('authenticated', 'public.audit_log', 'DELETE') then
    raise exception '0019: authenticated a UPDATE/DELETE sur audit_log (doit être append-only)';
  end if;
  if not (has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
          and has_table_privilege('authenticated', 'public.audit_log', 'SELECT')) then
    raise exception '0019: authenticated devrait avoir INSERT+SELECT sur audit_log';
  end if;

  -- park_duplicate_candidates : authenticated = SELECT seulement (RLS = staff)
  if has_table_privilege('authenticated', 'public.park_duplicate_candidates', 'INSERT')
     or has_table_privilege('authenticated', 'public.park_duplicate_candidates', 'UPDATE')
     or has_table_privilege('authenticated', 'public.park_duplicate_candidates', 'DELETE') then
    raise exception '0019: authenticated a une écriture sur park_duplicate_candidates (réservé service_role)';
  end if;

  raise notice '0019 OK — anon = lecture seule ; audit_log append-only ; park_duplicate_candidates lecture seule ; nearby_parks ré-exposée';
end $$;
