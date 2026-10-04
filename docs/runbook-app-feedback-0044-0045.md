# Runbook — migrations 0044 / 0045 (historique des avis sur l'app Toboggo)

Application **manuelle** (SQL Editor du dashboard Supabase) — aucune commande CLI vers la
production, conformément à `CLAUDE.md` §4. Les fichiers SQL font foi :
`supabase/migrations/0044_app_feedback_history.sql` et `0045_app_feedback_multiple.sql`.

Stratégie en deux phases (compatibilité avec le front de production actuel, qui enregistre
l'avis par `upsert(onConflict: "user_id")`) :

| Phase | Quand | Contenu | Ancien front | Nouveau front |
|---|---|---|---|---|
| **0044** | AVANT le merge / déploiement | colonnes facultatives, `edited_at`, policy « dernier avis », vues. **Garde `UNIQUE(user_id)`**, pas de trigger d'insert | ✅ inchangé (testé) | ✅ 1er avis, lecture, modification, note globale. ⚠️ « nouvel avis » refusé (unicité) tant que 0045 n'est pas passée |
| **0045** | APRÈS le déploiement du nouveau front | retire `UNIQUE(user_id)`, ajoute le délai de 30 j (trigger + verrou) | ❌ l'enregistrement échoue (message générique, rien de corrompu) | ✅ tout |

## 0. Vérifier le projet cible (avant tout)
1. Dashboard → *Project Settings → General* : le **Reference ID** doit être celui du projet de
   **production** (voir `docs/architecture/database-migration.md`), **pas** « Toboggo Staging ».
2. Idéalement, appliquer d'abord 0044 puis 0045 sur **Staging**, rejouer les contrôles, puis la prod.

## 1. Avant 0044 (lecture seule)
```sql
-- migrations enregistrées (attendu : jusqu'à 0043 ; 0040 absente = normal)
select version, name from supabase_migrations.schema_migrations where version >= '0036' order by 1;
-- prérequis : table 0039 présente, contrainte unique encore là, pas d'edited_at
select to_regclass('public.app_feedback') as tbl;
select conname from pg_constraint where conrelid = 'public.app_feedback'::regclass order by 1;
select column_name, is_nullable from information_schema.columns
 where table_schema='public' and table_name='app_feedback' order by ordinal_position;
select count(*) as avis, count(distinct user_id) as auteurs from public.app_feedback;  -- notez ces 2 chiffres
select proname from pg_proc where proname in ('app_feedback_guard','is_toboggo_admin');   -- 2 lignes
```

## 2. Appliquer 0044
Copier-coller **tout** `supabase/migrations/0044_app_feedback_history.sql` (idempotent) → Run.

## 3. Après 0044 (contrôle)
```sql
select count(*) as avis, count(distinct user_id) as auteurs from public.app_feedback;  -- identique à l'avant
select conname from pg_constraint where conrelid='public.app_feedback'::regclass;       -- app_feedback_user_id_key PRÉSENTE
select column_name, is_nullable from information_schema.columns
 where table_schema='public' and table_name='app_feedback' and column_name in ('title','body','edited_at'); -- title/body YES, edited_at présent
select tgname from pg_trigger where tgrelid='public.app_feedback'::regclass and not tgisinternal;  -- app_feedback_guard seul (PAS de before_insert)
select polname from pg_policy where polrelid='public.app_feedback'::regclass;           -- select/insert/update
select * from public.app_feedback_summary;                                              -- 1 ligne ; rating_count = auteurs
select has_table_privilege('anon','public.app_feedback_summary','select');              -- false
```
Test d'ancien client déjà fait en local (upsert création + modification OK après 0044).
Optionnel (à votre appréciation) : enregistrer la migration dans l'historique CLI :
`insert into supabase_migrations.schema_migrations(version, name) values ('0044','app_feedback_history');`

## 4. Merge de la PR #101 et déploiement du front (Vercel App + Admin) — voir la PR

## 5. Avant 0045
Vérifier que le nouveau front est en production (la ligne du profil indique « Évaluer Toboggo » /
« Mon avis sur Toboggo », plus de champ Titre), puis :
```sql
select count(*) as avis, count(distinct user_id) as auteurs from public.app_feedback;
```

## 6. Appliquer 0045
Copier-coller **tout** `supabase/migrations/0045_app_feedback_multiple.sql` → Run.

## 7. Après 0045 (contrôle)
```sql
select count(*) as avis, count(distinct user_id) as auteurs from public.app_feedback;  -- identique
select conname from pg_constraint where conrelid='public.app_feedback'::regclass;       -- plus de app_feedback_user_id_key
select tgname from pg_trigger where tgrelid='public.app_feedback'::regclass and not tgisinternal;  -- guard + before_insert
```
Puis parcours réel avec un compte de test : créer un avis → un 2ᵉ envoi immédiat est refusé
(« Vous pourrez donner un nouvel avis le … ») ; modifier le dernier avis → OK.
Optionnel : `insert into supabase_migrations.schema_migrations(version, name) values ('0045','app_feedback_multiple');`

## Retour arrière
0044 est additive (rien à défaire). 0045 : `alter table public.app_feedback add constraint
app_feedback_user_id_key unique (user_id);` n'est possible que tant qu'aucun utilisateur n'a 2 avis.
