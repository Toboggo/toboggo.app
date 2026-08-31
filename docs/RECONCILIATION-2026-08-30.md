# Réconciliation technique Toboggo — 2026-08-30

> **Statut de ce document.** Ceci est une **photographie technique datée du 30/08/2026**, pas une nouvelle source permanente de spécifications produit.
>
> - **Notion** = source des décisions produit et fonctionnelles validées.
> - **Repository + Supabase** = source de vérité de l'état réellement implémenté.
> - **Ce rapport** = photographie technique au 30/08/2026 (constat, pas contrat).
> - **`docs/architecture/database-migration.md`** reste la référence du chantier Database V2.
> - Les **recommandations, chantiers et ordres de priorité** de ce rapport ne sont **pas** automatiquement validés — ils doivent être arbitrés avec le fondateur avant exécution.
>
> Méthode : audit lecture seule. `supabase db dump --linked` (read-only) pour le schéma prod, `supabase inspect db` pour les volumétries, `supabase migration list --linked` pour la comparaison local/remote, lecture directe du code des 5 workspaces et des pages Notion listées. Aucune modification (fichier, migration, donnée Supabase, RLS, Markdown, Notion, dépendance, commit, branche).

---

## A. Résumé exécutif

1. **La base de données est en avance sur tout le reste.** La prod Supabase (`dfzrsygetbhnjzfssgub`) est **migrée V1→V2** (migrations `0001→0021`, `local == remote`), architecture mondiale géo-first, PostGIS actif, RLS sur les 30 tables (79 policies), coexistence V1/V2 assurée par 6 triggers `*_v1_compat`. Le chantier est documenté avec une rigueur exceptionnelle dans `docs/architecture/database-migration.md`.
2. **La prod ne contient que des données de démo** : 17 parcs, 2 organisations, 2 communes, 3 comptes staff/gestionnaire, 4 profils, 0 avis / 0 signalement / 0 photo. **Ni les « 2 400+ » ni les « 46 262 » parcs OSM ne sont en base.** L'import OSM n'a jamais eu lieu.
3. **MapLibre : décision Notion validée (30/08), implémentation = 0 %.** Le code utilise `mapbox-gl@3.7.0` dans 2 fichiers seulement. Aucune trace de MapLibre/MapTiler nulle part (code, `package.json`, `package-lock.json`, `node_modules`). Et actuellement `VITE_MAPBOX_TOKEN` est **vide** → l'app tourne en carte factice (`FakeMap` / « Carte indisponible »).
4. **Géocodage, reverse geocoding, routing/directions : inexistants.** Recherche = `ilike` sur une vue + liste de 7 villes en dur. Itinéraire = calcul haversine + vitesses fixes, « navigation » simulée.
5. **Météo : Open-Meteo, réellement câblé** (bannière d'alerte sur la carte). Notion recommandait OpenWeatherMap → **écart tranché de fait : Open-Meteo** (gratuit, sans clé, déjà en prod).
6. **Auth : socle réel** (Supabase Auth e-mail/mot de passe, reset, suppression de compte, back-office invite-gated par rôle). Google OAuth : code réel mais provider probablement non activé (compte Google non créé). Apple / téléphone : boutons « Bientôt disponible ».
7. **App Parents : ~70 % des écrans existent et sont branchés sur Supabase.** Back-office Collectivités : 9 écrans réels sur les 12 sections Notion. **Toboggo Admin : quasi inexistant** — le back-office est une seule app *role-routée* ; l'« admin » n'a qu'une vue filtrée des écrans collectivité + un écran de modération d'utilisateurs. **Aucune file de validation, aucun écran Imports / Data & Qualité / gestion Collectivités.**
8. **Dette documentaire concentrée sur le branding** : `TOBOGGO-BRAND-ASSETS-REFERENCE.md` (cité comme « source de vérité priorité 1 » par Notion **et** par `CLAUDE.md`) **n'existe pas dans le repo**. Le fichier réel est `docs/identite-visuelle-formats.md`. Sprite d'icônes modifié non commité (`ic-climb`, `ic-motor`).

**État général : socle back-end solide et prod-ready ; couche cartographique à refondre ; import de données à lancer ; expérience Admin à construire ; front V2 pas encore déployé/validé en browser réel par le fondateur.**

---

## B. État général du projet

| Couche | Maturité | Commentaire |
|---|---|---|
| Schéma BDD / migrations | 🟢 Prod V2 (0001→0021), figées, `local==remote` | Coexistence V1/V2 active ; legacy cleanup `0022+` interdit tant que le cutover front n'est pas confirmé |
| PostGIS / géospatial | 🟢 Actif en prod | `geography(Point/Polygon,4326)`, index GIST, `nearby_parks` / `find_duplicate_parks` en `ST_DWithin` |
| Données parcs | 🔴 17 parcs de démo | Pipeline OSM (46 262) testé sur échantillon Rennes, jamais exécuté ; clé API IA non branchée |
| RLS / rôles | 🟢 30 tables, 79 policies | 5 rôles (`super_admin, moderation, support, gestionnaire, contributeur`) ; dettes RLS de coexistence documentées et corrigées (0020/0021) |
| Auth | 🟡 Socle OK | Social login Apple/Google non finalisé ; pas de vérif téléphone |
| App Parents (mobile) | 🟡 Prototype fonctionnel | Carte factice sans token ; recherche/itinéraire simplifiés ; contributions « proposer modif » non branchées |
| Back-office Collectivités | 🟡 9/12 sections | CRUD réel Supabase ; manque Contrôles, Informations à vérifier, Messages ; Rapports = PDF minimal dans Paramètres |
| Toboggo Admin | 🔴 ~15 % | Pas de file de validation, pas d'imports, pas de gestion collectivités dédiée |
| Cartographie (moteur + fournisseurs) | 🔴 Mapbox résiduel, MapLibre absent | Décision produit prise, migration technique = 0 |
| Météo | 🟢 Open-Meteo câblé | Écart Notion (OpenWeatherMap) à acter |
| Design system | 🟢 Tokens conformes Notion | Sprite 47 symboles ; edits non commités ; doc de référence mal nommée |
| Landing | 🟢 Statique, marque conforme | Liens stores = `#`, `config.js` = placeholder, stats en dur |
| Paiement / Push / i18n / stores | 🔴 Non commencé | Explicitement différé dans `IMPLEMENTATION.md` |

---

## C. Tableau maître

| Domaine | Cible Notion | État réel (code + Supabase) | Statut | Écart |
|---|---|---|---|---|
| **Moteur carte** | MapLibre — 🔵 Validé/à implémenter ; Mapbox ⚫ obsolète | `mapbox-gl@3.7.0` dans `apps/mobile/src/screens/map/MapCanvas.tsx` + `apps/backoffice/src/screens/MapScreen.tsx` ; MapLibre = 0 occurrence | 🔵 non implémenté | **Total.** Rien fait. Token Mapbox vide → carte factice active |
| **Fournisseur tuiles/styles** | Non tranché (MapTiler ?) | `style: "mapbox://styles/mapbox/streets-v12"` en dur | ⚠️ à trancher | Dépend d'une clé Mapbox absente |
| **Géocodage / reverse** | Non tranché (Nominatim listé) | Aucun. `searchParks()` = `ilike` sur `park_public` + `CITIES[]` (7 villes en dur, `apps/mobile/src/lib/geo.ts`) | 🔵 non implémenté | Pas de recherche d'adresse réelle |
| **Directions / routing** | Non tranché (Mapbox Directions écarté) | `apps/mobile/src/screens/detail/Directions.tsx` : haversine + vitesses fixes (4.8/15/30 km/h), nav simulée | 🔵 non implémenté | Aucun provider |
| **PostGIS** | ⚠️ À confirmer | **Actif en prod** : `geography`, index GIST (`parks_geom_idx`, `parks_location_idx`, `parks_boundary_idx`), `ST_DWithin`/`ST_Distance` | ✅ actif | Notion en retard sur la réalité |
| **Modèle Park relationnel** (EQUIPMENT/SERVICES/ACCESSIBILITY/FEATURES/SAFETY) | 🔵 Validé (spécification) | **Implémenté** : `features` (25 lignes, `feature_category` enum) + `park_features` (182 lignes) + vue `park_public` qui reprojette la forme plate | ✅ implémenté (structure) | Catalogue `features` seedé mais partiel vs la spec Notion ; 49/182 en `unknown` |
| **Base V1/V2** | Doc « à compléter » | **Prod = V2** `0001→0021`, coexistence active | ✅ migré | Notion TECH dit « aucun schéma SQL » → très en retard |
| **Import données OSM** | 🟡 En cours (46 262 nettoyés) | 0 ligne importée ; agent testé sur 4 parcs Rennes ; clé API IA non branchée | 🟡 en cours (hors repo) | Écart 17 vs 2 400+ vs 46 262 non résolu |
| **Auth e-mail / reset / suppression compte** | 🔵 Validé | Réel (`packages/shared/src/api/auth.ts`, RPC `delete_own_account`) | ✅ implémenté | — |
| **Google OAuth** | Possible via Supabase Auth | Code réel (`signInWithGoogle`) ; provider non activé (compte Google « non créé » Notion) | 🟡 partiel | Credentials + activation dashboard manquants |
| **Apple / téléphone** | — | Boutons « Bientôt disponible » | 🔵 non implémenté | Conforme au différé assumé |
| **Séparation rôles serveur** | 🔵 Validé (utilisateur/collectivité/staff) | RLS 79 policies, helpers `is_toboggo_staff/_admin`, `manages_park`, `can_edit_park`, `org_role` ; `team_role` = 5 valeurs | ✅ implémenté | 5 rôles réels ≠ 3 rôles nommés dans Notion (à documenter) |
| **App Parents — carte / liste / fiche / score / avis / signalement / favoris / ajout** | 🔵 Validé | Écrans présents et branchés (détail §I) | 🟡 partiel | Carte factice ; « proposer modif » non branché |
| **BO Collectivités — 12 sections** | 🔵 Validé | 9 écrans réels ; manque Contrôles, Infos à vérifier, Messages | 🟡 partiel | 3 sections absentes + Rapports minimal |
| **Toboggo Admin — file de validation, imports, modération, collectivités** | 🔵 Validé (spécification) | `park_edits` + RPC `find_duplicate_parks` en DB, **0 UI**, 0 appel dans `apps/` | 🔵 non implémenté | Écart majeur |
| **Météo fiche parc** | ⚠️ À réconcilier (OpenWeatherMap reco) | Open-Meteo réel (`packages/shared/src/utils/weather.ts`), câblé dans `MapExplore.tsx` | ✅ implémenté (Open-Meteo) | Écart Notion → acter Open-Meteo |
| **Design tokens / logo / typo** | 🔵 Validé | `tokens.css` conforme aux hex Notion ; Fredoka/Nunito ; logo « courbe à droite » | ✅ conforme | Dark mode non validé visuellement ; sprite non commité |
| **Catégories de signalement** | 2 officielles (dégradation, info erronée) ; 5 en exploration | Enum DB + code = **7** (`broken_equipment, safety, cleanliness, vegetation, accessibility, wrong_info, other`) | ⚠️ à confirmer | Code va plus loin que les 2 spécifiées ET que les 5 explorées |
| **Push notifications** | À trancher (OneSignal/FCM) | Table `notifications` in-app uniquement ; aucun SDK push | 🔵 non implémenté | — |
| **Stripe billing** | Décidé par défaut | Aucun code | 🔵 non implémenté | Différé assumé |

---

## D. Audit Mapbox → MapLibre

### A. Où Mapbox apparaît

| Emplacement | Détail |
|---|---|
| `apps/mobile/package.json` | `"mapbox-gl": "^3.7.0"` (dep) + `"@types/mapbox-gl": "^3.4.0"` (devDep) |
| `apps/backoffice/package.json` | idem |
| `package-lock.json` | `node_modules/mapbox-gl` (lignes 28, 83, 4896) — **installé** dans `node_modules/mapbox-gl` |
| Imports | `apps/mobile/src/screens/map/MapCanvas.tsx` (`import mapboxgl from "mapbox-gl"` + `"mapbox-gl/dist/mapbox-gl.css"`) ; `apps/backoffice/src/screens/MapScreen.tsx` (idem) |
| Composants | **2** : `MapCanvas` (mobile, carte d'exploration) ; `MapScreen` (back-office, carte des parcs de la commune) |
| Hooks / helpers / services | **Aucun** — pas de wrapper, appels directs à `new mapboxgl.Map(...)`, `mapboxgl.Marker`, `mapboxgl.NavigationControl` |
| CSS | seul `mapbox-gl/dist/mapbox-gl.css` importé par les 2 composants |
| Tokens (design) | aucun token carto |
| Env vars | `VITE_MAPBOX_TOKEN` dans `.env`, `.env.example`, `.env.local`, `supabase/README.md`, `IMPLEMENTATION.md` — **valeur vide partout** |
| Style / tiles | `"mapbox://styles/mapbox/streets-v12"` en dur dans les 2 fichiers |
| Directions API | **jamais utilisée** — `Directions.tsx` fait du calcul local (haversine) |
| Géocodage / reverse | **jamais utilisé** |
| Documentation | `IMPLEMENTATION.md` (« Mapbox maps » listé en « Real ») ; `supabase/README.md` ; `docs/identite-visuelle-formats.md` (couleurs) ; `docs/architecture/database-migration.md` (mentions env) |
| Fallback | `apps/mobile/src/screens/map/FakeMap.tsx` (grille factice) rendu si `!TOKEN` ; back-office affiche « Carte indisponible : renseignez VITE_MAPBOX_TOKEN » |

### B. Analyse par dépendance

| Dépendance | Utilisée réellement ? | Historique ? | Bloquante MapLibre ? | Remplaçable ? | Refonte ? |
|---|---|---|---|---|---|
| `mapbox-gl` | Oui, mais **inactive faute de token** (FakeMap sert) | Choix initial du handoff | Non (à retirer en même temps) | Oui — `maplibre-gl` a une API quasi 1:1 (`Map`, `Marker`, `NavigationControl`, `flyTo`) | **Faible** : ~2 fichiers, ~60 lignes chacun. Changements : import, `accessToken` → supprimé, `style:` → URL de style MapLibre/vector, retrait `mapbox://` |
| `@types/mapbox-gl` | Types uniquement | idem | Non | Oui (`maplibre-gl` embarque ses types) | Nul |

### C. État de MapLibre

- Déjà installé : **❌**
- Dans `package-lock.json` : **❌** (0 occurrence `maplibre`)
- Importé : **❌**
- Partiellement utilisé : **❌**
- Complètement absent : **✅ oui, à 100 %**

### D. Architecture cartographique ACTUELLE (constat, sans proposition)

| Maillon | Implémentation réelle |
|---|---|
| Rendu carte | `mapbox-gl` GL JS, instancié dans `MapCanvas` (mobile) et `MapScreen` (BO). **Sans token → `FakeMap` / message d'indisponibilité.** |
| Fournisseur style/tuiles | Mapbox Studio, style `streets-v12` en dur. Aucun compte configuré. |
| Source POI / parcs | Supabase : vue `park_public` (lecture) + RPC PostGIS `nearby_parks(p_lat, p_lng, p_radius_m=20000)` pour le « autour de moi ». Markers HTML positionnés via `park.lat/lng`. |
| Géocodage (adresse → coord) | **Aucun.** `searchParks(query)` = `park_public` filtré `ilike` sur `name/city/address_line` + `CITIES[]` (7 villes codées en dur avec lat/lng). |
| Reverse geocoding (coord → adresse) | **Aucun.** `createPark` exige `latitude`/`longitude` fournis ; `address_line` saisi à la main ; `formatted_address` recomposé par SQL (`concat_ws`). |
| Directions / routing | **Aucun provider.** `Directions.tsx` : `haversineMeters()` × vitesse fixe par mode → ETA ; bouton « Démarrer la navigation » purement visuel. |
| Recherche géographique | Navigateur `navigator.geolocation` (`requestBrowserLocation`) ; sinon centre par défaut Lyon (`45.764, 4.8357`) ou ville choisie dans `CITIES[]`. |
| Stockage géospatial | **PostGIS en prod** : `parks.geom` + `parks.location` = `geography(Point,4326)` générés (STORED) ; `parks.boundary` = `geography(Polygon,4326)` ; `park_zones.boundary`, `park_entrances.location`, `communes.boundary`. Index GIST sur les 3 colonnes de `parks`. |

---

## E. Architecture Maps / GEO actuelle (synthèse)

```
[Navigateur GPS ou CITIES[7] en dur]
        │  lat/lng
        ▼
Supabase RPC nearby_parks(lat,lng,20km)  ──ST_DWithin(geography)──►  parks (17)
        │  lignes plates + features jsonb
        ▼
apps/mobile MapExplore ──► MapCanvas (mapbox-gl, sans token ⇒ FakeMap)
                     └──► ParkList / ParkPreview (tri distance = haversine côté client)

Recherche : searchParks() = park_public ILIKE  (pas de géocodeur)
Itinéraire : haversine + vitesse fixe          (pas de routeur)
Météo      : api.open-meteo.com (fetch direct, sans clé)  ──► bannière alerte MapExplore
```

Fournisseurs externes réellement appelés au runtime : **Open-Meteo uniquement**. Mapbox : chargé mais inerte (pas de token).

---

## F. Audit PostGIS / GEO

| Élément | Statut | Preuve |
|---|---|---|
| Extension PostGIS | ✅ actif en prod | type `public.geography` utilisé ; `spatial_ref_sys` présent (208 kB, 8705 index scans) ; `ST_SetSRID/ST_MakePoint` dans colonnes générées |
| `geography` vs `geometry` | ✅ `geography(Point/Polygon,4326)` partout (pas de `geometry`) | `parks.geom`, `parks.location`, `parks.boundary`, `park_zones.boundary`, `park_entrances.location`, `communes.location/boundary` |
| Colonnes lat/lng | ✅ présentes (coexistence) | `parks.lat/lng` (double precision, V1) **et** `parks.latitude/longitude` (numeric(9,6), V2) ; `location` GENERATED depuis `latitude/longitude`, `geom` GENERATED depuis `lng/lat` |
| Index GIST | ✅ 3 sur `parks` | `parks_geom_idx`, `parks_location_idx`, `parks_boundary_idx` (tous `USING gist`) — **0 index scan** à ce jour (peu de données/trafic) |
| `ST_DWithin` | ✅ actif | `nearby_parks`, `find_duplicate_parks` (tri par distance + score) |
| `ST_Distance` | ✅ actif | `nearby_parks`, `find_duplicate_parks` |
| RPC / fonctions spatiales | ✅ 2 | `nearby_parks(lat,lng,radius)` → retour élargi V2 (superset) ; `find_duplicate_parks(lat,lng,name,radius,exclude)` → PostGIS + `pg_trgm` (`similarity`) |
| Vues géographiques | ✅ `park_public` | `security_invoker=true`, expose `location`/`boundary` + reprojette la forme plate + `features` jsonb + `score` |
| `park_public` | ✅ actif en prod | vue, pas matérialisée ; agrège `park_features`, `park_media` (approved), `park_names`, `park_scores` |
| Recherche par rayon | ✅ back-end / 🟡 front | `nearby_parks` OK ; le front l'appelle avec radius par défaut 20 km, puis re-filtre âge/équipements côté client |
| Tri par distance | 🟡 mixte | `nearby_parks` renvoie `distance_m` (PostGIS) ; certains écrans re-trient en `haversine` client (`apps/mobile/src/lib/geo.ts`, `Directions.tsx`) |
| `find_duplicate_parks` (dédup §11) | 🔵 prévu, DB prête, **0 appel** | RPC existe + grant `authenticated` ; `packages/shared/src/api/contributions.ts::findDuplicateParks` existe mais **aucun call site dans `apps/`** |
| `pg_trgm` | ✅ actif | `parks_name_trgm_idx` (GIN trigram, 0 scan) + `pg_trgm` requis par 0007 |

Observations non bloquantes (identiques avant/après migration, cf. doc) : `spatial_ref_sys` RLS off (comportement PostGIS standard) ; certains helpers V1 `SECURITY DEFINER` sans `search_path` (les V2 sont pinnés).

---

## G. Audit Database V1 / V2

### Migrations

| Emplacement | Contenu | Statut |
|---|---|---|
| `supabase/migrations/0001→0006` | V1 historique (schéma plat, RLS V1, storage, suppression compte, contact_messages, modération users) | ✅ appliquées prod |
| `supabase/migrations/0007→0019` | V2 incrémental (enums, organizations, +21 colonnes parks, features, media, 11 tables filles, reviews, reports, audit, org columns, fonctions+vue, RLS V2, grants) | ✅ appliquées prod |
| `supabase/migrations/0020` | `fix_v2_runtime_compat` — corrections runtime coexistence (D1/D2/D3), **non destructif** | ✅ appliquée prod |
| `supabase/migrations/0021` | `fix_remaining_v2_rls` — RLS coexistence `reports_*` + `reviews_update` (P5C-2/P5C-3), **non destructif** | ✅ appliquée prod |
| `supabase/migrations-v2-draft/0001→0005` | Architecture cible **from-scratch, référence uniquement** | ⚠️ **NE PAS appliquer** |
| `supabase/_archive_migrations_pre_pdf/0001→0006` | Copie d'archive des 6 V1 (SHA identiques) | référence |
| `0022+` legacy cleanup destructif | Non écrit | ⛔ **interdit** tant que le cutover front V2 n'est pas confirmé par le fondateur |

### Local vs Remote

`supabase migration list --linked` : **`local == remote` pour `0001` à `0021`** (21/21). Aucun écart. Prod = `dfzrsygetbhnjzfssgub`, région eu-west-1, PG 17.6, `ACTIVE_HEALTHY`. Un 2ᵉ projet existe (`Toboggo Staging`, `hfuaouskwysqxiwpwvqy`) — **non lié**, conservé actif pour la validation post-cutover.

### PROD ACTUELLE vs MIGRATIONS PRÊTES vs DRAFT vs DOCUMENTATION

| | Contenu |
|---|---|
| **PROD ACTUELLE** | Schéma V2 complet + colonnes/tables V1 conservées + 6 triggers `*_v1_compat`. Données : **démo uniquement** (voir volumétrie ci-dessous). |
| **MIGRATIONS PRÊTES** | = PROD (tout est appliqué). Rien en attente. Prochaine migration possible = `0022+` mais **interdite** aujourd'hui. |
| **DRAFT** | `migrations-v2-draft/` : cible from-scratch, sert de spec + cible pour `supabase gen types` post-cutover. Divergences volontaires avec la prod (pas de coexistence). |
| **DOCUMENTATION** | `docs/architecture/database-migration.md` (1338 lignes) = source de vérité du chantier, à jour au 30/08 (Phases 6A/6B/6C = PASS). `supabase/README.md` décrit la **cible draft**, pas l'état incrémental réel → légèrement trompeur pour un nouvel arrivant. |

### Volumétrie prod réelle (`supabase inspect db table-stats`)

| Table | Lignes | | Table | Lignes |
|---|--:|---|---|--:|
| parks | **17** | | features | 25 |
| park_features | 182 | | organizations | 2 |
| communes | 2 | | organization_parks | 6 |
| profiles | 4 | | team_members | 3 |
| reviews | **0** | | reports | **0** |
| park_media | 0 | | maintenance | 0 |
| notifications | 0 | | groups / group_members | 0 |
| park_zones / park_entrances / park_equipment / park_scores / park_edits / audit_log / park_names / external_ids | 0 | | | |

→ **Le modèle relationnel EQUIPMENT/SERVICES/ACCESSIBILITY/FEATURES/SAFETY existe réellement** (tables + enum `feature_category` + vue), **partiellement peuplé** : 182 liens `park_features` issus du backfill des 17 parcs (dont 49 en `unknown`, 0 en `unavailable` — décision §5 du doc : jamais `false → unavailable`). Catalogue `features` = 25 codes seedés, sous-ensemble de la spec Notion complète.

### Tables demandées — présence

| Table Notion | En prod ? |
|---|---|
| parks, park_public, park_features, features | ✅ |
| organizations, team_members, profiles, communes | ✅ (`communes` = table V1 miroir conservée, non canonique V2) |
| reports, reviews | ✅ (0 ligne) |
| maintenance / interventions | ✅ table `maintenance` (0 ligne) ; « Contrôles »/« Interventions » comme concepts distincts : ❌ |
| notifications | ✅ (in-app, 0 ligne) |
| imports / source data | 🟡 `park_sources`, `external_ids`, `park_attribute_sources` (provenance) existent, vides ; pas de table « job d'import » |
| park_zones, park_entrances, park_equipment, park_opening_hours, park_edits, park_scores, park_duplicate_candidates, audit_log, park_media, park_names | ✅ (toutes vides) |
| groups / group_members (social) | ✅ (0 ligne) |

---

## H. Audit Auth / Rôles / RLS

| Élément | Statut | Détail |
|---|---|---|
| Supabase Auth | ✅ vérifié | `packages/shared/src/supabaseClient.ts` (`persistSession`, `autoRefreshToken`) |
| E-mail / mot de passe | ✅ vérifié | `signUp` / `signIn` ; mobile `AuthForm.tsx`, BO `Login.tsx` |
| Reset mot de passe | ✅ vérifié | `sendPasswordReset` → `resetPasswordForEmail` ; UI mobile « Mot de passe oublié ? » |
| Suppression de compte | ✅ vérifié | RPC `delete_own_account()` + `auth.signOut()` |
| Google OAuth | 🟡 partiel | `signInWithGoogle` (`signInWithOAuth({provider:'google'})`) codé, appelé (`LoginMethod`, `AuthForm`) ; **provider à activer côté dashboard** (compte Google « non créé » dans Notion Stack) ; BO n'a **pas** de bouton Google |
| Apple | 🔵 spécifié absent | bouton → toast « Bientôt disponible » |
| E-mail/téléphone (SMS) | 🔵 spécifié absent | bouton → « Bientôt disponible » ; Notion : Twilio/Vonage « à différer » |
| `profiles` | ✅ vérifié | `getOrCreateProfile`, `updateProfile`, `favorites uuid[]`, `suspended`, `dark_mode` |
| `organizations` | ✅ vérifié | remplace `communes` ; `type`, `country_code`, `verified` |
| `team_members` | ✅ vérifié | `organization_id NULL` = staff Toboggo ; `unique(organization_id,email)` + `unique(commune_id,email)` |
| Staff Toboggo | ✅ vérifié | `is_toboggo_staff` / `is_toboggo_admin` = `organization_id IS NULL` ; tous droits via `manages_park(*)` |
| Collectivités | ✅ vérifié | `org_role`, `is_org_member`, `is_org_gestionnaire`, `manages_park` (join `organization_parks` × `team_members`) |
| Rôle utilisateur | ✅ vérifié | enum `team_role(super_admin, moderation, support, gestionnaire, contributeur)` — **5 rôles**, Notion n'en nomme que 3 familles |
| `orgSession` | ✅ vérifié | `apps/backoffice/src/lib/orgSession.ts` : charge `team_members` + `organizations`, calcule `activeOrg` (`admin` \| `commune`), sélecteur multi-org, `accessDenied` si 0 membership |
| Routing selon rôle | 🟡 partiel | `App.tsx` : `!userId → Login` ; `accessDenied → AccessDenied` ; nav `adminItems` vs `communeItems` (`Shell.tsx`). **Dette M2** : nav collectivité non filtrée par rôle (un contributeur voit Entretien/Journal/Stats) |
| Protection des routes | 🟡 partiel | Garde au niveau app (pas de compte → Login) ; pas de garde par route/rôle côté React — la sécurité repose sur la RLS |
| `service_role` | ✅ vérifié | jamais exposée côté client ; `.env` = `anon` uniquement ; écritures `park_duplicate_candidates` réservées `service_role` |
| RLS | ✅ vérifié | **activée sur les 30 tables du schéma `public`**, **79 policies** |
| Policies | ✅ vérifié | par rôle ; coexistence : branches V1 `commune_id` conservées à côté des branches V2 `organization_parks` (0020/0021) |
| Storage policies | ✅ vérifié (0004) | buckets `park-photos`, `avatars`, `report-photos` + policies ; **0 objet** en prod |
| `SECURITY DEFINER` | ✅ vérifié | 13 fonctions V2 avec `SET search_path = public, pg_temp` ; `recalculate_park_score` = `SECURITY INVOKER` (moindre privilège) ; **résiduel** : `link_team_member_on_signup` V1 corrigé en 0020 (`search_path=''`) |
| `organization_parks` faille | ✅ corrigée | trigger `organization_parks_guard` (BEFORE UPDATE) empêche un non-staff de réaffecter un parc |
| Dettes RLS ouvertes | ⚠️ | M5 : `flagReview()` (signalement d'un avis par un tiers) non fonctionnel sous `reviews_update` — rows=0 silencieux |

Comparaison avec Notion 🔐 AUTH & PERMISSIONS : Notion dit « à compléter / non vérifié techniquement » → **le code est très en avance** ; la séparation serveur exigée (« pas uniquement par l'interface ») est **réellement en place** (RLS + helpers + tests multi-org documentés Phases 5B/5C).

---

## I. Audit App Parents

| Fonctionnalité | Fichier(s) | Statut | Notes |
|---|---|---|---|
| Onboarding / splash | `screens/onboarding/Splash.tsx`, `Permissions.tsx` | ✅ implémenté & vérifié | permissions GPS via `navigator.geolocation` |
| Connexion | `onboarding/LoginMethod.tsx`, `AuthForm.tsx` | ✅ (e-mail) / 🟡 (Google) / 🔵 (Apple, tel) | mode guest par défaut ; `requireAccount()` = login juste-à-temps + resume |
| Carte | `screens/map/MapExplore.tsx`, `MapCanvas.tsx`, `FakeMap.tsx` | 🟡 partiellement implémenté | **carte factice active** (token Mapbox vide) ; markers colorés par score |
| Liste parcs | `map/ParkList.tsx` | ✅ implémenté & vérifié | tri distance (haversine client) |
| Recherche | `map/SearchOverlay.tsx` | 🟡 partiel | `ilike` sur `park_public` + `CITIES[7]` ; recherches récentes en `localStorage` ; **pas de géocodeur** |
| Filtres | `map/FiltersSheet.tsx`, `lib/filters.ts` | ✅ implémenté | âge, ombre, WC, clôture, PMR, bancs, eau, parking — filtrés client après `nearby_parks` |
| Preview parc | `map/ParkPreview.tsx` | ✅ implémenté | bottom sheet |
| Fiche parc | `screens/detail/ParkDetail.tsx` + `DetailAmenities`, `DetailPhotos`, `DetailReviews` | ✅ implémenté & vérifié | lit `park_public` (features jsonb) |
| Toboggo Score | `detail/ScoreDetail.tsx` | 🟡 structure OK, **données vides** | `park_public.score` ← `park_scores` (0 ligne en prod) ; RPC `recalculate_park_score` jamais appelée |
| Équipements / services | `detail/DetailAmenities.tsx`, `lib/equipmentIcons.ts` | ✅ implémenté | mapping features → icônes sprite |
| Itinéraire | `detail/Directions.tsx` | 🟡 simplifié | haversine + vitesse fixe ; « navigation » simulée ; étapes (`Boulangerie/Parking/Point d'eau`) en dur |
| Favoris | `screens/favorites/Favorites.tsx`, `Compare.tsx` | ✅ implémenté | `profiles.favorites uuid[]` |
| Avis | `detail/DetailReviews.tsx`, `actions/RatePark.tsx` | ✅ implémenté & vérifié | `createReview` (V2 `rating`, trigger remplit `stars`) ; 0 avis en prod |
| Notation (sous-notes) | `actions/RatePark.tsx` | ✅ implémenté | `cleanliness/safety/equipment/comfort` + `recommended_min/max_age` |
| Signalement | `actions/ReportProblem.tsx` | ✅ implémenté & vérifié | **7 motifs** (enum DB) vs 2 officiels Notion → à réconcilier |
| Ajout de parc | `actions/AddPark.tsx` | 🟡 implémenté avec dette | `createPark` OK ; **dette D4** : équipement non coché → `park_features.status='unavailable'` (devrait rester `unknown`) ; **pas d'appel `findDuplicateParks`** |
| Proposer une modification | — | 🔵 non implémenté | API `submitParkEdit` existe, **0 call site** ; `MoreActions.tsx` ne l'expose pas |
| Profil / compte | `screens/profile/*` (Profile, EditProfile, Display, Privacy, Legal, Help, Contact) | ✅ implémenté & vérifié | suppression de compte réelle |
| Notifications | `profile/NotifCenter.tsx`, `NotifResolved.tsx`, `NotificationPrefs.tsx` | 🟡 in-app uniquement | table `notifications` ; **aucun push** (pas de SDK OneSignal/FCM) |
| Social / groupes | `screens/social/GroupOuting.tsx` | ✅ implémenté | `createGroup/joinGroup/leaveGroup` réels ; tables `groups`/`group_members` |
| Contributions / activité | `screens/contributions/Contributions.tsx`, `Activity.tsx` | ✅ implémenté | lit `audit_log` / `park_edits` de l'utilisateur |
| Météo | `lib/weather.ts`, `MapExplore.tsx` | ✅ implémenté & vérifié | Open-Meteo, bannière d'alerte (chaleur/pluie/vent) |

---

## J. Audit Back-office Collectivités

| Écran Notion | Route / fichier réel | Données réellement utilisées | Fonctionnel ou démo ? | Rôle nécessaire | Statut |
|---|---|---|---|---|---|
| Dashboard | `/` `screens/Dashboard.tsx` | `listParks/listReports/listReviews/listActivity` (scopés commune) | Fonctionnel (Supabase) | membre | ✅ (variante admin/commune) |
| Mes parcs | `/parks` `screens/Parks.tsx` + `ParkModal.tsx` | `listParks`, `setParkStatus`, `createPark`, `parseCsv` (import CSV), `logActivity` | Fonctionnel ; CRUD + import/export CSV | lecture: membre / écriture: `gestionnaire`+ | ✅ (bug P5C-1 corrigé en `e0712f8`) |
| Carte | `/map` `screens/MapScreen.tsx` | `listParks`, `listReports` + Mapbox | 🟡 **carte factice** (token vide) ; modales parc/signalement OK | membre | 🟡 |
| Signalements | `/reports` `screens/Reports.tsx` + `ReportModal.tsx` | `listReports`, `resolveReport`, `dismissReport`, `reopenReport` | Fonctionnel ; 0 donnée en prod | lecture: membre / traitement: `gestionnaire`+ | ✅ (RLS 0021) |
| Interventions | — | — | ❌ absent (concept distinct non implémenté) | — | 🔵 |
| Contrôles | — | — | ❌ absent | — | 🔵 |
| Informations à vérifier | — (partiellement : `verification_status` sur parcs, pas d'écran) | — | ❌ pas d'écran dédié | — | 🔵 |
| Avis | `/reviews` `screens/Reviews.tsx` | `listReviews`, `replyToReview`, `deleteReview` | Fonctionnel ; 0 donnée | lecture: membre / réponse: `gestionnaire`+ | ✅ (RLS 0021) |
| Messages | — | table `contact_messages` existe (landing) ; **pas d'écran BO** | ❌ absent | — | 🔵 |
| Statistiques | `/statistiques` `screens/Statistiques.tsx` | agrégats `parks/reports/reviews/activity` + export CSV | Fonctionnel (calculs client) | membre | ✅ |
| Rapports | *dans* `/settings` (bouton « Rapport mensuel PDF », `jsPDF`) | `listParks/reports/reviews` | Minimal (PDF 1 page) ; pas d'écran dédié | `gestionnaire`+ | 🟡 |
| Équipe | *dans* `/settings` + `InviteModal.tsx` | `listTeam`, `inviteTeamMember` (`signInWithOtp`), `removeTeamMember` | Fonctionnel | `gestionnaire`+ (ou admin) | ✅ |
| Réglages | `/settings` `screens/Settings.tsx` | `updateCommune` (nom, e-mail, `email_notif`) | Fonctionnel | `gestionnaire`+ | ✅ |
| Entretien (bonus, hors liste Notion) | `/maintenance` `screens/Maintenance.tsx` + `MaintenanceModal.tsx` | `listMaintenance/createMaintenance/completeMaintenance` | Fonctionnel ; **dette M2** (contributeur peut éditer) | membre commune | ✅ |
| Journal (bonus) | `/journal` `screens/Journal.tsx` | `listActivity`, `listTeam` | Fonctionnel | membre | ✅ |

Onboarding pilote (5 étapes RDV→publication→suivi) : **process documenté, aucun support logiciel** (pas d'écran d'onboarding collectivité).

---

## K. Audit Toboggo Admin

Le back-office est **une seule application role-routée** (`apps/backoffice`). Il n'existe pas de surface « Admin » séparée : quand `activeOrg.type === "admin"`, l'utilisateur voit `adminItems` (Tableau de bord, Parcs, Signalements, Utilisateurs, Avis, Paramètres) — soit des **variantes filtrées** des mêmes écrans collectivité.

| Section Notion Admin | Réalité code | Statut |
|---|---|---|
| Administration générale / supervision plateforme | Dashboard admin (agrégats globaux) | 🟡 minimal |
| Gestion des utilisateurs | `/users` `screens/Users.tsx` : liste, recherche, suspend/réactiver (`setUserSuspended` → `profiles.suspended`), export CSV | ✅ implémenté (basique) |
| Gestion des collectivités | ❌ aucun écran (création d'`organizations` = SQL manuel, cf. `supabase/README.md`) | 🔵 non implémenté |
| Gestion des parcs | `/parks` (même écran, onglets `pending/published/rejected`) | 🟡 partiel |
| Modération | via `flagReview`/`deleteReview` (écran Avis) ; **pas d'écran modération dédié** ; OpenAI Moderation API : non intégrée | 🔵 non implémenté |
| Qualité des données | ❌ aucun écran ; constats (84,8 %, 34,4 %) vivent hors repo | 🔵 non implémenté |
| **File de validation** | **DB prête, 0 UI** — voir ci-dessous | 🔵 non implémenté |
| Gestion des signalements | `/reports` (même écran) | 🟡 partiel |
| Gestion des imports | ❌ aucun écran ; tables `park_sources`/`external_ids`/`park_attribute_sources` vides | 🔵 non implémenté |
| Configuration | ❌ | 🔵 non implémenté |

### File de validation (EXISTANT → PROPOSITION → SOURCE → confiance → actions)

| Brique | État |
|---|---|
| Table `park_edits` (`changes jsonb`, `status`, `reviewed_by`, `review_note`, `reviewed_at`) | ✅ en DB, **0 ligne** |
| RLS `park_edits` (parents proposent, staff/org valident via `manages_park`) | ✅ en DB |
| API `submitParkEdit` / `listParkEdits` / `reviewParkEdit` (`packages/shared/src/api/contributions.ts`) | ✅ code présent |
| Appels dans `apps/` | ❌ **zéro** (ni mobile ni back-office) |
| Comparaison EXISTANT/PROPOSITION/SOURCE | ❌ pas d'UI |
| Niveau de confiance | 🟡 concept en DB (`verification_status`, `park_attribute_sources.confidence`) ; pas exploité |
| RPC dédup `find_duplicate_parks` (§11) | ✅ en DB + `findDuplicateParks` en shared ; ❌ 0 appel |
| Conflits d'import | 🔵 `park_duplicate_candidates` (table, RLS staff) vide ; pas de pipeline |

→ **La file de validation est spécifiée + entièrement câblée côté base, mais rien n'est codé côté produit** (BO_PARK_EDIT_ACTION = NOT_IMPLEMENTED, confirmé Phase 5C).

---

## L. Audit Design / Brand

| Élément | Référence (Notion / brand-assets) | Repo | Statut |
|---|---|---|---|
| Couleurs | `#2FA37C, #1F7D5F, #FFB020, #4C9EEB, #FFF8EC, #24303A, #8A8578` | `packages/design-system/src/tokens.css` + `apps/landing/styles.css` — **identiques** | ✅ conforme |
| Dark mode | tokens dérivés auto le 29/08, non validés visuellement | présents dans `tokens.css` (`@media prefers-color-scheme` + `[data-theme]`) | 🟡 non validé fondateur |
| Typo | Fredoka (titres) + Nunito (corps), Google Fonts | `--font-heading`/`--font-body` ; landing charge les 2 familles | ✅ conforme |
| Logo (composant) | tracé « montant → glissière **à droite**, boule amber » | `packages/design-system/src/components/Logo.tsx` (`<Logo/>`/`<LogoMark/>`) ; landing = SVG inline dupliqué (nav+footer) — sens conforme | ✅ conforme |
| Espacements / rayons / ombres | `--space-1..8` (pas de `-7`), `--radius-xs..pill`, `--shadow-sm/md/lg` | `tokens.css` — conforme au tableau Notion | ✅ conforme |
| Sprite d'icônes | 47 symboles, `stroke="currentColor"`, 3 copies | `packages/design-system/src/icons/icons-sprite.svg` + `apps/mobile/public/` + `apps/backoffice/public/` — **3 copies identiques** (md5 `f82ee991…`) | ✅ synchronisées |
| `IconName` (Icon.tsx) | à régénérer si sprite change | 47 entrées, cohérent avec le sprite | ✅ |
| **Sprite non commité** | doc migration : « NE PAS toucher, NE PAS stager » | `git status` : 3× `icons-sprite.svg` modifiés (edits `ic-climb`, `ic-motor`) non commités | ⚠️ working tree sale |
| Favicons / app icons | régénérés 29/08 depuis fichiers réels | `apps/*/public/` : `favicon.svg`, `apple-touch-icon.png`, `icon-192/512.png` (mobile), landing `assets/` | ✅ présents |
| `docs/brand-assets/` | 9 visuels PNG + « SVG » (= PNG encapsulés) | présents (`01`→`09`) | ✅ |
| **`TOBOGGO-BRAND-ASSETS-REFERENCE.md`** | cité « source de vérité priorité 1 » par Notion 🎨 DESIGN **et** par `CLAUDE.md` | **ABSENT du repo** — seul `docs/identite-visuelle-formats.md` existe | 🔴 divergence doc |
| `docs/Toboggo-Brand-Guidelines.pdf` | doc éditorial (artifact `b93e1fc5…`) | présent, **non tracké** (`git status : ??`) | ⚠️ à committer ou ignorer |
| Icônes back-office (7) / catégories signalement (5) | ⚪ Exploration, non validées | dans le sprite + `IconName` (`ic-dashboard/list/flag/users/review/chart/settings`, `ic-report-*`) | 🟡 code en avance sur validation |
| `ic-age` ≈ `ic-user`, `ic-toilets`, `ic-pingpong`, `ic-report-info` | signalés « à différencier » (audit 30/08) | non corrigés dans le sprite | 🟡 dette |
| Exports 1024×1024 stores | sources ~270 px, insuffisant | non disponible | 🔵 à redemander |
| Assets natifs (`.colorset` iOS, `colors.xml` Android, `capacitor.config`) | à générer | non faits | 🔵 |

Note : les 3 surfaces ont été normalisées sur une seule marque (`IMPLEMENTATION.md`) — pas de divergence de palette entre mobile / BO / landing.

---

## M. Audit météo

| Question | Réponse (état réel) |
|---|---|
| Fournisseur actuel | **Open-Meteo** (`https://api.open-meteo.com/v1/forecast`) |
| Fichiers | `packages/shared/src/utils/weather.ts` (fetch + `codeToCondition` WMO) ; `apps/mobile/src/lib/weather.ts` (`useWeather` React Query, staleTime 15 min) ; consommé dans `apps/mobile/src/screens/map/MapExplore.tsx` (bannière `WEATHER_ALERT_COPY` : chaleur / pluie / vent) |
| Appels API | 1 endpoint, paramètres `current=temperature_2m,weather_code,wind_speed_10m` |
| Clés | **aucune** (Open-Meteo est sans authentification) |
| Open-Meteo | ✅ utilisé |
| OpenWeatherMap | ❌ jamais dans le code ; seulement recommandé dans `outils-externes-a-preparer.md` / Notion |
| Autre | ❌ |
| Écart Notion | Notion 🏗️ TECH + base Stack + Décisions = « ⚠️ à réconcilier ». **Réalité : Open-Meteo, en prod, câblé.** Recommandation (à valider) : acter Open-Meteo (gratuit, sans clé, sans quota bloquant, données EU) et faire évoluer la ligne Notion de « ⚠️ à confirmer » vers « ✅ Implémenté — Open-Meteo » (OpenWeatherMap = alternative écartée). |

---

## N. Audit documentation locale

| Fichier | Classe | Commentaire |
|---|---|---|
| `docs/architecture/database-migration.md` | **A — référence fiable** | 1338 l., à jour 30/08, source de vérité du chantier DB. Impeccable. Seul défaut : très long, pas de résumé « état actuel » d'une page en tête (le §11 CHECKPOINT joue ce rôle). |
| `CLAUDE.md` | **A/B — fiable mais 1 lien mort** | Instructions projet correctes ; **référence `docs/identite-visuelle-formats.md` ET `TOBOGGO-BRAND-ASSETS-REFERENCE.md`** — ce dernier n'existe pas dans le repo. Ne mentionne pas la migration V2 ni l'état carto. |
| `docs/identite-visuelle-formats.md` | **A — référence fiable** | Formats/décisions branding, à jour 29-30/08. C'est *de facto* le « BRAND-ASSETS-REFERENCE » du repo, sous un autre nom. |
| `README.md` | **C — obsolète / trompeur** | Décrit le *handoff bundle* Claude Design (« lisez les 33 transcripts dans `chats/` », « `project/` ») — or `chats/` et `project/` **ne sont pas dans le repo** (seul `design-bundle/` subsiste, en artefacts JS). Ne décrit pas le vrai projet. |
| `IMPLEMENTATION.md` | **B — partiellement obsolète** | Bon panorama, mais : dit « Mapbox maps » en *Real* (or MapLibre est la cible + token vide) ; dit « PostGIS-backed nearby parks » (OK) ; ne mentionne pas la migration V2 incrémentale (parle du schéma v2 comme s'il était appliqué proprement) ; `cp .env.example .env` + `VITE_MAPBOX_TOKEN` toujours mis en avant. |
| `supabase/README.md` | **B — décrit la cible draft, pas la prod** | Décrit `migrations-v2-draft/` (`0001_schema`…`0005`) comme *les* migrations à appliquer + `supabase db reset --linked` (⛔ interdit sur la prod actuelle). Un nouvel arrivant pourrait casser la prod en suivant ce fichier. |
| `docs/Toboggo-Brand-Guidelines.pdf` | **F — non tracké** | À committer (ou ignorer explicitement) et référencer. |
| `supabase/inventory-pre-v2.sql` | **A — utilitaire read-only** | OK, déjà exécuté. |
| `backups/*` | hors périmètre doc | gitignored ; dumps logiques prod pré/post migration (filet de restauration). |

### Doublons / à fusionner

- **E** : `identite-visuelle-formats.md` (repo) ↔ `TOBOGGO-BRAND-ASSETS-REFERENCE.md` (Cowork, absent repo) ↔ sections Notion 🎨 DESIGN ↔ artifact `1de5ba03…` ↔ `Toboggo-Brand-Guidelines.pdf` : **5 représentations de la même charte, aucune synchronisée**. À réconcilier sous **un** nom canonique dans le repo.
- **D** : `IMPLEMENTATION.md` §« What's real » ↔ `docs/architecture/database-migration.md` §1 : se recouvrent partiellement, le second fait autorité.
- **F (information manquante)** : aucun `ARCHITECTURE.md` global (arbo des 5 workspaces, flux de données, quelle app parle à quoi) ; aucun `MAPS-GEO.md` ; aucun `AUTH.md` consolidé ; aucun `CHANGELOG.md` ; aucun doc « pipeline import OSM ».

### Structure documentaire cible proposée (à ne pas créer maintenant — proposition, non validée)

```
docs/
  PROJECT.md              ← remplace README.md : c'est quoi Toboggo, 3 surfaces, état, comment lancer
  ARCHITECTURE.md         ← 5 workspaces, dépendances, flux mobile/BO → shared → Supabase, env vars
  DATABASE.md             ← pointeur court vers architecture/database-migration.md (qui reste la source vivante) + schéma « à ce jour »
  PARK-DATA-MODEL.md      ← features/park_features, catalogue, mapping EQUIPMENT/SERVICES/… ↔ park_public
  AUTH.md                 ← 5 rôles, matrice permissions par écran/action, RLS helpers, invite-gating
  MAPS-GEO.md             ← état carto actuel + décisions (MapLibre validé), PostGIS, ce qui manque (géocodage/routing)
  DATA-IMPORT.md          ← pipeline OSM → parks (Overpass/Geofabrik/osmium → agent fiches → features), écart 17/2400/46262
  APP-PARENTS.md          ← inventaire écrans + statut
  BACKOFFICE-COLLECTIVITE.md
  ADMIN.md                ← file de validation (spec + état DB), imports, modération
  DESIGN-SYSTEM.md        ← fusion identite-visuelle-formats.md + BRAND-ASSETS-REFERENCE, source unique
  ROADMAP.md              ← chantiers ordonnés (section U de ce rapport)
  CHANGELOG.md
  architecture/database-migration.md   ← conservé tel quel (source vivante du chantier DB)
```

---

## O. Contradictions Notion ↔ code ↔ Supabase ↔ docs

1. **Carto** — Notion : « MapLibre validé, Mapbox obsolète, migration non vérifiée ». Code : 100 % Mapbox, 0 % MapLibre, token vide (carte factice). `IMPLEMENTATION.md` : « Mapbox maps » en *Real*. → **Notion a raison sur la cible ; le code n'a pas bougé ; `IMPLEMENTATION.md` est faux.**
2. **Météo** — Notion/base Stack : « à réconcilier, OpenWeatherMap reco ». Code : Open-Meteo, câblé. → **acter Open-Meteo.**
3. **PostGIS** — Notion 🗺️ : « ⚠️ à confirmer, aucune décision documentée ». Supabase : PostGIS actif, index GIST, RPC spatiales en prod. → **Notion très en retard.**
4. **Modèle Park** — Notion : « spécification, état d'implémentation non vérifié ». DB : tables + vue + 182 liens réels. → **implémenté (structure), à documenter.**
5. **Base de données** — Notion 🏗️ TECH : « aucun schéma SQL détaillé disponible ». Repo : 21 migrations en prod + doc de 1338 lignes. → **Notion ignore l'existence du chantier V2.**
6. **Volume de parcs** — page racine Notion : « 2 400+ référencés » ; 🛝 PARCS & DATA : « 46 262 nettoyés » ; landing : « 2 400+ » ; **Supabase : 17**. → **aucun des chiffres publics n'est en base ; l'import n'a pas eu lieu.**
7. **Catégories de signalement** — Notion : 2 officielles (+ 5 en exploration). Code + enum DB : **7** (`broken_equipment, safety, cleanliness, vegetation, accessibility, wrong_info, other`). → **le code a tranché seul, au-delà de l'exploration.**
8. **Rôles** — Notion 🔐 : 3 familles (utilisateur / collectivité / staff). DB `team_role` : 5 (`super_admin, moderation, support, gestionnaire, contributeur`). → **à documenter.**
9. **Branding source de vérité** — Notion + `CLAUDE.md` : `TOBOGGO-BRAND-ASSETS-REFERENCE.md`. Repo : ce fichier n'existe pas (c'est `identite-visuelle-formats.md`). → **lien mort dans les instructions projet.**
10. **`supabase/README.md`** — recommande `supabase db reset --linked` et l'application des `migrations-v2-draft/`. `database-migration.md` : ces deux actions sont **⛔ interdites** sur la prod. → **contradiction interne dangereuse.**
11. **File de validation** — Notion : « 🔵 Validé (spécification) ». Code : API + DB prêtes mais **0 UI, 0 appel**. Pas une contradiction, mais un écart d'attente à surveiller (facile de croire que « c'est fait » en voyant les tables).
12. **`README.md`** — annonce des `chats/` et `project/` absents du repo.
13. **App store / landing** — landing affiche « disponible sur iOS & Android » + boutons App Store / Google Play (`href="#"`) ; réalité : PWA Capacitor-ready, aucune soumission store.
14. **Sprite d'icônes** — Notion : `ic-climb`/`ic-motor` « corrigés le 29/08 ». Repo : re-modifiés, **non commités** (working tree divergent de `HEAD`).

---

## P. Éléments Notion pouvant passer à ✅ Implémenté (après vérification technique)

*(Ne pas modifier Notion — liste indicative, à arbitrer.)*

| Ligne Notion | Justification technique |
|---|---|
| **PostGIS** (🗺️ MAPS & GEO — actuellement ⚠️ à confirmer) | Actif en prod : `geography(4326)`, index GIST ×3, `ST_DWithin`/`ST_Distance` dans `nearby_parks` + `find_duplicate_parks` |
| **Modèle Park relationnel** (EQUIPMENT/SERVICES/ACCESSIBILITY/FEATURES/SAFETY — 🛝, actuellement 🔵 spécification) | Tables `features` + `park_features` + enum `feature_category` + vue `park_public` déployées ; 182 liens réels. *(Nuance : catalogue `features` = sous-ensemble de la spec ; à marquer « ✅ structure, catalogue à compléter ».)* |
| **Base de données V2 mondiale** (🏗️ TECH — actuellement « doc à compléter ») | `0001→0021` en prod, `local==remote`, coexistence active, backfill validé (Phases 6A/6B/6C = PASS) |
| **Météo** (🏗️ TECH / Décisions — ⚠️ à réconcilier) | Open-Meteo réellement intégré et câblé → ✅ Implémenté (Open-Meteo) ; OpenWeatherMap = écarté |
| **Auth Supabase (e-mail/mot de passe, reset, suppression de compte)** (🔐, base Stack) | `packages/shared/src/api/auth.ts` + RPC `delete_own_account` ; testé Phases 5B/5C |
| **Séparation des rôles côté serveur** (🔐 — exigence « pas uniquement l'interface ») | RLS sur 30 tables, 79 policies, helpers pinnés, isolation multi-org testée |
| **Design tokens / couleurs / typo / logo** (🎨 — 🔵 Validé/à implémenter) | `tokens.css` conforme aux hex, Fredoka/Nunito, `Logo.tsx` sens correct — implémenté dans les 3 surfaces *(dark mode : ✅ code, 🟡 validation visuelle)* |
| **Sprite d'icônes UI (47 symboles)** (🎨) | Exporté + 3 copies synchronisées + composant `<Icon>` *(après commit des edits `ic-climb`/`ic-motor` en attente)* |
| **App Parents : carte / liste / filtres / fiche / avis / favoris / signalement / groupes / météo** (📱 — 🔵 Validé) | Écrans présents et branchés Supabase *(carte : ✅ code, 🟡 dépend du token / MapLibre)* |
| **BO Collectivités : Dashboard, Parcs, Signalements, Avis, Statistiques, Équipe, Réglages, Entretien, Journal** (🏛️) | 9 écrans fonctionnels sur Supabase, RLS multi-org testée |

---

## Q. Éléments restant 🔵 Validé / à implémenter · 🟡 En cours · ⚠️ À confirmer

**🔵 Validé / à implémenter (rien de codé, ou DB-only) :**
- Moteur MapLibre (remplacement des 2 fichiers Mapbox)
- Fournisseur de tuiles/styles (MapTiler ou autre)
- Géocodage + reverse geocoding (Nominatim ou autre)
- Directions / routing (provider à choisir)
- File de validation Admin (UI sur `park_edits` + `find_duplicate_parks` — DB prête, 0 UI)
- « Proposer une modification » côté mobile (brancher `submitParkEdit`)
- Toboggo Admin : gestion collectivités, imports, Data & Qualité, modération dédiée, configuration
- BO : Interventions, Contrôles, Informations à vérifier, Messages
- Rattachement parc → commune par périmètre (polygon lookup) — *open question jamais tranchée par le fondateur*
- Social login Apple ; vérification téléphone (différés)
- Push notifications (OneSignal/FCM)
- Stripe billing collectivités
- i18n ; soumission stores ; assets natifs iOS/Android ; exports logo 1024×1024
- Modération OpenAI (avis/photos)
- Nettoyage legacy `0022+` (après cutover front V2 confirmé)

**🟡 En cours :**
- Import données OSM (agent fiches testé Rennes, clé API IA non branchée, 0 ligne en prod)
- Toboggo Score (structure + RPC OK, `park_scores` vide, jamais calculé)
- Carte (code présent, dépend token/MapLibre)
- Rapports BO (PDF minimal, pas d'écran dédié)
- Dark mode (tokens dérivés, validation fondateur en attente)
- Déploiement front V2 en prod + smoke tests browser réels (fondateur)

**⚠️ À confirmer :**
- Météo : acter Open-Meteo (écart Notion)
- Catégories de signalement : 7 (code) vs 2 (officiel) vs 5 (exploration) → décision fondateur
- Google Cloud Console / Algolia / Elasticsearch : lignes Stack marquées « vestige possible » — à clarifier
- Écart de comptage 17 / 2 400+ / 46 262 parcs
- 5 rôles `team_role` : valider la nomenclature vs les 3 familles Notion
- Nom canonique du doc branding (`TOBOGGO-BRAND-ASSETS-REFERENCE.md` vs `identite-visuelle-formats.md`)

---

## R. Dette technique

| # | Dette | Emplacement | Gravité |
|---|---|---|---|
| DT-1 | `mapbox-gl` obsolète (décision produit) + token vide ⇒ carte factice en prod | `MapCanvas.tsx`, `MapScreen.tsx`, 2× `package.json` | Haute |
| DT-2 | `database.types.ts` généré depuis le **local** (Phase 3C), pas régénéré depuis la prod V2 (`gen types --linked`) | `packages/shared/src/types/database.types.ts` | Moyenne (autorisé, à faire) |
| DT-3 | D4 : `AddPark` mappe un équipement non coché → `park_features.status='unavailable'` (devrait être `unknown`) | `packages/shared/src/api/parks.ts` (`splitParkInput`) | Moyenne (corruption sémantique de données à l'ajout) |
| DT-4 | `createPark` : fallbacks applicatifs `country_code="FR"` / `timezone="Europe/Paris"` (ni DEFAULT ni trigger) — incompatible « mondial » | `api/parks.ts` | Moyenne (avant déploiement hors FR) |
| DT-5 | M1 : badges React Query du Shell BO non invalidés par les mutations des modales | `apps/backoffice/src/components/Shell.tsx` | Basse (cosmétique) |
| DT-6 | M2 : nav collectivité non filtrée par rôle ; `maintenance_all` = `is_commune_member` ⇒ contributeur peut créer/éditer/supprimer une intervention | `Shell.tsx`, RLS `maintenance` | Moyenne (permission trop large) |
| DT-7 | M3 : rate-limit `email_sent=2/h` en local casse >2 invitations/h | config Supabase locale | Basse |
| DT-8 | M4 : `<button>` imbriqué dans `<button>` (dev-only warning) | `apps/backoffice/src/screens/Parks.tsx` | Basse |
| DT-9 | M5 : `flagReview()` (signalement d'un avis par un tiers) non fonctionnel — rows=0 silencieux | `api/reviews.ts` + RLS `reviews_update` | Moyenne (fonctionnalité morte) |
| DT-10 | Pas d'ESLint dans le repo (aucune dép, aucune config) → `npm run lint` échoue | racine | Moyenne (préexistant) |
| DT-11 | API mortes : `submitParkEdit`, `listParkEdits`, `reviewParkEdit`, `findDuplicateParks` (0 call site) | `api/contributions.ts` | Basse (scaffolding voulu) |
| DT-12 | Recherche / itinéraire / géocodage simplifiés (haversine, villes en dur) | `map/SearchOverlay.tsx`, `detail/Directions.tsx`, `lib/geo.ts` | Haute (fonctionnel) |
| DT-13 | Sprite d'icônes modifié non commité (working tree ≠ HEAD) | 3× `icons-sprite.svg` | Basse |
| DT-14 | Coexistence V1/V2 = surface d'attaque doublée (colonnes/tables/policies V1 + triggers) tant que `0022+` non fait | prod | Moyenne (par design, temporaire) |
| DT-15 | `apps/landing/config.js` = placeholder ⇒ formulaire contact non fonctionnel en prod | `apps/landing/config.js` | Moyenne |

---

## S. Dette documentaire

| # | Dette | Action |
|---|---|---|
| DD-1 | `TOBOGGO-BRAND-ASSETS-REFERENCE.md` cité comme source de vérité (Notion + `CLAUDE.md`) mais absent du repo | Créer/rapatrier sous un nom canonique, corriger `CLAUDE.md` |
| DD-2 | `README.md` décrit un handoff bundle obsolète (`chats/`, `project/` absents) | Remplacer par `PROJECT.md` |
| DD-3 | `supabase/README.md` recommande des actions interdites en prod (`db reset --linked`, appliquer `migrations-v2-draft/`) | Réécrire pour refléter l'état incrémental + interdictions |
| DD-4 | `IMPLEMENTATION.md` : « Mapbox maps » en *Real*, ne mentionne pas la migration V2 incrémentale | Mettre à jour |
| DD-5 | Notion 🏗️ TECH / 🗺️ MAPS & GEO ignorent l'existence du schéma V2 + PostGIS actif | Réconcilier (section P) |
| DD-6 | Aucun `ARCHITECTURE.md` / `MAPS-GEO.md` / `AUTH.md` / `DATA-IMPORT.md` / `CHANGELOG.md` | Créer (structure section N) |
| DD-7 | 5 représentations non synchronisées de la charte (repo / Cowork / Notion / artifact / PDF) | Désigner **une** source canonique (le repo) + notes de synchro |
| DD-8 | `docs/Toboggo-Brand-Guidelines.pdf` non tracké | Committer ou `.gitignore` explicite |
| DD-9 | 5 rôles `team_role` non documentés (vs 3 familles Notion) ; catégories signalement (7 vs 2) non tranchées | Documenter + décision fondateur |
| DD-10 | Écart 17 / 2 400+ / 46 262 parcs jamais résolu (répété dans 4 docs) | Trancher avec le fondateur, aligner tous les supports |

---

## T. Risques importants

| # | Risque | Impact | Probabilité | Mitigation |
|---|---|---|---|---|
| RQ-1 | Un contributeur suit `supabase/README.md` et lance `supabase db reset --linked` ou applique `migrations-v2-draft/` | **Perte de la prod** (17 parcs + comptes réels) | Moyenne | Réécrire le README ; le doc migration l'interdit déjà |
| RQ-2 | Front V2 pas encore déployé/validé en browser réel ⇒ le cutover reste bloqué, la coexistence s'éternise | Dette V1/V2 permanente, surface d'attaque doublée | Élevée (dépend du fondateur) | Prioriser chantier n°2 |
| RQ-3 | Mise en boutique / démo avec carte factice (token Mapbox jamais fourni, MapLibre pas fait) | Produit non montrable sur sa promesse « map-first » | Élevée | Chantier n°3 avant toute démo pilote |
| RQ-4 | Import OSM lancé sans stratégie de dédup/validation (RPC `find_duplicate_parks` pas branchée) | 46 262 fiches non vérifiées en prod, doublons, RLS de contribution jamais exercée | Moyenne | Chantiers n°6 + n°7 couplés |
| RQ-5 | Google OAuth : provider non activé mais boutons présents ⇒ erreur au clic en prod | Friction onboarding | Moyenne | Activer provider + credentials, ou masquer le bouton |
| RQ-6 | `createPark` force `FR`/`Europe/Paris` ⇒ tout parc « mondial » créé via l'app est mal géolocalisé en fuseau/pays | Données incohérentes si extension hors FR | Basse (court terme) | DT-4 |
| RQ-7 | D4 (`unavailable` au lieu de `unknown`) : chaque ajout de parc via l'app crée de la fausse donnée « confirmé absent » | Qualité de données dégradée dès l'usage réel | Élevée si l'app est ouverte aux contributions | DT-3, corriger avant ouverture des contributions |
| RQ-8 | Plan Supabase Free : pas de PITR, backups plateforme absents (seuls les dumps logiques `backups/` protègent) | Perte de données difficilement récupérable en cas d'incident | Moyenne | Passer en plan payant avant les vraies données mairies |
| RQ-9 | `.env` (prod URL + anon key) présent localement, gitignored — OK ; mais `anon key` = clé longue durée (exp 2103) dans un fichier non chiffré | Faible (anon key conçue pour être publique + RLS) | Basse | RAS, vigilance sur `service_role` (absente, bien) |
| RQ-10 | 5 représentations de la charte non synchronisées ⇒ un dev applique une version périmée | Incohérence visuelle | Moyenne | DD-7 |
| RQ-11 | `contact_messages` : formulaire landing non branché (`config.js` placeholder) ⇒ demandes perdues | Perte de leads mairies | Moyenne | DT-15 |

---

## U. Ordre recommandé des prochains chantiers

*(Proposition d'ordonnancement — à arbitrer avec le fondateur, non validée.)*

**Bloc 0 — Assainir (rapide, sans risque) :**
1. Régénérer les types depuis la prod V2 (DT-2)
2. Réécrire `supabase/README.md` + `README.md` + `IMPLEMENTATION.md` (RQ-1, DD-2/3/4)
3. Committer / clarifier le working tree (sprite, PDF branding) (DT-13, DD-8)
4. Trancher : nom canonique doc branding + fix `CLAUDE.md` (DD-1)

**Bloc 1 — Débloquer le cutover DB :**
5. Déployer le front V2 en prod + smoke tests browser réels (fondateur) → puis, après confirmation, écrire `0022+` (legacy cleanup) (RQ-2)
6. Corriger D4 avant toute ouverture des contributions (RQ-7)

**Bloc 2 — Rendre le produit montrable (cartographie) :**
7. Implémenter MapLibre (remplacer les 2 fichiers Mapbox) + choisir fournisseur de tuiles/styles (RQ-3)
8. Géocodage (recherche d'adresse réelle) — Nominatim ou fournisseur du fond de carte
9. Directions : décision (routeur OSRM/Valhalla vs « ouvrir dans l'app Maps native ») + implémentation

**Bloc 3 — Données :**
10. Pipeline import OSM → `parks` + `park_features` (brancher la clé API de l'agent fiches, définir le mapping, dédup via `find_duplicate_parks`)
11. Rattachement parc → commune (polygon lookup) — trancher l'open question

**Bloc 4 — Expérience Admin :**
12. File de validation (UI sur `park_edits` + dédup)
13. « Proposer une modification » côté mobile (brancher `submitParkEdit`)
14. Écrans Admin : gestion collectivités, imports, Data & Qualité, modération

**Bloc 5 — Complétude produit :**
15. BO : Interventions / Contrôles / Informations à vérifier / Messages
16. Toboggo Score : calcul réel (`recalculate_park_score`) + affichage
17. Social login Apple + Google (activer provider), push notifications
18. Stripe billing, i18n, soumission stores, assets natifs, exports logo HD

---

## V. Détail par chantier

*(Format : objectif · fichiers concernés · migrations · risque · dépendances · ordre. Recommandations non validées.)*

**1. Régénérer `database.types.ts` depuis la prod V2**
- Objectif : types TS alignés sur le schéma réellement déployé (0001→0021), supprimer les adaptations `Omit<…>` de coexistence là où c'est possible.
- Fichiers : `packages/shared/src/types/database.types.ts` (généré), impacts possibles `packages/shared/src/api/*.ts`, `types.ts`.
- Migrations : aucune (`supabase gen types typescript --linked`, lecture seule).
- Risque : faible (typecheck révèle tout). Peut faire apparaître des erreurs à corriger dans `api/*`.
- Dépendances : aucune.
- Ordre : **1er** (prérequis propre pour tout le reste).

**2. Déployer le front V2 + smoke tests browser → autoriser `0022+`**
- Objectif : clore la période de coexistence, permettre le nettoyage legacy destructif.
- Fichiers : build ≥ `e0712f8` ; hébergement (Vercel/Netlify — non tranché) ; `.env` prod des 2 apps.
- Migrations : `0022+` (à écrire **après** confirmation) — `DROP` colonnes/tables/policies V1, `DROP` triggers `*_v1_compat`, `park_public` → `p.*`. Destructif, irréversible.
- Risque : élevé (le `0022+`), d'où le gating. Filet : `backups/prod_v1_*_20260830T205152Z.sql`.
- Dépendances : chantier 1 ; validation fondateur ; N jours de surveillance erreurs/RLS/signup.
- Ordre : **2e** (jalon), `0022+` bien plus tard.

**3. Moteur MapLibre + fournisseur de tuiles**
- Objectif : remplacer `mapbox-gl` par `maplibre-gl` ; choisir une source de tuiles vecteur (fond de carte).
- Fichiers : `apps/mobile/src/screens/map/MapCanvas.tsx`, `apps/backoffice/src/screens/MapScreen.tsx`, `apps/mobile/package.json`, `apps/backoffice/package.json`, `package-lock.json` ; `.env*` (`VITE_MAPBOX_TOKEN` → variable du nouveau fournisseur) ; `FakeMap.tsx` (conserver comme fallback ou retirer) ; docs (`IMPLEMENTATION.md`, `supabase/README.md`, `identite-visuelle-formats.md`).
- Migrations : aucune.
- Risque : moyen (API MapLibre ≈ Mapbox mais style/tuiles à recâbler ; markers HTML inchangés).
- Dépendances : décision « fournisseur de tuiles » (MapTiler / Protomaps / OpenFreeMap / self-host).
- Ordre : **après bloc 0-1**, avant toute démo pilote.

**4. Géocodage / reverse geocoding**
- Objectif : recherche d'adresse réelle (mobile + BO `AddPark`/`ParkModal`) ; reverse pour pré-remplir l'adresse à l'ajout.
- Fichiers : `apps/mobile/src/screens/map/SearchOverlay.tsx`, `apps/mobile/src/lib/geo.ts` (retirer `CITIES[]` en dur), `packages/shared/src/api/` (nouveau `geocoding.ts`), `apps/mobile/src/screens/actions/AddPark.tsx`, `apps/backoffice/src/components/ParkModal.tsx`.
- Migrations : aucune (sauf si cache géocodage en table → optionnel).
- Risque : moyen (quotas Nominatim public ; instance dédiée si volume).
- Dépendances : idéalement même écosystème que le chantier 3.
- Ordre : avec/juste après le chantier 3.

**5. Directions / routing**
- Objectif : itinéraire réel OU délégation à l'app native de cartographie.
- Fichiers : `apps/mobile/src/screens/detail/Directions.tsx`, éventuel `packages/shared/src/api/routing.ts`.
- Migrations : aucune.
- Risque : faible si délégation native ; moyen si routeur hébergé (OSRM/Valhalla).
- Dépendances : chantier 3 (cohérence provider).
- Ordre : après 3-4.

**6. Import OSM → `parks` + `park_features`**
- Objectif : peupler la prod avec les vraies aires de jeux (résoudre 17 vs 46 262).
- Fichiers : scripts d'import (hors repo actuellement — l'agent fiches est livré en `.zip`) ; à intégrer sous `scripts/` ou un service ; `packages/shared/src/api/parks.ts` (`createPark` — corriger DT-3/DT-4 avant) ; catalogue `features` (seed à compléter vs spec Notion).
- Migrations : possible `0023+` pour étendre le seed `features` / ajouter des sous-caractéristiques ; **jamais avant `0022`**.
- Risque : élevé (volume, qualité — 84,8 % incomplet ; doublons ; RLS de contribution jamais exercée à l'échelle).
- Dépendances : chantiers 1, 2 (cutover), 7 (dédup/validation), clé API IA (fondateur), décision rattachement commune (chantier 11).
- Ordre : après le cutover V2 + la file de validation.

**7. File de validation (UI Admin)**
- Objectif : écran de revue `EXISTANT → PROPOSITION → SOURCE` + confiance + actions ; brancher `find_duplicate_parks`.
- Fichiers : nouveaux écrans `apps/backoffice/src/screens/Validation.tsx` (+ modale diff) ; `apps/backoffice/src/components/Shell.tsx` (nav admin) ; `apps/backoffice/src/App.tsx` (route) ; `packages/shared/src/api/contributions.ts` (déjà prêt).
- Migrations : aucune (DB prête).
- Risque : moyen (UX du diff ; RLS `park_edits` à exercer réellement).
- Dépendances : chantier 1.
- Ordre : avant l'import de masse (chantier 6).

**8. « Proposer une modification » (mobile)**
- Objectif : permettre au parent de soumettre une correction (alimente la file de validation).
- Fichiers : `apps/mobile/src/screens/actions/MoreActions.tsx`, nouvel écran `ProposeEdit.tsx`, `apps/mobile/src/App.tsx` (route), `packages/shared/src/api/contributions.ts` (prêt).
- Migrations : aucune.
- Risque : faible.
- Dépendances : chantier 7 (sinon les propositions s'accumulent sans traitement).
- Ordre : juste après 7.

**9. Rattachement parc → commune (périmètre)**
- Objectif : auto-assigner `organization_id`/`commune_id` via `ST_Contains(commune.boundary, park.location)`.
- Fichiers : `supabase/migrations/00XX` (fonction + trigger ou RPC batch), `communes.boundary` à peupler (import IGN AdminExpress) ; `packages/shared/src/api/parks.ts`.
- Migrations : `0023+` (après `0022`).
- Risque : moyen (qualité des polygones ; `addr:city` OSM à 0,3 %).
- Dépendances : cutover V2 ; source de polygones communaux.
- Ordre : avec le chantier 6.

**10. Écrans Toboggo Admin (collectivités / imports / data & qualité / modération)**
- Objectif : compléter la 3ᵉ expérience.
- Fichiers : `apps/backoffice/src/screens/{Organizations,Imports,DataQuality,Moderation}.tsx`, `Shell.tsx`, `App.tsx` ; `packages/shared/src/api/{team,organizations}.ts` (créer `createOrganization`, aujourd'hui SQL manuel).
- Migrations : éventuelle table « import jobs » (`0023+`).
- Risque : moyen.
- Dépendances : chantiers 1, 7.
- Ordre : bloc 4.

**11. BO Collectivités — sections manquantes (Interventions, Contrôles, Infos à vérifier, Messages)**
- Objectif : couvrir les 12 sections Notion.
- Fichiers : nouveaux `screens/*` back-office ; `contact_messages` (déjà en DB) pour Messages ; `verification_status`/`park_edits` pour « Infos à vérifier ».
- Migrations : possible extension `maintenance` (type contrôle vs intervention) — `0023+`.
- Risque : faible.
- Dépendances : chantier 1.
- Ordre : bloc 5.

**12. Corriger DT-3 (D4) et DT-6 (M2)**
- Objectif : `unavailable` → `unknown` à l'ajout ; filtrer la nav collectivité par rôle + resserrer `maintenance_all`.
- Fichiers : `packages/shared/src/api/parks.ts` (`splitParkInput`) ; `apps/backoffice/src/components/Shell.tsx` ; migration RLS `maintenance` (`0023+`).
- Migrations : `0023+` pour la policy `maintenance`.
- Risque : faible.
- Dépendances : DT-3 avant chantier 6 et avant ouverture des contributions.
- Ordre : DT-3 dans le bloc 1 ; DT-6 dans le bloc 4-5.

**13. Social login (Apple + Google) & Push**
- Objectif : finaliser OAuth (créer les credentials, activer les providers) ; choisir OneSignal ou FCM et implémenter.
- Fichiers : dashboard Supabase (providers) ; `apps/mobile/src/screens/onboarding/{LoginMethod,AuthForm}.tsx` (retirer les stubs) ; nouveau `packages/shared/src/api/push.ts` ; `capacitor.config`.
- Migrations : éventuelle table `push_tokens` (`0023+`).
- Risque : moyen (comptes Apple Developer / Google Cloud, entitlements Capacitor).
- Dépendances : Apple Developer Program / Google Play Console (décidés, non créés).
- Ordre : bloc 5.

**14. Stripe billing collectivités**
- Objectif : abonnements Essentiel/Pro/Intercommunalité.
- Fichiers : Edge Functions Supabase (webhooks) ; `packages/shared/src/api/billing.ts` ; BO `Settings.tsx` / nouvel écran ; table `subscriptions` (`0023+`).
- Migrations : `0023+`.
- Risque : moyen (webhooks, service_role côté Edge uniquement).
- Dépendances : après pilote gratuit ; chantier 10.
- Ordre : dernier bloc.

**15. Nettoyage legacy `0022+`**
- Objectif : supprimer colonnes/tables/policies/triggers V1, `park_public` → `p.*`.
- Fichiers : `supabase/migrations/0022_*.sql` (nouveau) ; `packages/shared/src/api/{parks,reviews,reports}.ts` (retirer les adaptations de coexistence) ; `packages/shared/src/types.ts` (retirer les accesseurs `@deprecated`).
- Migrations : `0022` — **destructif, irréversible**.
- Risque : élevé. Filet : dumps `backups/…20260830T205152Z`.
- Dépendances : chantier 2 (front V2 déployé + confirmé + N jours de surveillance).
- Ordre : dès que le fondateur confirme le cutover, avant les chantiers `0023+`.

---

*Fin du rapport. Photographie technique au 2026-08-30. Aucune modification effectuée lors de l'audit.*
