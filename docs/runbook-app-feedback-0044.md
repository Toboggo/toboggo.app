# Runbook — migration 0044 (historique des avis sur l'app Toboggo)

Procédure **manuelle unique** (SQL Editor du dashboard Supabase). Aucune commande CLI vers la
production, conformément à `CLAUDE.md` §4 (pas de `db push --linked`, pas de `migration repair`).
SQL à exécuter : `supabase/migrations/0044_app_feedback_history.sql` (**un seul fichier**, idempotent,
non destructif, **rétrocompatible**).

## Pourquoi c'est compatible avec les anciens clients (même ouverts pendant des semaines)
`app_feedback` **garde `UNIQUE(user_id)`** et représente l'avis **courant**. L'ancien client fait
`upsert(onConflict: "user_id")` = INSERT … ON CONFLICT (user_id) DO UPDATE : cela continue de marcher
avant, pendant et après la migration. Pour lui, enregistrer = créer ou **modifier** l'avis courant
(date de création conservée, `edited_at` posé, délai de 30 j non redémarré). Il ne touche jamais
`app_feedback_history` (aucun droit d'écriture dessus) : il ne peut donc détruire aucun historique.
Le nouveau front utilise la RPC `give_app_feedback` pour « Donner un nouvel avis » (archive l'avis
courant dans `app_feedback_history` puis crée le nouveau, transaction + verrou par utilisateur,
délai de 30 j depuis la **création** du courant). La RPC verrouille la ligne courante (`SELECT … FOR UPDATE`) : une modification concurrente d'un ancien client (UPDATE / upsert) n'est jamais perdue entre la lecture, l'archivage et le remplacement (test : `supabase/tests/app_feedback_concurrency.sh`, local/Staging).

→ **Ordre : 0044 d'abord, merge/déploiement du front ensuite.** Aucune seconde migration.

## 0. Vérifier le projet cible
Dashboard → *Project Settings → General* : le **Reference ID** doit être celui du projet de
**production** (voir `docs/architecture/database-migration.md`), pas « Toboggo Staging ».
Recommandé : appliquer et contrôler d'abord sur **Staging**, puis sur la prod.

## 1. Contrôles AVANT (lecture seule) — notez les résultats
```sql
-- 1a. migrations enregistrées : dernière attendue = 0043 (0040 absente : normal)
select version, name from supabase_migrations.schema_migrations where version >= '0036' order by 1;
-- 1b. 0044 NON encore appliquée : 0 / null / 0
select to_regclass('public.app_feedback_history') as history_table,
       (select count(*) from pg_proc where proname = 'give_app_feedback') as rpc;
-- 1c. prérequis 0039 : table, contrainte unique, helper admin
select conname from pg_constraint where conrelid = 'public.app_feedback'::regclass order by 1;   -- contient app_feedback_user_id_key
select proname from pg_proc where proname in ('app_feedback_guard', 'is_toboggo_admin');          -- 2 lignes
-- 1d. volumétrie à retrouver identique après
select count(*) as avis, count(distinct user_id) as auteurs,
       round(avg(rating)::numeric, 2) as moyenne, min(created_at) as premier, max(created_at) as dernier
  from public.app_feedback;
```

## 2. Appliquer ET enregistrer — un seul bloc, en transaction
Coller **l'intégralité** de `supabase/manual/0044_apply_in_transaction.sql` dans le SQL Editor → *Run*.
Ce fichier (généré à partir de la migration) fait, dans **un seul `BEGIN … COMMIT`** : garde-fous de prérequis
(0039 présente, `UNIQUE(user_id)`, `is_toboggo_admin`) → migration 0044 → insertion de `('0044','app_feedback_history')`
dans `supabase_migrations.schema_migrations`. Si une instruction échoue : **rien n'est appliqué et rien n'est
enregistré** (testé : échec simulé, mauvais projet simulé). Rejouable sans effet (idempotent).
L'enregistrement évite la réapplication par le CLI. Pas de `supabase migration repair` (interdit sur la prod).

Contrôle immédiat : `select version, name from supabase_migrations.schema_migrations where version >= '0043' order by 1;`
→ `0043` puis `0044 | app_feedback_history`. Ensuite, en lecture seule depuis un poste de dev :
`supabase migration list --linked` doit montrer 0044 présente en local ET à distance.

## 4. Contrôles APRÈS (lecture seule)
```sql
-- 4a. données intactes (mêmes chiffres qu'en 1d)
select count(*) as avis, count(distinct user_id) as auteurs,
       round(avg(rating)::numeric, 2) as moyenne, min(created_at) as premier, max(created_at) as dernier
  from public.app_feedback;
-- 4b. compat ancien client : UNIQUE(user_id) TOUJOURS présente, aucun trigger d'insertion
select conname from pg_constraint where conrelid = 'public.app_feedback'::regclass;                -- contient app_feedback_user_id_key
select tgname from pg_trigger where tgrelid = 'public.app_feedback'::regclass and not tgisinternal; -- app_feedback_guard seul
-- 4c. colonnes : title/body nullables, edited_at présente
select column_name, is_nullable from information_schema.columns
 where table_schema = 'public' and table_name = 'app_feedback' and column_name in ('title','body','edited_at') order by 1;
-- 4d. historique, RPC, vues
select count(*) as archives from public.app_feedback_history;                      -- 0
select proname, prosecdef from pg_proc where proname = 'give_app_feedback';        -- 1 ligne, prosecdef = true
select * from public.app_feedback_summary;                                         -- rating_count = auteurs (4a), average_rating = moyenne (4a), total_submissions = avis
select count(*) from public.app_feedback_all;                                      -- = avis (4a)
-- 4e. permissions : anon ne lit rien et ne peut pas appeler la RPC ; authenticated ne peut pas écrire l'historique
select has_table_privilege('anon', 'public.app_feedback_history', 'select')            as anon_select_history,   -- false
       has_table_privilege('anon', 'public.app_feedback_all', 'select')                as anon_select_all,       -- false
       has_function_privilege('anon', 'public.give_app_feedback(smallint,text)', 'execute')          as anon_rpc,   -- false
       has_function_privilege('authenticated', 'public.give_app_feedback(smallint,text)', 'execute') as auth_rpc,   -- true
       has_table_privilege('authenticated', 'public.app_feedback_history', 'insert')   as auth_insert_history;  -- false
select polname from pg_policy where polrelid = 'public.app_feedback_history'::regclass;  -- app_feedback_history_select seul
```
Test d'ancien client (déjà passé en local, à refaire sur Staging si disponible) : avec un compte
`zzz-test-…`, `upsert(onConflict: user_id)` doit toujours créer puis modifier l'avis. Test de non-régression
complet : `supabase/tests/app_feedback_history.test.sql` (**local/Staging uniquement**, jamais prod).

## 5. Ensuite
Confirmer ici que 0044 est appliquée, enregistrée et que 4a–4e sont conformes → merge de la PR #101
(squash) et déploiement du front ; je vérifie alors la production mobile + backoffice.

## Retour arrière (si besoin avant déploiement du front)
Rien à restaurer côté données (0044 est additive). Pour annuler : `drop view app_feedback_summary, app_feedback_all;
drop function give_app_feedback(smallint, text); drop table app_feedback_history;` (les colonnes facultatives et
`edited_at` peuvent rester ; l'ancien front n'en souffre pas). Supprimer ensuite la ligne `0044` de `schema_migrations`.
