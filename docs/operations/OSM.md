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
npm run osm:import:staging -- midi-pyrenees
npm run osm:import:staging -- midi-pyrenees --commit
npm run osm:import:prod -- midi-pyrenees
npm run osm:import:prod -- midi-pyrenees --commit
```

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
