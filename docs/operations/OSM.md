# Toboggo — Pipeline OSM

## Statut
Pipeline validé sur Midi-Pyrénées le 2 septembre 2026.

```text
2311 playgrounds OSM uniques
2201 candidats publics Toboggo
77 access=customers exclus
33 access=private exclus
156 équipements
121 surfaces fiables
35 informations wheelchair
52 informations de clôture
```

Les 2201 parcs ont été importés puis publiés en Production.

## Supabase
```text
PROD    dfzrsygetbhnjzfssgub
STAGING hfuaouskwysqxiwpwvqy
LOCAL   127.0.0.1:54322
```

## Fichiers
```text
scripts/osm/
├── osm.py
├── analyze-osm.py
├── import-osm-local.py
├── import-osm-remote.py
├── regions.json
└── mappings/playground-v1.json
```

Les `.osm.pbf` restent hors Git dans :
```text
~/Documents/Toboggo full folder/OSM
```

## Commandes
```bash
npm run osm:list
npm run osm:analyze -- midi-pyrenees
npm run osm:import:local -- midi-pyrenees
npm run osm:import:local -- midi-pyrenees --commit
npm run osm:import:local -- midi-pyrenees --commit --publish
npm run osm:import:staging -- midi-pyrenees
npm run osm:import:staging -- midi-pyrenees --commit
npm run osm:import:staging -- midi-pyrenees --commit --publish
npm run osm:import:prod -- midi-pyrenees
npm run osm:import:prod -- midi-pyrenees --commit
```

## Publication (`pending` → `published`)

`moderation_status` est le champ **canonique V2** de visibilité publique
(`parks_public_read`, `park_public`, `nearby_parks`). Le champ V1 `status` est
tenu à jour par le trigger `parks_v1_compat_biu` tant que dure la coexistence —
toute publication doit donc laisser les triggers actifs (jamais de
`session_replication_role = replica`, jamais de `DISABLE TRIGGER`).

| Env | Nouveaux parcs par défaut | `--publish` | Voie de validation |
|---|---|---|---|
| **Local** | `pending` | autorisé — nouveaux parcs **et** promotion des `pending` existants | `--publish` à l'import, ou BO Admin local |
| **Staging** | `pending` | autorisé — tests end-to-end (nouveaux parcs uniquement) | `--publish` à l'import, ou BO Admin staging |
| **Production** | `pending` | **action volontaire explicite uniquement** | voie normale cible : import `pending` → **validation Admin** → `published` |

- `import-osm-remote.py --publish` (staging/prod) ne s'applique qu'aux parcs
  **créés** ; un parc existant n'est jamais re-statué.
- `import-osm-local.py --publish` publie aussi les parcs OSM **existants** du run
  qui sont `pending` (`pending` → `published`, par parc) ; `blocked` / `rejected`
  / `draft` / `published` sont laissés tels quels, aucun parc n'est dé-publié.
- `verification_status` reste `'unverified'` : `--publish` publie, ne certifie pas.
- Passage unitaire aujourd'hui : BO Admin → écran *Parcs*, onglet « En attente » →
  « Valider » (`setParkStatus` → `moderation_status`, trigger resynchronise
  `status`).
- Traitement par lot : **pas encore** — voir « Prochaines priorités » #6
  (file de validation Admin OSM avec sélection multiple).

## Process rapide — pipeline inchangé
```text
1. osm:analyze
2. dry-run Prod
3. vérifier le rapport
4. commit Prod
5. contrôle rapide
```

## Process complet — pipeline modifié
```text
Local → Staging → Prod
```

## Ce que fait déjà l'import
- détecte `leisure=playground`
- déduplique
- exclut private/customers
- crée `external_ids`
- crée `park_sources`
- mappe équipements
- mappe surfaces fiables
- mappe wheelchair
- mappe clôture
- récupère min_age/max_age
- met à jour sans dupliquer
- importe par lots
- est idempotent

## Noms
Priorité cible :
```text
Collectivité officielle
→ Toboggo validé
→ OSM
→ géographie fiable
→ "Aire de jeux"
```

Un import OSM futur ne doit pas écraser une meilleure donnée Toboggo/collectivité.

## Enrichissement cible
```text
OSM
+ open data collectivités
+ sources officielles
+ BO collectivités
+ parents
+ photos
+ IA contrôlée
→ fiche Toboggo
```

## Photos

**Règle d'or : OSM ne crée aucune photo par défaut.**
Une photo de parc doit représenter réellement le lieu et avoir une provenance
identifiable. Aucune image générée, illustrative, générique ou placeholder n'est
enregistrée en base comme photo d'un parc.

### Ce que fait l'import OSM aujourd'hui
- Il ne lit, ne récupère et n'écrit **aucune** image / URL de photo.
- `scripts/osm/import-osm-local.py` et `import-osm-remote.py` n'insèrent jamais
  de ligne `park_media`. (Ils créent `parks`, `external_ids`, `park_sources`,
  `park_features`, `park_attribute_sources` — jamais `park_media`.)
- Le tag OSM `image=` / `wikimedia_commons=` n'est **pas** importé pour l'instant
  (option future, seulement si licence explicitement réutilisable + crédit).

### Modèle de données — `park_media` (migration `0025`)
Une photo = une ligne `park_media` avec sa provenance :

| colonne | rôle |
|---|---|
| `source` (`source_type`) | `user` (parent/contributeur) · `municipality` (collectivité) · `toboggo` (staff) · `open_data` / `partner` (sources ouvertes réutilisables). `NULL` = inconnue (lignes historiques). |
| `source_url` | page/URL d'origine chez la source |
| `author` | auteur / photographe déclaré |
| `license` | licence d'exploitation (`CC-BY-SA-4.0`, `© Ville de X`, …) |
| `attribution` | mention de crédit prête à afficher |
| `status` (`media_status`) | `approved` par défaut ; `pending` / `rejected` pour la modération |

`park_public.photos` / `park_public.cover_photo` n'exposent que les lignes
`status = 'approved'`.

### Placeholder Toboggo = état d'UI uniquement
Quand un parc n'a **aucune** photo (`park.photos.length === 0`), le front affiche
le marqueur Toboggo (`<LogoMark>`) + un CTA « Ajouter une photo ». Ce placeholder
n'est **jamais** écrit dans Supabase.

### Apports futurs — priorité des sources
```text
Open data compatible
→ collectivités
→ utilisateurs Toboggo
→ autres sources explicitement réutilisables
```
Chaque apport renseigne `source` (+ `license` / `author` / `attribution` si
connus) via `addMedia` / `addParkPhotos` (`packages/shared/src/api/parkDetails.ts`).

## Adresses (chantier `feature/osm-address-priority`)

Diagnostic : sur les 2201 parcs Midi-Pyrénées, seuls 11 (~0,5%) portent un tag
OSM `addr:*` exploitable (`addr:housenumber`, `addr:street`, `addr:postcode`,
`addr:city` — les seuls 4 tags addr:* présents dans tout le jeu de données ;
aucun `addr:place`/`is_in`/`place`). Le reste dépend du reverse geocoding.

- L'import (`import-osm-local.py` et `import-osm-remote.py`) lit désormais ces
  4 tags via `scripts/osm/address.py` et écrit `address_line`/`postal_code`/
  `city` — toujours protégé par `can_source_replace_attribute(id,'address','osm')`
  (jamais d'écrasement d'une adresse Toboggo/collectivité vérifiée, jamais de
  blanchiment d'une adresse existante quand l'objet OSM n'apporte rien).
- `scripts/osm/geoapify.py` : client de reverse geocoding (clé via
  `GEOAPIFY_API_KEY` uniquement, jamais committée, jamais côté frontend).
- `scripts/osm/backfill-addresses.py --env {local,staging} [--commit] [--limit N]` :
  backfill dédié. `--env prod` n'est même pas une option du script (garde-fou
  technique, pas seulement une discipline). Dry-run par défaut. Idempotent et
  reprenable : un parc déjà traité (source `reverse_geocode` enregistrée)
  n'est plus jamais resélectionné tant qu'aucune source supérieure n'a pris le
  relais — le mécanisme de priorité sert lui-même de point de reprise, pas de
  fichier d'état séparé.
- Priorité (migrations `0028`/`0029`) :
  `toboggo (100) > municipality (90) > open_data (80) > partner (70) > osm (50)
  > reverse_geocode (45) > user (40) > other (10)`.
- Tests : `python3 -m unittest discover -s scripts/osm/tests -p "test_*.py"`.

## Prochaines priorités
1. ~~priorité des sources / protection contre écrasement OSM~~ — fait (`0024`, `0028`, `0029`)
2. ~~ville / adresse / région~~ — fait pour OSM + reverse geocoding (voir ci-dessus) ; open data collectivités reste à faire (#5)
3. `parks.boundary`
4. `opening_hours`, `operator`, `fee`
5. enrichissement open data collectivités
6. file de validation Admin
7. téléchargement/diffs OSM automatiques
8. rapport automatique

## Règle d'or
Le local sert à développer le pipeline.
La Prod est la source de vérité des vraies fiches.
Une correction réelle se fait dans le BO Admin Prod.
