-- ════════════════════════════════════════════════════════════════════════════
-- 0054 — notifications : plus d'insertion « pour autrui », anon sans privilège
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. Aucune donnée réécrite, aucune table/colonne supprimée, aucune
-- migration figée modifiée. `DROP POLICY` uniquement pour recréer immédiatement la
-- policy corrigée sous le MÊME nom (même méthode que 0026 / 0027 / 0051).
-- (Reprise de `0035_notifications_insert_hardening` de la branche feature/v1-hardening,
-- jamais mergée ; renumérotée 0054 car 0035-0053 sont déjà prises/appliquées, et
-- débarrassée des fixtures de test — voir supabase/tests/notifications_insert_hardening.test.sql.)
--
-- CAUSE
--   `notifications_insert` (0002_rls.sql) = `with check (true)` : aucune contrainte, pas même
--   `auth.uid() is not null`. `0019_v2_grants.sql` ne traite que les tables du modèle v2 :
--   `notifications` (v1) a conservé le GRANT ALL par défaut Supabase pour `anon` ET
--   `authenticated`. Un appel REST avec la seule clé publique `anon`, sans session, peut donc
--   `INSERT INTO notifications (user_id, type, title, description)` pour N'IMPORTE QUEL
--   `user_id` : spam / hameçonnage dans la boîte de réception de n'importe quel utilisateur
--   (le titre et la description sont affichés tels quels par l'application).
--   Constaté (lecture seule) sur PROD et STAGING le 15/10/2026 : policy `true`, `anon` = ALL,
--   0 ligne dans la table (jamais exploité).
--
-- CHEMINS D'ÉCRITURE LÉGITIMES (inventaire du code)
--   Aucun INSERT côté client (`packages/shared/src/api/notifications.ts` : SELECT et UPDATE
--   `read` seulement), aucune fonction SQL n'insère dans `notifications` (vérifié en base).
--   Resserrer l'INSERT ne casse donc aucun flux existant.
--
-- CORRECTION
--   1. RLS : `notifications_insert` exige `user_id = auth.uid()` (un utilisateur ne peut créer
--      une notification que pour lui-même ; `anon`, dont auth.uid() est NULL, en est exclu).
--   2. GRANT (2ᵉ ligne de défense, même principe que 0019) : REVOKE ALL pour `anon` et
--      `authenticated`, puis re-GRANT du strict nécessaire — `anon` : rien (donnée privée) ;
--      `authenticated` : SELECT + INSERT + UPDATE (ni DELETE ni TRUNCATE/TRIGGER/REFERENCES :
--      aucun flux ne les utilise). `service_role` et `postgres` ne sont pas touchés.
--
-- HORS PÉRIMÈTRE (constaté, non modifié) : `group_members` / `groups` — écritures `true` pour
-- anon, choix produit documenté (code de partage de 5 caractères, donnée de faible sensibilité).
--
-- ROLLBACK (réouvre la faille — à n'utiliser qu'en cas de panne bloquante) :
--   drop policy notifications_insert on public.notifications;
--   create policy notifications_insert on public.notifications for insert with check (true);
--   grant all on public.notifications to anon, authenticated;
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

-- ── 1. RLS ──────────────────────────────────────────────────────────────────
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert
  with check (user_id = auth.uid());

-- ── 2. GRANT (2ᵉ ligne de défense) ──────────────────────────────────────────
revoke all on public.notifications from anon, authenticated;
grant select, insert, update on public.notifications to authenticated;

-- ── Assertions structurelles ────────────────────────────────────────────────
do $$
declare ins text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass) then
    raise exception '0054 FAIL — RLS désactivée sur public.notifications';
  end if;

  select with_check into ins from pg_policies
   where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_insert';
  if ins is null or ins !~ 'user_id = auth\.uid\(\)' then
    raise exception '0054 FAIL — notifications_insert ne borne pas user_id = auth.uid() : %', ins;
  end if;

  if has_table_privilege('anon', 'public.notifications', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception '0054 FAIL — anon conserve un privilège sur notifications';
  end if;

  if not has_table_privilege('authenticated', 'public.notifications', 'SELECT')
     or not has_table_privilege('authenticated', 'public.notifications', 'INSERT')
     or not has_table_privilege('authenticated', 'public.notifications', 'UPDATE') then
    raise exception '0054 FAIL — authenticated doit garder SELECT + INSERT + UPDATE';
  end if;
  if has_table_privilege('authenticated', 'public.notifications', 'DELETE')
     or has_table_privilege('authenticated', 'public.notifications', 'TRUNCATE') then
    raise exception '0054 FAIL — authenticated ne doit avoir ni DELETE ni TRUNCATE sur notifications';
  end if;

  raise notice '0054 OK — notifications : auto-insertion seule autorisée, anon sans privilège';
end $$;
