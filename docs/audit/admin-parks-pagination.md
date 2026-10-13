# Audit — pagination des listes de parcs (back-office) — 2026-10-13

Base : `origin/main` 4432ae8 · branche `audit/admin-parks-pagination` · lecture seule (EXPLAIN ANALYZE en `begin read only` + rôle `authenticated` simulé staff, aucune écriture).

## 1. État réel (contredit en partie le contexte)
La liste principale **est déjà paginée serveur** : `AdminParks` → `listParksPage` (25/page, `count: exact`, tri `updated_at desc, id asc`, filtres q/statut/vérif/source/collectivité/pays dans l'URL, `keepPreviousData`, CSV via `listAllParksForExport`). Le vrai problème est ailleurs : requêtes annexes non bornées et **coût RLS/SQL**.

## 2. Écrans et appels (tous les `listParks()` / scans)
| Écran | Appel | Problème |
|---|---|---|
| Admin › Utilisateurs (`Users.tsx`) | `listParks({})` | tronqué à 1000, charge la vue lourde ; compteurs « parcs par utilisateur » faux dès >1000 |
| Admin › Parcs › import CSV | `listParks({communeId})` | anti-doublon sur ≤1000 lignes ; pour admin (communeId absent) = tout le catalogue tronqué |
| Admin › Organisation (détail) | `listParks({communeId:id})` | `id=in.(…)` + `max_rows` |
| Admin › Dashboard | `getParkStatusCounts` (1 requête/statut), `getParkSourceDistribution` (4–5 counts), `getParkCountryDistribution` | voir §3 |
| Shell (badge) | `getParkStatusCounts(["pending"])` | count exact RLS à chaque session |
| Collectivités : Dashboard, Carte, Statistiques, Maintenance, Paramètres, `communeParks`, `useParksCsv` | `listParks({communeId})` | `listOrgParkIds` **sans pagination** (cap silencieux 1000 ids) puis `id=in.(…)` : URL ≈ 38 car./id ⇒ échec au-delà de ~300–400 parcs, troncature à 1000 |
| Validation | `listParkEditsWithDetails({})` | table `park_edits` (pas `parks`), filtrage client ; volume faible aujourd'hui, à surveiller |

## 3. Causes
1. **`getParkCountryDistribution`** : `.range()` **sans ORDER BY** (pages instables ⇒ doublons/manques possibles) + N requêtes parallèles (STAGING 86, 500k parcs ⇒ 500).
2. **Source ambiguë** : `park_sources(source_type)[0]` non ordonné ; 2 200 parcs PROD ont `osm`+`reverse_geocode` ⇒ colonne/filtre « Source » arbitraire (et les parcs US enrichis par Geoapify vont suivre : 6 778).
3. **OFFSET profond** : STAGING offset 75 000 = 2,8 s (tri externe 4,8 Mo) ; extrapolation 500k ≈ 16 s > timeout `authenticated` (8 s).
4. **Index manquants** : aucun index sur `parks(updated_at)`, `parks(created_at)`, `parks(name)` (seulement trigram), ni composite `(moderation_status, updated_at, id)` ⇒ tri complet du filtre à chaque page.
5. **Filtre source = jointure `park_sources!inner` sur la vue RLS** : STAGING **46,5 s** (page 1 et count) — planification en boucle imbriquée 85 814 × RLS. PROD 5,3 s (limite 8 s) avec seulement 9 k parcs.
6. **RLS PROD ≠ STAGING** (dérive 0034–0045/0047/0048 & policies) : PROD `parks_public_read` = un seul `OR` de fonctions par ligne (`can_edit_park`, `is_commune_member`, `is_toboggo_staff`) ⇒ **1,4 s pour un simple count(*) sur 8 994 parcs**, 2,0 s page 1 « pending » (seq scan). STAGING (policies scindées published / extended_read) : count 85 k = 38 ms. Extrapolation PROD : ~15 s à 100 k, ~80 s à 500 k ⇒ timeouts.
7. `ilike '%q%'` : l'index trigram existe mais PROD fait un seq scan (RLS); STAGING 6 701 résultats = 116 ms count / 226 ms page.
8. Export CSV : `Promise.all` de N pages de 1 000 lignes de la vue lourde (≈15 sous-requêtes corrélées/ligne) ⇒ ingérable à 100k+.

## 4. Mesures (EXPLAIN ANALYZE, staff simulé)
| Requête | STAGING 85 814 | PROD 8 994 |
|---|---|---|
| page 1 triée | 87 ms | 1 963 ms (pending) |
| offset profond | 2 761 ms (75 000) | 2 630 ms (6 700) |
| count exact | 38 ms | 1 428 ms |
| ilike count / page | 116 / 226 ms | 1 509 ms |
| filtre source | **46 525 ms** | 5 303 ms |
| scan pays (1 page) | 53 ms | 1 559 ms |

## 5. Comportement projeté
- 10 000 : OK sur STAGING ; PROD déjà lent (2 s/requête, Dashboard = 5+ counts en parallèle).
- 100 000 : PROD (RLS actuelle) hors timeout sur count/filtre ; source join hors timeout partout ; collectivités >400 parcs cassées.
- 500 000 : offset profond, scan pays (500 req), export, source join, counts : tous KO.

## 6. Solution recommandée
**Phase A — sans migration (front/shared)**
1. `getParkCountryDistribution` → ordre stable, puis (phase B) agrégat serveur.
2. Source : tri/lecture déterministe (`park_sources` `order by source_priority desc`) ou colonne primaire ; ne plus dépendre de `[0]`.
3. Collectivités : `listOrgParkIds` paginé ; remplacer `id=in.(…)` par filtre serveur (embed `organization_parks!inner(organization_id)`), pagination page/clé.
4. `Users.tsx` : compteurs par utilisateur via RPC/count groupé ; plus de `listParks({})`.
5. Pagination par **clé** (keyset sur `(updated_at,id)`) pour l'accès séquentiel + OFFSET borné (plafond UI, ex. 10 000) avec message « affinez les filtres » ; total « ≥ N » au-delà de seuil (`count: planned/estimated`).
6. Colonnes de liste allégées (pas `features`/`photos` complets : `cover_photo`, `photos_count`).
7. Export CSV : par lots keyset avec abandon/limite et idéalement serveur.
**Phase B — SQL (migration, à valider, non faite)**
- Index : `parks (moderation_status, updated_at desc, id)`, `parks (country_code, moderation_status, updated_at desc, id)`, `parks (created_at desc, id)`, `park_sources (source_type, park_id)`; `parks(name)` trigram déjà présent.
- Aligner la RLS PROD sur le modèle STAGING (scission published / extended_read) ou `(select is_toboggo_staff(auth.uid()))` en initplan.
- RPC `admin_list_parks(filters…, cursor)` SECURITY DEFINER gardée par `is_toboggo_staff`, `search_path` fixé (même méthode que 0046), renvoyant `total`+page ; RPC `admin_park_counts()` (statuts/pays/sources en un appel).

## 7. Fichiers à modifier (implémentation)
`packages/shared/src/api/parks.ts` (listParksPage, listOrgParkIds, getParkCountryDistribution, export), `parkDetails.ts` (getParkSourceDistribution), `apps/backoffice-admin/src/screens/parks/AdminParks.tsx`, `Users.tsx`, `OrganizationDetail.tsx`, `AdminDashboard.tsx`, `packages/backoffice-core/src/{lib/sharedQueries.ts,components/Shell.tsx,screens/Settings.tsx}`, `apps/backoffice-collectivity/src/{lib/communeParks.ts,screens/{CommuneDashboard,MapScreen,Statistiques,Maintenance}.tsx,screens/parks/useParksCsv.ts}`, tests associés + `supabase/migrations/00NN_admin_parks_listing.sql` (+ manual) en phase B.

## 8. Tests
Unitaires : ordre stable/pas de doublon entre pages, `range`, filtres combinés, URL conservée, états chargement/erreur/vide, offset plafonné. Intégration (SQL local, transaction annulée) : staff vs gestionnaire vs anonyme (pending US invisible hors staff), cohérence `total` = somme des pages, 100 k parcs synthétiques, EXPLAIN < 500 ms. Non-régression FR/ES et Collectivités.

## 9. Déploiement progressif
1) Phase A derrière PR séparées (shared → admin → collectivités) ; 2) STAGING : migration index + RPC, mesures ; 3) PROD : index (CREATE INDEX CONCURRENTLY) puis RLS puis RPC, front en dernier avec repli sur l'ancien chemin ; 4) suivre `pg_stat_statements`.

## 10. Risques
RLS (fuite de pending US si RPC mal gardée), dérive STAGING/PROD, changement de comptes affichés, ancre d'URL/filtres (compat. liens existants), index lourds sur 9 k–85 k lignes (CONCURRENTLY), régression Collectivités si `organization_parks` change de forme.

## 11. Verdict
**GO** pour implémentation en 2 lots (A sans migration, B migration validée séparément). **NO-GO** pour monter le catalogue admin PROD au-delà de ~20–30 k parcs ou publier les 6 778 US sans le lot B (RLS PROD + index).

---

# Lot A — implémentation (sans migration, sans modification RLS)

## Ce qui change
| Sujet | Avant | Après |
|---|---|---|
| Périmètre collectivité | `listOrgParkIds` (cap 1000, silencieux) + `id=in.(…)` (URL > ~300 parcs) | jointure serveur `organization_parks!inner` (alias `scope_c` / `scope_o`), passe par la RLS de l'appelant ; reports, reviews, médias, propositions idem (`parks!inner(organization_parks!inner)`) |
| `listOrgParkIds` | 1 requête, 1000 ids max | keyset 1000/lot, séquentiel, plafond 100 000 (conservé, plus utilisé par les lectures) ; `isParkInOrganization` (1 requête PK) remplace `.includes(id)` |
| `listParks` | tout d'un coup, tronqué à 1000 | lots keyset séquentiels, **plafond 10 000** (`listParksCapped` → `truncated`) |
| Compteurs par utilisateur | `listParks({})` (1000 premiers, vue complète) | `countParksByCreator` : `id,created_by` des seuls parcs créés par un utilisateur, lots 1000, plafond ; « N+ » si minoré |
| Doublons import CSV | `listParks` entier | `parkExistsWithNameAndAddress` : nom exact (ilike échappé, index trigramme) + comparaison stricte nom/adresse, scopé |
| Source d'un parc | `park_sources[0]` (ordre arbitraire) | `pickPrimarySource` : priorité d'origine (miroir `source_priority`), `reverse_geocode` = enrichissement (`enrichment_sources`), jamais l'origine ; filtre « source » = jointure dédiée `src_filter` |
| Répartition par pays | N pages `.range()` sans ORDER BY | saut d'index par pays distinct (`order country_code limit 1 … gt dernier`) + 1 count/pays (4 simultanés max) |
| Compteurs par statut | tous en parallèle | 4 simultanés max, périmètre par jointure |
| Export CSV | N pages OFFSET en `Promise.all` | lots keyset **séquentiels**, ordre = tri demandé + `id`, total connu au 1er lot, **refus au-delà de 50 000** (`ExportTooLargeError` → message « affinez les filtres ») |
| Colonnes de liste | 52 colonnes (features, scores, noms traduits…) | 19 colonnes (`ParkListRow`) |
| Pages profondes | OFFSET illimité | OFFSET ≤ 10 000 (page ramenée dans la plage, `truncatedDepth`, invite « affinez les filtres ») ; URL/filtres/navigation inchangés |

## Pagination par curseur — conclusion de l'étude
- **Keyset retenu** pour les parcours séquentiels (export) : `or=(col.gt."v",and(col.eq."v",id.gt."i"))`, valeurs citées (virgules, guillemets, parenthèses), testé contre PostgREST réel.
- **Navigation par pages (numéros) conservée en OFFSET**, bornée à 10 000 : un curseur n'autorise pas « aller à la page N » ni le total par page ; supprimer cette UX sort du périmètre. Pour dépasser 10 000 résultats : affiner les filtres ; un vrai curseur côté UI relève du lot B (RPC + index composite).

## Tests
- `parks.scale.test.ts` : 10 000 / 100 000 / 500 000 parcs simulés (max_rows 1000, URL ≤ 8000 car., OFFSET, concurrence mesurée) — 42 tests.
- `orgScope.test.ts` : forme des requêtes (reports/reviews/médias/propositions/PK), citation du curseur keyset, échappement `ilike`.
- `parks.integration.test.ts` : **PostgREST + RLS réels (pile locale)** — anon ne voit aucun parc `pending` (liste, compteurs, export, périmètre), membre de A lit ses 1 203 parcs `pending` (> max_rows) et rien de B, staff : filtres/tri/export keyset complets sans doublon, répartition pays = SQL. Ignoré si la pile locale est absente (CI) ; nettoie ses lignes `LOTA-TEST`.
- Mises à jour : `parks.test.ts`, `contributions.test.ts`, `ParkDetail.test.tsx`, `AdminParks.test.tsx` (+2 : export trop gros, profondeur plafonnée), `Users.test.tsx` (nouveau).

## Mesures lecture seule (EXPLAIN ANALYZE, rôle `authenticated` staff simulé)
| Requête | STAGING 85 814 | PROD 8 994 |
|---|---|---|
| page 1, toutes colonnes (avant) | 3 330 ms | 1 774 ms |
| page 1, colonnes allégées (après) | **80 ms** | 1 436 ms |
| doublon import : charger 1000 lignes (avant) / nom exact (après) | 637 / 149 ms | 2 681 / 2 239 ms |
| pays : découverte d'un pays + count d'un pays (après) | 2 + 21 ms | 0,1 + 1 457 ms |
| créateurs : 1 lot `id,created_by` (après) | 0,5 ms | 2,5 ms |
Sur PROD le temps est dominé par la RLS de `parks` (≈ 1,4 s même pour un `count`), non modifiée ici (lot B).

## Limites restantes → lot B (migration / RLS, hors périmètre de ce lot)
1. **RLS PROD** (policy `parks_public_read` en `OR` de fonctions par ligne) : toute lecture/comptage ≥ 1,4 s dès 9 k parcs, proportionnel à N → timeout 8 s vers 50 k parcs.
2. **Filtre « source »** : la jointure `park_sources!inner` sur la vue sous RLS reste lente (46 s sur STAGING, 5,3 s sur PROD) — nécessite un index `park_sources (source_type, park_id)` et/ou une RPC.
3. **Index** `parks (moderation_status, updated_at desc, id)` etc. : tri encore complet sur le filtre.
4. **Compteurs** : exacts mais coûteux (RLS) — RPC `admin_park_counts()`.
5. **Collectivités > 10 000 parcs** : `listParks` tronque (signalé) ; cartes/statistiques devront paginer côté serveur ou agréger.
6. `reviews` / `reports` / `listAllUsers` / `listParkEditsWithDetails` restent des listes non paginées (volumes faibles aujourd'hui, hors périmètre parcs).
7. Source `reverse_geocode` absente du type TS `SourceType` (exposée via `enrichment_sources`, non filtrable dans l'UI).
