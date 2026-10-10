# Runbook — migration 0045 (confirmation communautaire des signalements)

Procédure **manuelle unique** (SQL Editor du dashboard Supabase), comme `docs/runbook-app-feedback-0044.md`.
Aucune commande CLI vers la production (`CLAUDE.md` §4 : pas de `db push --linked`, pas de `migration repair`).
SQL : `supabase/manual/0045_apply_in_transaction.sql` (généré depuis `supabase/migrations/0045_report_confirmations.sql`).

## Compatibilité (client actuellement en production)
Migration **purement additive** : une table `report_confirmations`, deux fonctions
(`park_active_reports`, `respond_to_report`) et des policies. `reports` n'est ni modifiée ni lue différemment :
l'ancien front (alerte « Un problème a été signalé… » + lien « Signaler un problème ») continue de fonctionner
avant, pendant et après. → **Ordre : 0045 d'abord, merge/déploiement du front ensuite.**
Sans 0045, le nouveau front retombe sur l'ancienne alerte (la RPC échoue ⇒ liste vide ⇒ repli).

## 0. Vérifier le projet cible
*Project Settings → General* : Reference ID = **production** (pas « Toboggo Staging »). Recommandé : Staging d'abord.

## 1. Contrôles AVANT (lecture seule)
```sql
select version, name from supabase_migrations.schema_migrations where version >= '0043' order by 1;  -- 0043, 0044
select to_regclass('public.report_confirmations') as tbl,
       (select count(*) from pg_proc where proname in ('park_active_reports','respond_to_report')) as fns;  -- null / 0
select count(*) from public.reports;  -- à retrouver identique après
```

## 2. Appliquer ET enregistrer
Coller **l'intégralité** de `supabase/manual/0045_apply_in_transaction.sql` → *Run* (un seul `BEGIN … COMMIT`,
garde-fous de prérequis, enregistrement `('0045','report_confirmations')`). Rejouable sans effet.
Contrôle : `supabase migration list --linked` (lecture seule) doit montrer 0045 en local ET à distance.

## 3. Contrôles APRÈS (lecture seule)
```sql
select count(*) from public.reports;                                                        -- = valeur de 1.
select count(*) from public.report_confirmations;                                           -- 0
select has_table_privilege('anon', 'public.report_confirmations', 'select')                 as anon_select,      -- false
       has_table_privilege('authenticated', 'public.report_confirmations', 'insert')        as auth_insert,      -- false
       has_function_privilege('anon', 'public.park_active_reports(uuid)', 'execute')        as anon_read_rpc,    -- true
       has_function_privilege('anon', 'public.respond_to_report(uuid,text)', 'execute')     as anon_vote_rpc,    -- false une fois 0048 appliquée (avant : true, GRANT par défaut de Supabase, sans effet car la fonction rejette auth.uid() null)
       has_function_privilege('authenticated', 'public.respond_to_report(uuid,text)', 'execute') as auth_vote_rpc; -- true
select polname from pg_policy where polrelid = 'public.report_confirmations'::regclass;     -- report_confirmations_select seul
```
Test complet (transaction + ROLLBACK, **local/Staging uniquement**, jamais prod) : `supabase/tests/report_confirmations.test.sql`.

## 4. Après le merge
`supabase gen types typescript --linked` (lecture seule) : le bloc `report_confirmations` et les deux fonctions de
`packages/shared/src/types/database.types.ts` (ajoutés à la main dans la PR) doivent être identiques.

## 5. Durcissement 0048 (anon ne peut plus exécuter `respond_to_report`)
`supabase/migrations/0048_respond_to_report_revoke_anon.sql` (un seul `REVOKE`, idempotent). Le REVOKE a déjà été
exécuté en production ; coller `supabase/manual/0048_apply_in_transaction.sql` dans le SQL Editor pour
**enregistrer** `('0048','respond_to_report_revoke_anon')` dans `schema_migrations` (rejouable sans effet).
Contrôle : `has_function_privilege('anon','public.respond_to_report(uuid,text)','execute')` = false,
`authenticated` = true, `park_active_reports` reste exécutable par anon.
