# Pilote Geoapify US — 25 parcs sur STAGING

> Préparé le 2026-10-11 (aucun appel Geoapify, aucune écriture). Contexte : import PROD New York terminé
> (6 778 parcs `pending`) ; STAGING porte les mêmes 6 778 parcs US, **publiés**, sans adresse (6 764 / 6 778).

## 1. État du code (PR #147, mergée)
Présent et testé : normalisation US (`geoapify.py::_extract`, miroir TS `reverse-geocode/address.ts`), format US (vue 0049),
provenance enrichie (`neighbourhood`, `state_code` US seulement), flag `sans_etat`.
Correctif de cette PR : une rue **blanche** (« ␣ ») après normalisation retombait sur `""` côté TS au lieu de `address_line1` (Python) —
parité rétablie ; **fuzz de parité Python ↔ TS : 4 000 charges aléatoires US/FR/ES/CA, 0 écart** (avant : 4, tous la même cause).

## 2. Audit de la normalisation (US)
| Élément | Règle | Remarque |
|---|---|---|
| Numéro + direction + rue | « 123 West 42nd Street » → `123 W 42nd St` ; direction **en tête** et suffixe **en fin** seulement ; « West Street » reste tel quel | suffixes : St, Ave, Blvd, Rd, Dr, Pl, Ln, Ct, Ter, Pkwy, Hwy, Sq, Cir, Trl ; « Way/Plaza/Alley… » inchangés |
| Ville | `city` → `town` → `village` → `hamlet` (US) | NYC : Geoapify renvoie en général « New York » pour les 5 boroughs — **à confirmer sur le pilote** |
| État | `state` (nom) dans `admin_area_1`, abrégé « NY » à l'affichage (`us_state_abbr`) ; `state_code` en provenance | État inconnu conservé tel quel, jamais inventé |
| ZIP | `postcode` tel quel (ZIP ou ZIP+4) | validé par le contrôle `zip_invalide` |
| Quartier / borough | `suburb → neighbourhood → district → quarter` **dans la provenance seulement** | pas de colonne `parks` ; voir `us-address-and-ny-import.md` §9 |
| **POI** | si Geoapify ne renvoie pas de `street`, **`address_line1` (nom du lieu) devient `address_line`** | **risque principal** : sur PROD FR, 123 adresses `reverse_geocode` sur 2 200 (5,6 %) n'ont pas de numéro et plusieurs sont des noms de lieu (« Camping Le Roquelongue », « Parc des Merlettes »). Un parc de jeux est souvent *dans* un parc : attendre davantage aux US. Détecté par le contrôle `rue_ressemble_a_un_POI`. |

Décision **après** le pilote (pas avant) : si les POI dominent, ajouter une option « US : pas de repli `address_line1` » (changement de
comportement ⇒ PR séparée, FR/ES inchangés par défaut).

## 3. Candidats et provenance (STAGING, lecture seule)
- SQL exact du backfill, `--country-code US` : **6 764 candidats** (adresse absente ET non protégée par une source de priorité ≥ 45).
  Les 14 parcs US avec adresse OSM (provenance `osm`, priorité 50) ne sont **pas** sélectionnés quand ils sont complets ; partielles protégées : 6.
- Sources US : 6 778 × `osm` uniquement ; 0 `reverse_geocode` ; aucun parc US déjà traité.
- Le pilote = `order by id limit 25` : ids `00072bf1…` → `00b63b19…`, **25 `published`**, **11 dans NYC intra-muros, 14 hors NYC**, 2 avec vrai nom OSM — échantillon aléatoire (UUID) représentatif.
- FR/ES : le backfill FR tourne déjà sur STAGING (FR 10 078 / 43 278 traités, ES 35 648 / 35 758) — **ne pas y toucher**.

## 4. Commande exacte du pilote (à lancer par toi ; ne rien exécuter sans autorisation)
```bash
cd "/Users/fabienmaury/Documents/Toboggo full folder/toboggo-wt-ny-import-prod"   # branche avec les outils (après merge : main à jour)
export GEOAPIFY_API_KEY='…'          # ta clé ; jamais committée, jamais dans un fichier suivi
D=backups/geoapify-pilot-us/$(date -u +%Y%m%dT%H%MZ)

# 1. AVANT : fige les 25 candidats exacts + la base de référence + PROD (lecture seule, 0 appel API)
python3 scripts/osm/geoapify-pilot-check.py before --out $D --limit 25

# 2. DRY-RUN (consomme 25 appels Geoapify, n'écrit rien en base) — relire les 25 adresses et les signalements
python3 scripts/osm/backfill-addresses.py --env staging --country-code US --limit 25 --min-interval 1.5 2>&1 | tee $D/pilot-dry-run.log

# 3. COMMIT (25 nouveaux appels ; même sélection) — STAGING uniquement
python3 scripts/osm/backfill-addresses.py --env staging --country-code US --limit 25 --min-interval 1.5 --commit 2>&1 | tee $D/pilot.log

# 4. APRÈS : contrôles automatiques (lecture seule)
python3 scripts/osm/geoapify-pilot-check.py after --out $D --log $D/pilot.log
```
- **Consommation** : 25 (dry-run) + 25 (commit) = **50 appels** (+ retries éventuels sur 429/5xx) ; 25 seulement si tu sautes le dry-run.
- **`--min-interval 1.5`** : le backfill FR consomme déjà ~4 req/s sur la même clé (limite documentée 5 req/s) ; le pilote ajoute < 1 req/s.
- Vérifier le quota/plan Geoapify avant d'étendre à 6 764 parcs (≈ 6 764 appels, 28 min à 4 req/s).

## 5. Contrôles avant / après (`scripts/osm/geoapify-pilot-check.py`, SELECT uniquement)
| Contrôle | Attendu |
|---|---|
| Parcs US hors pilote | empreinte identique (6 753 parcs) |
| Statuts de publication (US par statut) | inchangés (6 778 `published`, `unverified`) |
| Pilote : statut, vérification, nom, coordonnées, pays | inchangés |
| Provenance | chaque parc écrit : source `reverse_geocode` + attribut `address` courant complet (5 champs + extras US) ; aucune source US autre que `osm`/`reverse_geocode` |
| Format | `formatted_address` (vue) == `rue, ville, NY ZIP` attendu |
| Qualité (à relire) | `zip_invalide`, `sans_etat`, `etat_hors_NY`, `sans_ville`, `sans_rue`, `rue_ressemble_a_un_POI` |
| Erreurs / consommation | 0 erreur au journal ; appels comptés ≤ 25 par passe |
| **PROD** | parcs US (6 778 `pending`) : empreinte, statuts, fonctions `nearby_parks*` inchangés |

Critère de poursuite : tous les contrôles `OK` **et** revue humaine des 25 adresses (taux de POI, ZIP, État, boroughs). Le script a été
exécuté à vide (avant/après sans pilote) : 0 écrit, tous `OK`.

## 6. Le pilote ne peut modifier ni la publication ni PROD (vérifié par tests)
- SQL d'écriture : `update parks set address_line, postal_code, city, admin_area_1, admin_area_2, updated_at … where id = <parc>` ;
  `park_sources` (source `reverse_geocode`) ; `set_park_attribute_source`. **Jamais** `moderation_status`, `verification_status`,
  `operational_status`, `name`, coordonnées, `country_code`, `created_by` (test).
- Garde de priorité : `can_source_replace_attribute(…,'address','reverse_geocode')` à la sélection **et** à l'écriture ; parcs déjà traités jamais resélectionnés.
- `--env staging` ⇒ ref `hfuaouskwysqxiwpwvqy` en dur ; PROD exige 4 garde-fous cumulatifs (ref, drapeau, variable d'environnement, TTY)
  + phrase retapée ; la ref STAGING est refusée par `confirm_prod_commit` (test). Les parcs PROD (US `pending`) ne sont jamais ciblés.
- Les outils de contrôle n'exécutent que des SELECT (garde testée).

## 7. Risques
1. **POI dans `address_line`** (cf. §2) — qualité des adresses ; mesurée par le pilote.
2. **Boroughs** : `city = "New York"` pour Manhattan/Brooklyn/Queens/Bronx/Staten Island, le borough n'est que dans la provenance.
3. **Quota / limite 5 req/s** partagés avec le backfill FR (429 ⇒ retries/backoff, #125).
4. STAGING : parcs **publiés** ⇒ les adresses du pilote seront visibles dans l'app STAGING ; `audit_log` +25 (`parks_audit_upd`) ; `updated_at` bougé.
5. **Pas de rollback automatique** du backfill. Retour arrière du pilote (STAGING, sur autorisation) : remettre à `NULL` les 5 colonnes
   d'adresse des 25 ids de `before.json` et supprimer leurs lignes `park_attribute_sources` (attribut `address`) et `park_sources`
   (`reverse_geocode`) — requêtes à préparer à partir de `before.json` si besoin.
6. L'edge function `reverse-geocode` (ajout de parc) n'est pas redéployée : sans effet sur le pilote.
7. Clé Geoapify : absente de mon environnement (je n'ai pu ni voulu appeler l'API) ; à fournir dans ton terminal.

## 8. Verdict
**GO** pour le pilote de 25 parcs sur STAGING (dry-run puis commit) — **NO-GO** pour un enrichissement à grande échelle tant que la revue humaine
du pilote n'est pas faite. Rien ne touche PROD.
