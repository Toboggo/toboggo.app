# Runbook — import OSM New York sur PROD (en `pending` uniquement)

> Préparé le 2026-10-11. **Rien n'a été écrit sur PROD ni STAGING.** Ce runbook complète
> `us-address-and-ny-import.md` (§4–§6). **STOP : l'import réel exige l'autorisation explicite du fondateur.**

## 1. Résultat du dry-run (strictement sans écriture)
`npm run osm:import:prod -- new-york` (sans `--commit`) → « AUCUNE DONNÉE DISTANTE ÉCRITE » :
Candidats **6 778** · écartés 6 472 (6 040 doublons d'export, 383 `access_private`, 49 `access_customers`) ·
enrichissements : surface 319, accessibilité 66, clôture 28 · arguments : `--country-code US --timezone America/New_York --placeholder-name Playground`.

| Contrôle | Résultat |
|---|---|
| Identifiants OSM | 6 778 uniques, tous `node|way|relation/<n>` (1 075 / 5 671 / 32) |
| **Créations / collisions** | **6 778 créations / 0 collision** (PROD : 2 201 `external_ids` OSM, tous FR ; ∩ lot = 0 ; vérifié aussi en SQL, tous providers confondus) |
| Noms | 676 vrais noms OSM ; 6 102 « Playground » (`has_osm_name=false`, sans provenance) ; 0 vide, 0 > 255 car., aucun « Playground » présenté comme nom OSM |
| Coordonnées | lat 40,499–44,998 / lng −79,713…−71,860 ; 0 hors emprise NY, 0 (0,0), 0 doublon exact |
| Équipements | swing 34, water_play 29, play_structure 22, slide 7, climbing 5, seesaw 1, sandbox 1 ; attributs surface 319, clôture 28, accessibilité 66 |
| Pays / fuseau | `US` / `America/New_York` sur 6 778 / 6 778 |
| Âges | 55 min, 60 max, 0 incohérent |
| Adresses OSM | 14 ; avec État (`addr:state`) 7 ; rue US abrégée (« Haskell Ave ») — plus propre que STAGING (importé avant la normalisation) |

## 2. `pending` exclusivement (vérifié sur le SQL exact de l'import)
Analyse statique des 6 778 blocs SQL générés (sans `--publish`) : 6 778 × `insert into parks … 'pending'`, **0** occurrence de `'published'`,
`verification_status = 'unverified'`, **0** `moderation_status` dans les `UPDATE`, **0** `delete/drop/truncate/alter` ; cibles d'écriture :
`parks`, `external_ids`, `park_sources`, `park_features` (+ `set_park_attribute_source` → `park_attribute_sources`). Avec `--publish`
le SQL contient `'published'` (contrôle de la sonde). **Répétition générale locale** (base locale + 0046 + 0049, SQL exact en 136 lots
de 50, transaction annulée) : 5–6 s ; 6 778 parcs `pending`, 0 autre statut, `created_by` nul, `unverified`, 6 778 `external_ids`,
sources `osm` ×6 778, provenance de nom ×676 ; **parcs FR strictement identiques** (empreinte) ; rollback ciblé : 6 778 → 0 en 2,5 s,
parcs FR identiques, aucune source orpheline.

## 3. Exposition des `pending` (rapport de sécurité)
Mécanismes : `parks_public_read` (`moderation_status = 'published'` ∨ créateur ∨ gestionnaire ∨ staff), `external_ids/park_sources/
park_attribute_sources/park_features` : `park_is_visible(park_id)`, `nearby_parks*` : filtre interne `published`, `parks_insert` : `auth.uid() is not null`.

| Voie (rôle **anon**, lecture seule sur PROD avec les **14 vrais parcs non publiés** — 5 pending, 6 rejected, 3 blocked — comme proxys) | Fuites |
|---|---|
| `park_public` (par id / tous non publiés / recherche `ilike`) | 0 |
| `parks`, `external_ids`, `park_sources`, `park_attribute_sources`, `park_features`, `park_names`, `park_scores`, `organization_parks`, `reviews` | 0 |
| `nearby_parks` et `nearby_parks_page` à 300 m de chacun des 14 | 0 / 0 |
| `find_duplicate_parks` | 0 |
| Écriture : `parks_insert` exige `auth.uid()` (anon refusé) ; aucun droit UPDATE/DELETE effectif | — |

Répétition locale avec les **vrais** 6 778 pending, rôles **anon** et **authenticated** (utilisateur simple) : `park_public`, `parks`, `external_ids`,
`park_sources`, `park_features`, `park_attribute_sources`, recherche, `nearby_parks` (Manhattan, Buffalo), `nearby_parks_page` → **0 partout**.

**Constats hors périmètre (pré-existants, non bloquants) :**
- `park_media` : la policy lit `status='approved'` sans exiger que le parc soit publié ⇒ anon voit **2 médias approuvés de parcs non publiés**
  (lignes `park_media` : park_id + url). Aucun média n'existe pour les parcs New York ; à durcir plus tard (`park_is_visible(park_id)`).
- `increment_park_views(uuid)` (SECURITY DEFINER, appelable par anon) incrémente `views` d'un parc quel que soit son statut, UUID requis (non devinable) : aucune lecture exposée.
- Back-office : plusieurs écrans staff appellent `listParks()` non paginé (plafonné à 1 000 lignes par PostgREST, déjà dépassé avec 2 216 parcs) ;
  le staff verra les 6 778 `pending` US dans ses listes/cartes (bruit, pas d'exposition publique).

## 4. Préconditions et protections du rollback ciblé (relues sur PROD, lecture seule)
Lot = 6 778 `external_id` recalculés depuis le PBF. Sur PROD aujourd'hui : **0 parc du lot** ⇒ le script **s'arrête** (« 0 trouvé, 6 778 attendus »).
Après un import `pending` : toutes les gardes passent (compte, pays US, `pending`, `created_by` nul, créé après `IMPORT_STARTED_AT`, aucune identité /
source / équipement étranger, 0 ligne dans les 17 tables humaines/fonctionnelles — 0 sur PROD, `park_confirmations` incluse). Voir `us-address-and-ny-import.md` §5.
Test PROD-like : `scripts/osm/tests/test_rollback_osm_batch.py` (14 tests) + répétition à blanc sur le vrai lot (ci-dessus).

## 5. État avant import (à refaire JUSTE avant de lancer)
```bash
cd "/Users/fabienmaury/Documents/Toboggo full folder/toboggo-wt-product-analytics" && git pull --ff-only origin main
python3 scripts/osm/prod-import-snapshot.py prod --out backups/prod-ny-import-pre --exclude-country US   # JSON (lecture seule)
python3 scripts/osm/prod-import-snapshot.py prod --out backups/prod-ny-import-pre --export --exclude-country US   # + copie des tables (facultatif)
```
+ `supabase/manual/ny_import_precheck_readonly.sql` (dont `select now()` → **IMPORT_STARTED_AT**, à noter tel quel).
Valeurs au 2026-10-11 : 2 216 parcs FR (published 2 202, pending 5, rejected 6, blocked 3) ; `external_ids` osm 2 201 ; sources osm 2 201 / reverse_geocode 2 200 /
municipality 2 / toboggo 2 ; empreinte parcs `791ab4871f929d02607c0d6a0b670f68` ; vue `ca4d34b8…` ; `nearby_parks` `afaf1b9b…` ; `nearby_parks_page` `f9de4da3…` ; base 36 Mo ; `audit_log` 4 503.

## 6. Commande exacte d'import réel (à conserver — NE PAS exécuter sans autorisation)
```bash
cd "/Users/fabienmaury/Documents/Toboggo full folder/toboggo-wt-product-analytics"
git pull --ff-only origin main
npm run osm:import:prod -- new-york --commit        # SANS --publish
# invite : « Tape PROD pour confirmer l'écriture production » → PROD
```
Attendu : `Candidats 6778`, « Import par lots de 50 parcs », 136 lots, `IMPORT DISTANT TERMINÉ — Traités : 6778 — Nouveaux parcs : pending`.
Terminal interactif requis (confirmation). **Ne jamais ajouter `--publish`.** Durée : 136 appels CLI (≈ quelques minutes ; SQL seul ≈ 6 s en local).
En cas d'erreur sur un lot : **ne pas relancer à l'aveugle** — les lots déjà validés sont committés ; l'import est idempotent par `external_id`
(les parcs existants sont mis à jour, jamais dupliqués, ni re-statués) ; diagnostiquer, puis relancer ou revenir en arrière (§8).

## 7. Contrôles après import
`supabase/manual/ny_import_postcheck_readonly.sql` (valeurs attendues en commentaire) + comparaison automatique :
```bash
python3 scripts/osm/prod-import-snapshot.py prod --compare backups/prod-ny-import-pre/etat_avant_import.json --exclude-country US
```
(empreinte des parcs hors US, fonctions et vue identiques ⇒ « COMPARAISON : OK »). Attendus : 8 994 parcs ; 6 778 US `pending` ;
`external_ids` osm 8 979 ; 676 / 6 102 noms ; équipements ci-dessus ; **exposition anon = 0** ; `nearby_parks` Manhattan = 0 tant que non publié.

## 8. Rollback d'urgence (limité au lot ; jamais d'effet sur la France)
```bash
python3 scripts/osm/rollback-osm-batch.py prod "$TOBOGGO_OSM_DIR/new-york-261004.osm.pbf" \
  --country-code US --import-started-at "<IMPORT_STARTED_AT>" --expected-count 6778 --emit-sql /tmp/ny-rollback.sql   # aucune connexion
# relire /tmp/ny-rollback.sql, puis le coller dans le SQL Editor PROD (une transaction ; toute garde en échec annule tout)
```
Import **partiel** (lot en erreur) : `--expected-count` = nombre réel de parcs du lot déjà créés (`select count(*) … external_ids du lot`), le script refuse sinon.
Rollback **impossible par conception** après publication ou contribution humaine (⇒ plan de dépublication dédié). Reste dans `audit_log` la trace de l'import et de la suppression.

## 9. Risques résiduels et performance
- **Performance** : écritures par lots de 50 (transactions courtes, aucun verrou de table) ; +6 778 lignes `parks`, `external_ids`, `park_sources`, ≈ +6 778 `audit_log` ;
  croissance estimée ≈ +35–40 Mo (STAGING : 482 Mo / 85 814 parcs ≈ 5,6 ko/parc) → ~75 Mo, très en deçà des limites. Aucun impact sur `nearby_parks` tant que les parcs sont `pending`
  (filtrés **avant** l'enrichissement). Capacité après **publication** : STAGING (mêmes parcs, instance identique) 206 ms à 20 km Manhattan (1 483 parcs), 0 × 57014.
- Le Geoapify FR en cours sur STAGING n'interfère pas (projets séparés) ; aucun appel Geoapify dans cet import.
- Les 6 102 parcs « Playground » sans adresse restent peu différenciables jusqu'au backfill (publication conditionnée, cf. §6 du plan).
- Mentions légales FR/CNIL uniquement, edge function `reverse-geocode` non redéployée : **prérequis de publication**, pas d'import `pending`.
- Parité STAGING/PROD : STAGING a des parcs `published` et une dérive de migrations (0034–0045, 0047, 0048) ; PROD est à jour — les contrôles d'exposition ont donc été faits sur PROD (proxys) et en local.

## 10. Verdict
**GO technique pour l'import `pending`** (sur autorisation explicite) · **NO-GO pour la publication** (légal, adresses, edge function).
