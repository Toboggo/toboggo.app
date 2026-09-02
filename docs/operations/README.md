# Toboggo — Opérations

## Mettre à jour OSM
Pipeline inchangé :
```bash
npm run osm:analyze -- france
npm run osm:import:prod -- france
npm run osm:import:prod -- france --commit
```

Si le pipeline OSM a changé, tester d'abord sur staging :
```bash
npm run osm:import:staging -- france
npm run osm:import:staging -- france --commit
```
puis faire le dry-run et le commit Prod.

## Corriger une vraie fiche parc
Utiliser le **Back-office Admin Production**.
Ne pas corriger en local puis essayer de pousser la donnée.

## Modifier le code ou le schéma
```text
LOCAL → STAGING / Preview → PROD
```

## Règle simple
- Code : Local → Staging → Prod
- Vraies données : BO Admin Prod
- OSM : pipeline automatisé
