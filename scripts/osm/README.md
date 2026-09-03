# Toboggo — Pipeline OSM

Ce dossier contient le pipeline OSM réutilisable de Toboggo.

## Où vivent les fichiers ?

Le code est versionné dans le repo :

- `scripts/osm/osm.py` : point d'entrée unique.
- `scripts/osm/analyze-osm.py` : audit OSM.
- `scripts/osm/import-osm-local.py` : import Supabase local.
- `scripts/osm/mappings/playground-v1.json` : mapping équipements.
- `scripts/osm/regions.json` : zones et patterns de fichiers PBF.

Les gros fichiers `.osm.pbf` restent hors Git dans :

`~/Documents/Toboggo full folder/OSM`

Tu peux changer ce dossier sans modifier le repo :

```bash
export TOBOGGO_OSM_DIR="/autre/chemin/OSM"
```

## Commandes

Lister les zones/fichiers détectés :

```bash
npm run osm:list
```

Analyser Midi-Pyrénées :

```bash
npm run osm:analyze -- midi-pyrenees
```

Dry-run d'import local :

```bash
npm run osm:import:local -- midi-pyrenees
```

Commit vers Supabase LOCAL uniquement :

```bash
npm run osm:import:local -- midi-pyrenees --commit
```

Publier les parcs OSM en LOCAL (pour tester l'app parents en anon — sinon les
parcs importés restent `pending` et invisibles) :

```bash
npm run osm:import:local -- midi-pyrenees --commit --publish
```

- sans `--publish` : nouveaux parcs en `moderation_status='pending'`, parcs
  existants non re-statués (comportement inchangé) ;
- avec `--publish`, pour les parcs rencontrés dans **ce run** :
  - nouveaux parcs → `moderation_status='published'` ;
  - parcs existants `pending` → `published` (par parc, `where id = …`) ;
  - `published` / `blocked` / `rejected` / `draft` : laissés tels quels ;
  - aucun parc n'est jamais dé-publié, aucun `UPDATE` global ;
- `verification_status` reste `'unverified'` dans les deux cas ;
- triggers actifs (jamais de `session_replication_role=replica`) ; le trigger
  `parks_v1_compat_biu` resynchronise le champ legacy `status` ;
- compteur `Publiés pendant ce run : N` ;
- avant `commit`, le script vérifie : parcs créés au statut attendu, aucun parc
  du run resté `pending` sous `--publish`, `status == moderation_status` sur tous
  les parcs du run — tout écart annule l'import (rollback).

Le `--publish` de `import-osm-remote.py` (staging/prod) ne concerne, lui, que les
parcs **créés**. Décisions de publication par environnement :

| Env | défaut | `--publish` |
|---|---|---|
| **Local** | `pending` | autorisé — nouveaux **et** promotion des `pending` existants (dev / test anon) |
| **Staging** | `pending` | autorisé — tests end-to-end (nouveaux parcs uniquement) |
| **Production** | `pending` | action volontaire explicite uniquement ; voie normale cible = import `pending` → validation Admin → `published` |

France :

```bash
npm run osm:analyze -- france
npm run osm:import:local -- france
npm run osm:import:local -- france --commit
npm run osm:import:local -- france --commit --publish
```

Le runner sélectionne automatiquement le fichier le plus récent qui correspond au pattern de la zone.

## Ajouter un pays/région

Ajouter une entrée dans `scripts/osm/regions.json`, par exemple :

```json
"spain": {
  "label": "Espagne",
  "patterns": ["spain-*.osm.pbf"],
  "country_code": "ES",
  "timezone": "Europe/Madrid"
}
```

## Sécurité

`import-osm-local.py` reste verrouillé sur `127.0.0.1:54322`.
Le wrapper ne contient aucune clé Supabase et ne sait pas écrire en staging/prod.

Les commandes staging/prod devront être ajoutées plus tard avec des garde-fous séparés.
