-- ════════════════════════════════════════════════════════════════════════════
-- 0038 — Suppression de compte fiable (`delete_own_account` + `audit_row`)
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. `CREATE OR REPLACE FUNCTION` + GRANT/REVOKE uniquement :
-- aucune table, colonne, FK, policy ni trigger modifié ; aucun log supprimé.
--
-- NUMÉROTATION : main s'arrête à 0034 ; 0035/0036 sont déjà pris par deux
-- branches non mergées (feature/v1-hardening, fix/nearby-parks-performance) et
-- 0037 par feature/admin-foundation. 0038 = premier numéro libre partout.
--
-- BUG CORRIGÉ
-- `delete_own_account()` faisait `delete from auth.users where id = auth.uid()`.
-- Les FK `reports.user_id/resolved_by` et `park_edits.user_id/reviewed_by`
-- (ON DELETE SET NULL) provoquent alors un UPDATE de ces lignes, qui déclenche
-- `reports_audit` / `park_edits_audit` → `audit_row()` insère une NOUVELLE
-- ligne `audit_log` avec `actor_id = auth.uid()`, c.-à-d. l'utilisateur en
-- cours de suppression. `audit_log.actor_id` est déjà `ON DELETE SET NULL`
-- (0015), mais ce SET NULL ne s'applique qu'aux lignes existantes : la
-- nouvelle ligne viole `audit_log_actor_id_fkey` (23503) et toute la
-- transaction est annulée. Touchait tout utilisateur ayant signalé / proposé
-- une modification, et tout modérateur ayant traité un signalement / une
-- proposition. L'UI avalait l'erreur (corrigé côté app en parallèle).
--
-- CORRECTIF
-- 1. `audit_row()` : si `auth.uid()` ne correspond plus à aucun `auth.users`
--    (suppression en cours dans la même transaction), `actor_id := NULL` —
--    exactement l'état final que le SET NULL de 0015 visait. Un utilisateur
--    vivant est audité comme avant (`actor_id = uid`, `source = 'app'`).
--    `source` lit en plus le réglage transactionnel `toboggo.audit_source`,
--    restreint à une liste blanche ('account_deletion') ; défaut 'app'.
-- 2. `delete_own_account()` : search_path vide, refus explicite si non
--    authentifié (42501), anonymisation de `reports.reported_by_name` avant le
--    DELETE (colonne V1 NOT NULL → '' ; décision produit : pas de libellé
--    artificiel), erreur si aucun compte supprimé (P0002), source d'audit
--    'account_deletion' pendant l'opération. Aucun argument : impossible de
--    viser un autre compte.
-- 3. EXECUTE retiré à PUBLIC et `anon` (hérité des privilèges par défaut
--    Supabase) ; accordé à `authenticated` seul (seul rôle avec un auth.uid()).
--
-- Contrat de données inchangé (décisions produit 23/09/2026) : avis, profil,
-- enfants, notifications, groupes supprimés (CASCADE) ; parcs, photos,
-- signalements, park_edits conservés anonymisés (SET NULL) ; audit conservé
-- (actor_id → NULL). HORS PÉRIMÈTRE : team_members, Storage, contenu JSON
-- old_value/new_value de audit_log, PostHog.
--
-- Tests comportementaux (fixtures auth.users, rollback) :
-- supabase/tests/account_deletion.test.sql — base LOCALE uniquement.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. audit_row() ─────────────────────────────────────────────────────────
-- Les triggers (parks_audit_*, park_equipment_audit, reports_audit,
-- organizations_audit, park_edits_audit) référencent la fonction par son nom :
-- `create or replace` suffit.
create or replace function public.audit_row() returns trigger as $$
declare
  actor uuid := auth.uid();
  src   text := current_setting('toboggo.audit_source', true);
begin
  -- Acteur en cours de suppression (cascade ON DELETE SET NULL depuis
  -- auth.users) : la FK audit_log.actor_id refuserait la ligne → NULL.
  if actor is not null
     and not exists (select 1 from auth.users u where u.id = actor) then
    actor := null;
  end if;

  -- Liste blanche : toute autre valeur (non posée, '' après fin de
  -- transaction, valeur inattendue) retombe sur le défaut historique.
  if src is distinct from 'account_deletion' then
    src := 'app';
  end if;

  if tg_op = 'INSERT' then
    insert into audit_log (entity_type, entity_id, action, new_value, actor_id, source)
    values (tg_table_name, new.id, 'insert', to_jsonb(new), actor, src);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (entity_type, entity_id, action, old_value, new_value, actor_id, source)
    values (tg_table_name, new.id, 'update', to_jsonb(old), to_jsonb(new), actor, src);
    return new;
  else
    insert into audit_log (entity_type, entity_id, action, old_value, actor_id, source)
    values (tg_table_name, old.id, 'delete', to_jsonb(old), actor, src);
    return old;
  end if;
end $$ language plpgsql security definer set search_path = public, pg_temp;

-- ── 2. delete_own_account() ────────────────────────────────────────────────
create or replace function public.delete_own_account() returns void as $$
declare
  uid     uuid := auth.uid();
  deleted int;
begin
  if uid is null then
    raise exception 'delete_own_account: not authenticated'
      using errcode = '42501';
  end if;

  -- Transaction-local : s'applique aux lignes d'audit générées par
  -- l'anonymisation ci-dessous et par les cascades du DELETE.
  perform set_config('toboggo.audit_source', 'account_deletion', true);

  -- Signalements conservés mais anonymisés. `reported_by_name` est une
  -- colonne V1 NOT NULL : '' plutôt qu'un libellé artificiel. `user_id`
  -- passe à NULL via la FK au DELETE ci-dessous.
  update public.reports
     set reported_by_name = ''
   where user_id = uid
     and reported_by_name <> '';

  delete from auth.users where id = uid;
  get diagnostics deleted = row_count;
  if deleted <> 1 then
    raise exception 'delete_own_account: account not found'
      using errcode = 'P0002';
  end if;

  -- Les cascades (et leurs triggers d'audit) sont déjà exécutées à la fin du
  -- DELETE : on ne laisse pas la source fuiter dans la suite d'une
  -- transaction englobante.
  perform set_config('toboggo.audit_source', '', true);
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- ── Assertions structurelles (aucune fixture auth.users ici) ──────────────
do $$
declare
  fn_def text;
begin
  -- delete_own_account : SECURITY DEFINER + search_path figé
  if not exists (
    select 1 from pg_proc
    where oid = 'public.delete_own_account()'::regprocedure
      and prosecdef
      and proconfig @> array['search_path=""']
  ) then
    raise exception '0038: delete_own_account doit être SECURITY DEFINER avec search_path vide';
  end if;

  -- Permissions
  if has_function_privilege('anon', 'public.delete_own_account()', 'execute') then
    raise exception '0038: anon conserve EXECUTE sur delete_own_account';
  end if;
  if exists (
    select 1 from pg_proc, aclexplode(proacl) a
    where oid = 'public.delete_own_account()'::regprocedure
      and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception '0038: PUBLIC conserve EXECUTE sur delete_own_account';
  end if;
  if not has_function_privilege('authenticated', 'public.delete_own_account()', 'execute') then
    raise exception '0038: authenticated devrait avoir EXECUTE sur delete_own_account';
  end if;

  -- Appel sans auth.uid() (contexte migration) → refus explicite, rien supprimé
  begin
    perform public.delete_own_account();
    raise exception '0038 FAIL — appel non authentifié accepté';
  exception when insufficient_privilege then
    raise notice '0038 OK — appel non authentifié refusé (42501)';
  end;

  -- audit_row : garde acteur supprimé + source, toujours SECURITY DEFINER
  select pg_get_functiondef('public.audit_row()'::regprocedure) into fn_def;
  if fn_def !~ 'not exists \(select 1 from auth\.users'
     or fn_def !~ 'toboggo\.audit_source' then
    raise exception '0038: audit_row ne contient pas la garde acteur / source attendue';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.audit_row()'::regprocedure) then
    raise exception '0038: audit_row doit rester SECURITY DEFINER';
  end if;

  -- Rien d'autre n'a bougé : FK d'audit intacte (SET NULL), triggers branchés
  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_log_actor_id_fkey'
      and conrelid = 'public.audit_log'::regclass
      and confrelid = 'auth.users'::regclass
      and confdeltype = 'n'
  ) then
    raise exception '0038: audit_log_actor_id_fkey absente ou modifiée';
  end if;
  if (select count(*) from pg_trigger
      where tgname in ('reports_audit', 'park_edits_audit')
        and tgfoid = 'public.audit_row()'::regprocedure) <> 2 then
    raise exception '0038: reports_audit / park_edits_audit ne pointent plus sur audit_row';
  end if;

  raise notice '0038 OK — delete_own_account durcie (auth requise, search_path vide, anon/PUBLIC révoqués) ; audit_row tolère un acteur supprimé ; FK et triggers d''audit inchangés';
end $$;
