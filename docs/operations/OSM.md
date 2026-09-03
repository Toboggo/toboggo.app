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
Ne pas aspirer des photos sans licence compatible.

Priorité :
```text
Open data compatible
→ collectivités
→ utilisateurs Toboggo
→ autres sources explicitement réutilisables
```

## Prochaines priorités
1. priorité des sources / protection contre écrasement OSM
2. ville / adresse / région
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
