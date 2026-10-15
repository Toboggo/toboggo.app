# Durcissement 0054 (notifications) et 0055 (garde-fou de modération des parcs)

> Préparé le 2026-10-15. **Rien n'est appliqué sur STAGING ni PROD.** Reprend `0035`/`0036` de la branche
> `feature/v1-hardening` (jamais mergées), renumérotées car PROD et STAGING sont à **0053**.
> Application = autorisation explicite du fondateur, **jamais `supabase db push`** (historique 0035/0036/0040 absent des deux bases).

## 1. Les deux failles (vérifiées en lecture seule sur PROD et STAGING, identiques)

| | Faille | Cause | Exploitabilité | Exploitée ? |
|---|---|---|---|---|
| **A** | N'importe qui, **sans session** (clé publique `anon`), peut écrire une notification dans la boîte de n'importe quel utilisateur | `notifications_insert` = `WITH CHECK (true)` + GRANT ALL à `anon` (0019 n'a traité que les tables v2) | Directe via REST. Titre/description affichés tels quels → spam / hameçonnage | Non : 0 ligne en table |
| **B** | Tout compte connecté peut **créer un parc déjà publié**, et le créateur / un contributeur / un support d'une organisation peut publier, bloquer ou rejeter un parc | `parks_insert` = `auth.uid() IS NOT NULL` sans contrainte de statut ; `parks_update` sans restriction de colonne ; aucun trigger | Directe via REST (INSERT `moderation_status='published'`). Pollution du catalogue public, contournement de la modération | Non : 0 parc non-`pending` créé par un utilisateur |

Fonctions SQL qui écrivent dans `notifications` : aucune. Code client : lecture + `UPDATE read` seulement → 0054 ne casse rien.
Fonctions qui modifient le statut d'un parc : seulement `recompute_*` (SECURITY DEFINER, donc hors garde-fou).

## 2. Ce qui change par rapport aux migrations d'origine
- **0054** = `0035` : policy `user_id = auth.uid()` + REVOKE ALL puis GRANT minimal. Les fixtures `auth.users` embarquées dans la migration ont été **retirées** (elles écrivaient dans `auth.users` en production) ; les tests comportementaux sont dans `supabase/tests/notifications_insert_hardening.test.sql`.
- **0055** = `0036` **corrigée**. 0036 n'autorisait la création publiée par un gestionnaire que via `parks.commune_id`. Or le back-office actuel (ParkNew, ParkModal, import CSV) ne renseigne plus `commune_id` : le lien se fait *après* l'INSERT via `organization_parks`. Posée telle quelle, 0036 aurait **empêché tout gestionnaire de créer un parc publié**.
  → Correctif front dans la même PR (`createPark`, `packages/shared/src/api/parks.ts`) : INSERT en `pending`, lien organisation, **puis** UPDATE du statut (autorisé pour un gestionnaire). Compatible avec et sans le trigger.
- Trigger sans effet pour `postgres` (SQL Editor, `supabase db query`, import OSM, publication NY par lots) et `service_role`.

## 3. Tests exécutés (base LOCALE jetable `hard_0054`, clone de la base locale ramené à l'état PROD 0053 ; aucune écriture PROD/STAGING)
| Suite | Avant | Après |
|---|---|---|
| `notifications_insert_hardening.test.sql` | scénario 2 **échoue** (insertion pour autrui acceptée) | **11/11** |
| `parks_moderation_guard.test.sql` (20 scénarios : créateur, gestionnaire V1/V2, contributeur, support, autre org, staff, postgres, service_role, deux temps) | scénario 2 **échoue** (création publiée acceptée) | **20/20** |
| 14 suites existantes (`account_deletion`, `review_park_edit`, `rls_organization_scope` 69, `team_members_tenant_isolation`, `activity_log_tenant_integrity`, `audit_log_integrity`, `park_media_moderation`, `children`, `app_feedback*`, `report_confirmations`, `park_attribute_provenance`) | — | OK, 0 régression |
| `nearby_parks_definer` | — | échec S2 **identique à main** (artefact connu du test, cf. PR #182) |
| Idempotence (2 applications de 0054 et 0055) | — | OK |
| Vitest `parks.test.ts` | 76 | **82** (6 tests deux temps) ; suite complète 1819 OK / 2 échecs **présents aussi sur `origin/main`** (`MapExplore.zeroResults`, `ParkCover`) |
| `npm run typecheck` | — | 0 erreur |

## 4. Ordre de déploiement (le front AVANT la migration 0055)
1. Merge de la PR + déploiement Vercel des apps (le deux temps fonctionne sans trigger).
2. STAGING : 0054, tests, 0055, tests (§5).
3. PROD : 0054 puis 0055 (§6). 0054 est indépendante du front et peut passer en premier.

## 5. Plan STAGING (`hfuaouskwysqxiwpwvqy`) — autorisation requise
Pré-contrôles (lecture seule) : `select max(version) from supabase_migrations.schema_migrations` = `0053` ; policy `notifications_insert` encore `true` ; aucun trigger `parks_moderation_guard_biu`.
Application : **un fichier à la fois**, dans une transaction (`psql -1` / `supabase db query --linked --project-ref hfuaouskwysqxiwpwvqy -f …` ; le fichier contient `set local lock_timeout='5s'`), sans `db push`. Les `DO $$` finaux valident la structure (échec ⇒ rollback).
Tests : `supabase/tests/notifications_insert_hardening.test.sql` puis `parks_moderation_guard.test.sql` (ROLLBACK intégré), puis suites existantes.
Parcours manuels avec comptes de test : (a) mobile « Ajouter un parc » → parc `pending` ; (b) back-office collectivité, gestionnaire : **créer un parc publié** (ParkNew, ParkModal, import CSV) → parc publié et lié à l'organisation ; (c) contributeur : création → `pending` ; (d) Admin : création publiée, modération (publier/bloquer/rejeter) ; (e) centre de notifications : lecture + « lu ».
Critère de passage : tous OK, 0 erreur console, comptages inchangés (parks, notifications, audit_log).

## 6. Plan PROD (`dfzrsygetbhnjzfssgub`) — autorisation requise, après STAGING OK
Préconditions : front déployé ; dump PROD frais (`supabase db dump --linked`, lecture seule) ; `max(version)=0053` ; fenêtre calme ; aucune publication NY ou import en cours (le trigger ne les affecte pas, mais éviter la concurrence).
1. 0054 (transaction unique). Vérifier : `anon` sans privilège sur `notifications`, policy bornée, comptage notifications = 0 inchangé.
2. 0055 (transaction unique). Vérifier : trigger présent ; test comportemental en transaction annulée.
3. Inscrire les versions dans l'historique **uniquement** par le moyen déjà utilisé pour 0051-0053 (instructions enregistrées) ; `migration repair` interdit sur PROD sans autorisation distincte.
4. Post-contrôles : parcours (a)(b)(c)(d) sur PROD avec comptes de test préfixés puis supprimés ; surveillance 24 h des erreurs 42501 sur `parks` (PostgREST logs).
Rollback (réouvre la faille) : voir l'en-tête de chaque migration.

## 7. Risques
- **Régression de création gestionnaire** si 0055 est appliquée **avant** le déploiement du front (erreur 42501 à la création d'un parc publié) → ordre §4 impératif.
- Deux temps non atomique : si l'UPDATE final échoue, le parc existe en `pending` dans l'organisation (message explicite, aucune perte).
- Un client mobile/PWA ancien en cache qui créerait un parc publié avec organisation (aucun connu : mobile envoie toujours `pending`).
- Import CSV collectivité : N appels × 2 requêtes supplémentaires (UPDATE) pour les parcs publiés.

## 8. Constat connexe (hors périmètre, non corrigé)
`anon` possède encore `INSERT/UPDATE/DELETE/TRUNCATE` sur 12 tables v1 de `public` (`parks`, `reviews`, `reports`, `profiles`, `children`, `communes`, `contact_messages`, `groups`, `group_members`, `maintenance`, `park_edit_history`, `notifications`) — identique PROD/STAGING. Les écritures REST sont bornées par la RLS ; `TRUNCATE` n'est pas exposé par PostgREST. C'est une dette de défense en profondeur du même type que 0019 : un REVOKE ciblé (lot séparé, à analyser table par table, car `contact_messages` et `reports` ont des écritures anonymes légitimes) est recommandé.
