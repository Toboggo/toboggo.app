# Adresses US et import New York sur PROD — format, Geoapify, plan, rollback

> Préparation du 2026-10-12. **Rien n'est appliqué** (ni migration, ni import, ni Geoapify, ni écriture
> STAGING/PROD). Contexte : `nearby_parks` PROD déjà en 0046 ; 6 778 parcs New York validés sur STAGING.

## 1. Audit du format actuel (FR / ES)
| Où | Règle actuelle |
|---|---|
| Vue `park_public.formatted_address` (0017) | `address_line, <code postal> <ville>` pour **tous** les pays (pièces absentes omises) |
| OSM (`address.extract_address_from_tags`) | `addr:housenumber + addr:street`, CP, ville ; `admin_area_1/2` toujours `NULL` |
| Geoapify (`geoapify.py::_extract`, miroir TS `supabase/functions/reverse-geocode/address.ts`) | `housenumber + street`, CP, `city/town/village`, `state` → `admin_area_1`, `county/state_district` → `admin_area_2` |
| Affichage nom générique | `getParkDisplayName` : `<libellé localisé> • <rue sans n°>` (`cleanStreetName`) |

Constat : sur un parc US la vue donnait « 10036 New York » (ordre français, **sans État**).

## 2. Format US retenu
`numéro · direction (W/E/N/S) · rue · ville · ÉTAT (2 lettres) · ZIP` → **`123 W 42nd St, New York, NY 10036`**.

| Entrée | Sortie |
|---|---|
| rue + ville + État + ZIP | `123 W 42nd St, New York, NY 10036` |
| ZIP+4 | `10 Park Ave, New York, NY 10016-1234` |
| sans rue | `Brooklyn, NY 11201` |
| sans ZIP | `9 Broadway, Brooklyn, NY` |
| sans ville | `1 Main St, NY 14201` |
| sans État | `1 Main St, Buffalo, 14201` |
| État inconnu | conservé tel quel (`…, Atlantis 00000`) — jamais d'abréviation inventée |
| rien | `NULL` (jamais le nom du parc, jamais « Playground ») |

- **Où** : migration `0049_formatted_address_us.sql` (préparée) : fonction `us_state_abbr(text)` + `park_public.formatted_address`
  country-aware. `country_code <> 'US'` ⇒ formule d'origine **à l'identique** (vérifié : empreinte de `formatted_address`
  sur tous les parcs locaux inchangée). Colonnes, types, `security_invoker` et droits de la vue inchangés ;
  `nearby_parks*` (0046) en héritent (test 0046 + 0049 ensemble : OK).
- **Normalisation** (Geoapify **et** OSM, pour des sources cohérentes) : « West 42nd Street » → « W 42nd St » ;
  direction **en tête** et suffixe **en fin** seulement, jamais si le mot est le nom entier (« West Street » reste tel quel) ;
  `hamlet` accepté comme ville (US) ; `addr:state` OSM converti en nom d'État complet s'il est reconnu.
  `admin_area_1` garde le **nom complet** de l'État (même sémantique partout) ; l'abréviation est dérivée à l'affichage.
- **Quartier / borough** : aucune colonne `parks` dédiée. Geoapify `suburb|neighbourhood|district|quarter` et `state_code`
  sont conservés dans la **provenance** (`park_attribute_sources.value_json`, jsonb libre), US uniquement.
  ➜ **Décision à prendre** si un affichage « quartier » est voulu (nom générique « Playground • Chelsea », adresse
  « …, Manhattan, New York ») : colonne `neighbourhood` nullable (migration additive + vue + types).
  À New York le *postal city* peut être le borough (« Brooklyn, NY 11201 ») : à vérifier sur ~10 parcs réels avant d'arrêter une règle.

## 3. Adaptations Geoapify (sans appel API)
- `_extract` (Python) et `extractAddress` (TS) : US ⇒ rue abrégée, `hamlet`, + (Python) `country_code`, `neighbourhood`, `state_code`
  (`None` hors US ⇒ sortie FR/ES inchangée). Parité Python ↔ TS testée (`parity.test.ts`, fixtures US/FR/ES).
- `backfill-addresses.py` : provenance US enrichie (`neighbourhood`, `state_code`) ; **colonnes `parks` = les mêmes 5 champs** ;
  flag `sans_etat` (US) ; dry-run affiche le format US. FR/ES : JSON de provenance et SQL **identiques** (test).
- **Provenance et priorités inchangées** : écriture via `set_park_attribute_source`, gates `can_source_replace_attribute(…,
  'address', 'reverse_geocode')` (priorité `reverse_geocode` 45 < OSM 50 < humain/collectivité), idempotence (parcs déjà
  `reverse_geocode` jamais retraités), `--country-code US` pour cibler le lot.
- **Edge function** `reverse-geocode` (ajout de parc par un utilisateur) : même normalisation US ; **à redéployer** après
  validation (`supabase functions deploy reverse-geocode`, non fait ici).
- Estimation backfill : ~6 764 appels (parcs sans adresse), throttle ≥ 0,25 s ⇒ ≈ 30 min hors latence. **Vérifier le quota du
  plan Geoapify avant** ; commencer par `--limit 10` en dry-run puis commit sur STAGING.

## 4. Plan d'import PROD en `pending`
**Prérequis (tous)** : #138/#142/#145 mergées ✔ ; 0046 appliquée sur PROD ✔ ; accord explicite de l'import ;
PBF `new-york-261004.osm.pbf` (497 290 175 octets) ; fenêtre calme.

1. **Snapshot lecture seule avant** (à conserver) :
   - `select count(*), count(*) filter (where moderation_status='published') from parks;` → 2 216 / 2 202
   - `select country_code, count(*) from parks group by 1;` → FR seulement
   - `select count(*) from external_ids where provider='osm';` → 2 201
   - `select md5(string_agg(id::text||updated_at::text, '|' order by id)) from parks;` (empreinte FR/ES)
   - md5 `nearby_parks` = `afaf1b9b38b69bade82d7974b68c2468`
   - noter `IMPORT_STARTED_AT` (UTC) **juste avant** de lancer.
2. **Import** : `npm run osm:import:prod -- new-york --commit` (**sans `--publish`**), saisir `PROD` quand demandé.
   Attendu : 6 778 candidats, 136 lots de 50, nouveaux parcs `pending`.
   Si un lot échoue : **ne pas relancer à l'aveugle** — l'import est idempotent par `external_id` (les parcs déjà créés sont
   mis à jour, pas dupliqués) ; diagnostiquer d'abord.
3. **Vérifications après import** (SELECT) :
   - 6 778 parcs `country_code='US'`, `timezone='America/New_York'`, tous `pending`, `verification_status='unverified'`, `created_by is null` ;
   - 676 noms OSM réels (provenance `osm` sur `name`) / 6 102 « Playground » **sans** provenance ;
   - `external_ids` osm = 2 201 + 6 778 = 8 979 ; 0 doublon ; coordonnées toutes dans l'emprise NY ;
   - FR/ES : mêmes comptes et même empreinte qu'au snapshot ; `nearby_parks` md5 inchangé ;
   - équipements : swing 34, water_play 29, play_structure 22, slide 7, climbing 5, seesaw 1, sandbox 1.
4. **Capacité de `nearby_parks`** : les parcs `pending` ne sont **pas** renvoyés (filtre `published`) — la mesure à Manhattan
   n'est donc possible qu'**après publication**. Preuve avant : STAGING (mêmes 6 778 parcs, instance identique) 206 ms à 20 km.
5. **Adresses** : backfill Geoapify (dry-run puis commit) d'abord STAGING (+ 0049), puis PROD.

## 5. Rollback strictement limité au lot (`scripts/osm/rollback-osm-batch.py`)
Supprime **uniquement** les parcs dont l'`external_id` OSM figure dans le lot (liste recalculée depuis le PBF), en **une
transaction gardée** ; la moindre garde en échec annule tout.

| Garde | Refus si… |
|---|---|
| compte | ≠ 6 778 parcs trouvés pour le lot |
| périmètre | pays ≠ US, statut ≠ `pending` (jamais publié), `created_by` non nul, créé avant `IMPORT_STARTED_AT` |
| identités | un parc du lot a une autre identité externe |
| dépendances humaines/fonctionnelles | lignes rattachées dans `reviews, reports, park_edits, park_edit_history, park_media, park_confirmations, maintenance, groups, notifications, organization_parks, park_zones, park_entrances, park_opening_hours, park_equipment, park_scores, park_names, park_duplicate_candidates` |
| provenance | source ≠ `osm` / `reverse_geocode`, attribut de provenance humaine |
| équipements | `park_features` non posés par l'import OSM |

État réel (lecture seule, 2026-10-12) : **STAGING** — 6 778 parcs du lot présents, **tous `published`** ⇒ le rollback **refuse** (hors périmètre), 0 ligne dans toutes les tables dépendantes, 0 `created_by`, 0 source/identité/équipement étranger ; la table `park_confirmations` est absente de STAGING (0043 non appliquée) : **ignorée** par les gardes (corrigé dans cette PR — le script ne plantait pas en silence, il s'arrêtait). **PROD** — 0 parc du lot ⇒ le script s'arrête (« 0 trouvé, 6 778 attendus ») : sûr tant que l'import n'est pas fait ; après un import `pending`, toutes les gardes passent.

Dépendances supprimées en cascade (FK `ON DELETE CASCADE`) : `external_ids`, `park_sources`, `park_attribute_sources`,
`park_features` (et les tables vides ci-dessus) ; `notifications.park_id` passerait à `NULL` (SET NULL, gardé à 0 ligne).
Restent : lignes `audit_log` (append-only, trace de l'import et de la suppression).

```bash
# 1. Générer le script gardé (aucune connexion) puis le relire :
python3 scripts/osm/rollback-osm-batch.py prod "$TOBOGGO_OSM_DIR/new-york-261004.osm.pbf" \
  --country-code US --import-started-at <IMPORT_STARTED_AT> --expected-count 6778 --emit-sql /tmp/ny-rollback.sql
# 2. Coller /tmp/ny-rollback.sql dans le SQL Editor PROD (transaction unique) — ou, plus prudent,
#    d'abord le rapport lecture seule :  (sans --commit)  python3 scripts/osm/rollback-osm-batch.py prod … 
```
Répétition générale réalisée sur la base locale avec le vrai lot (6 778 `external_id`) : **2,6 s**, 8 993 → 2 215 parcs
(les 2 215 parcs d'origine intacts), transaction annulée. Tests : `scripts/osm/tests/test_rollback_osm_batch.py`
(succès limité au lot ; arrêt si publié, `created_by`, donnée humaine, identité/source/équipement étrangers, compte, pays, date).
**Limite** : après publication ou contribution utilisateur, le rollback **refuse** (par conception) ; il faudrait alors un plan
dédié (dépublication `pending`/`rejected` plutôt que suppression).

## 6. Contrôles avant publication (tous requis)
1. 0049 appliquée et validée (STAGING puis PROD), `us_state_abbr` + vue conformes, FR/ES identiques.
2. Backfill Geoapify exécuté, taux d'adresses mesuré, parcs « sans_etat » relus ; décision `neighbourhood`.
3. Edge function `reverse-geocode` redéployée et testée sur STAGING (ajout de parc US).
4. **Mentions légales** adaptées (aujourd'hui FR/CNIL uniquement ; données d'enfants — COPPA/CCPA à faire valider par toi).
5. Smoke tests app STAGING (carte, liste, fiche sans adresse, ajout de parc jusqu'au récapitulatif, EN/ES/FR, unités).
6. Publication scopée (US + `pending` + import OSM), transaction gardée avec compte attendu, **sans toucher `verification_status`** ;
   post-contrôles (`nearby_parks` anon Manhattan 2/10/20 km, 0 × 57014, 0 parc non publié exposé).

## 7. Audit réel de 0049 (lecture seule, 2026-10-12)
| | PROD | STAGING |
|---|---|---|
| `park_public` md5 | `fae08d09…` | `fae08d09…` (identique) |
| propriétaire / options | `postgres` / `security_invoker=true` | idem |
| droits (`relacl`) | `postgres, service_role = arwdDxtm ; anon, authenticated = r` | idem |
| colonnes | 55, md5 des types `07aabe22…` | idem |
| commentaire, défauts, triggers, vues dépendantes | aucun | aucun |
| `us_state_abbr` | absente | absente |
| ancienne vs nouvelle formule sur les **vraies données** | 2 216 parcs non-US : **0 écart** | 79 036 non-US : **0 écart** ; 6 778 US : 9 adresses changent (celles qui ont déjà des champs adresse) |

Propriétaire, droits, options et commentaire sont **capturés dans la transaction puis comparés** (migration 0049 et
`0049_rollback.sql`) : ils restent ceux de l'environnement, même s'ils diffèrent un jour. Le rollback refuse s'il n'est pas
appliqué ou si la vue a été modifiée depuis ; il vérifie le md5 d'origine. Testé : aller-retour complet, y compris avec une
ACL et un commentaire spécifiques ajoutés à la vue.

## 8. Plan d'application de 0049 sur STAGING (après merge, accord explicite)
1. Relire en lecture seule : md5 de `park_public` = `fae08d09…`, `us_state_abbr` absente.
2. SQL Editor STAGING : coller `supabase/manual/0049_apply_in_transaction.sql` en entier (une transaction, gardes d'empreinte).
3. Contrôles : md5 vue ≠ origine et contient `us_state_abbr` ; mêmes colonnes/droits/options ; `nearby_parks` (md5 `afaf1b9b…`)
   toujours OK ; sur STAGING 9 adresses US passent au format `rue, ville, NY ZIP`, **0 adresse non-US modifiée**
   (comparer l'empreinte `md5(string_agg(id||formatted_address))` des parcs `country_code<>'US'` avant/après).
4. App STAGING : fiche US avec adresse (format US), fiche FR/ES inchangée, recherche, partage.
5. Anomalie ⇒ `supabase/manual/0049_rollback.sql` (restaure le md5 d'origine).
6. PROD : seulement après validation STAGING et accord explicite (même procédure ; PROD n'a aucun parc US avant l'import).

## 9. Évolution future facultative : `neighbourhood` (NON implémentée, aucun changement de schéma ici)
Objectif : afficher un quartier/borough (« Playground • Chelsea », « …, Chelsea, New York, NY »).
- **Déjà acquis sans coût** : le backfill US stocke `neighbourhood` (et `state_code`) dans `park_attribute_sources.value_json`
  (`attribute_key` libre, aucune contrainte CHECK) ⇒ une fois le backfill fait, **aucun nouvel appel Geoapify** pour alimenter la colonne.
- **Schéma (migration additive)** : `alter table parks add column neighbourhood text null` ; `park_public` : colonne ajoutée
  **en fin de vue** (CREATE OR REPLACE autorise l'ajout en dernier) ; `formatted_address` US optionnellement
  `rue, quartier, ville, ÉTAT ZIP` ; **contrat `nearby_parks*` (43 colonnes)** inchangé tant qu'on n'ajoute pas la colonne à leur
  `RETURNS TABLE` (changement de type de retour ⇒ nouvelle fonction/versionnement, à décider à part).
- **Données** : copie depuis la provenance (`value_json->>'neighbourhood'`) via `apply_park_attribute`/`set_park_attribute_source`
  (priorités de sources respectées) ; jamais d'écrasement d'une valeur humaine.
- **App** : `getParkDisplayName` : qualifier `quartier` avant `rue` ; types régénérés ; tests FR/ES/US.
- **Pièges** : le *postal city* new-yorkais est souvent le borough (Brooklyn) ou le quartier (Astoria) — règle à valider sur
  un échantillon réel de réponses Geoapify ; ne pas confondre `neighbourhood` et `admin_area_2` (county).
- **Décision à prendre** avant : valeur produit du quartier vs coût (migration + types + contrat RPC).

## 10. Blocages / risques
- Légal (point 4) et décision `neighbourhood` : **non tranchés**.
- Règle « quartier = borough » non vérifiable sans appel Geoapify (volontairement non lancé).
- Parité Python ↔ TS ↔ SQL du format à maintenir (table des États : test DB).
- Edge function non redéployée ; 0049 non appliquée ; PROD sans parc US tant que l'import n'est pas fait.
