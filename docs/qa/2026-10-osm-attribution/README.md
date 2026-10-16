# Recette — attribution OSM sur Explorer (feat/mobile-osm-attribution, PR #185)

Captures prises en local (aucune donnée personnelle ni de production, aucun appel Supabase/Geoapify modifiant des données). Fond de carte réel (OpenFreeMap, Lyon), 2 parcs de démonstration.

## Problème constaté
Sur Explorer, le contrôle d'attribution MapLibre (par défaut en bas à droite, collé au bas de la carte) était **recouvert par la barre de navigation et la feuille du bas** : `document.elementFromPoint` au centre du contrôle renvoyait un onglet de la barre (`<button>`), pas le contrôle.

## Correctif
- Contrôle d'attribution **unique** : le contrôle par défaut est désactivé (`attributionControl: false`) et remplacé par un `AttributionControl` compact, **en bas à gauche** (les boutons flottants Recentrer/Ajouter restent à droite).
- Il est **remonté au-dessus de la feuille + barre de navigation** (`--map-attrib-bottom` = `navH + sheetHeight`, `navH` incluant la safe area iOS) et suit la feuille à chaque cran. Marge de 10 px = style compact de MapLibre.
- Replié par défaut en pastille ⓘ de **36 px** (cible tactile ; 24 px par défaut) ; MapLibre l'ouvre de lui-même au chargement du style, on le replie à la première ouverture automatique (`MutationObserver`), ensuite c'est à l'utilisateur. Déplié : largeur bornée (`100% − 88 px`), le texte passe à la ligne et reste à gauche des boutons flottants.
- **Dernier cran** (carte entièrement couverte) : le contrôle ne tient plus entre l'en-tête et la feuille → masqué (`display: none` sur le conteneur : hors tabulation et hors lecteur d'écran) au lieu d'être écrasé ; il réapparaît dès que la carte réapparaît. L'écran *Sources des données* reste l'accès permanent.
- Libellés accessibles du contrôle (« Afficher l'attribution de la carte », « Signaler un problème sur la carte ») en FR/EN/ES via `map:a11y.*` (MapLibre `locale`).
- Safe areas : le contrôle est au-dessus de la barre (déjà calée sur la safe area basse) ; marge gauche `env(safe-area-inset-left)`.
- L'écran **Sources des données** et ses traductions FR/EN/ES sont conservés ; il reprend la mention du fond de carte (la carte reste l'attribution « en contexte », l'écran l'accès complet).

## Mesures (navigateur intégré, DOM réel)
| Format | État | Contrôle (l,t,r,b) | Haut de la feuille | Écart | Atteignable (hit-test) | Chevauche FAB / nav / en-tête |
|---|---|---|---|---|---|---|
| 375×812 | peek, replié | 10,616 → 46,652 | 662 | 10 px | oui | non / non / non |
| 375×812 | peek, déplié | 10,604 → 277,652 | 662 | 10 px | oui | non / non / non |
| 375×812 | intermédiaire, déplié | 10,351 → 277,399 | 409 | 10 px | oui | non / non / non |
| 375×812 | dernier cran | masqué (`display: none`) | 78 | — | — | — |
| 375×812 | aperçu d'un parc | suit la feuille (capture 04) | — | — | oui | non |
| 320×640 | peek, replié | 10,444 → 46,480 | 490 | 10 px | oui | non / non / non |
| 320×640 | peek, déplié (3 lignes) | 10,415 → 222,480 | 490 | 10 px | oui | non / non / non |
| 320×640 | intermédiaire / retour | 10,228 → 46,264 | 274 | 10 px | oui | non / non / non |
| 320×640 | dernier cran | masqué | 78 | — | — | — |
Aucun débordement horizontal (`scrollWidth` = largeur de la fenêtre), un seul `.maplibregl-ctrl-attrib` dans le DOM, 0 erreur console. Mesures du glisser de la feuille faites avec des `PointerEvent` tactiles synthétiques (le pilote ne produit que des événements souris).

## Captures
`00` peek replié 375 · `01` peek déplié 375 · `02` cran intermédiaire déplié 375 · `03` dernier cran (contrôle masqué) 375 · `04` aperçu d'un parc 375 · `05` peek replié 320 · `06` peek déplié 320.

## Reproduire
| Besoin | Commande / variable |
|---|---|
| Carte réelle en dev | `.env.local` à la racine (gitignoré) avec `VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty` ; `npm run dev:mobile` (port 5173, ou le suivant libre) ; réseau requis pour le style et les tuiles |
| Sans carte réelle (FakeMap) | `VITE_MAP_STYLE_URL=` (vide) |
| Formats | 375×812 et 320×640 (outil de redimensionnement du navigateur intégré) |
| Tests ciblés | `npx vitest run apps/mobile/src/screens/map/attributionLayout.test.ts apps/mobile/src/screens/profile` |
| Suite mobile « type CI » | `VITE_MAP_STYLE_URL= npx vitest run apps/mobile` |
| Typecheck | `npm run typecheck -w @toboggo/design-system -w @toboggo/shared -w @toboggo/mobile -w @toboggo/backoffice-core -w @toboggo/backoffice -w @toboggo/backoffice-admin -w @toboggo/backoffice-collectivity` |
| Build | `npm run build:mobile` |

## Échecs déjà présents sur `main` (non liés à cette PR)
Vérifiés sur un checkout propre de `origin/main` (`f935cd0`) **avant** les changements de la PR : mêmes 2 échecs avec `VITE_MAP_STYLE_URL=` vide.
1. `apps/mobile/src/components/ParkCover.test.tsx` — « erreur de la photo → illustration de secours ; erreur de l'illustration → logo, sans boucle » : `expected [ <img> ] to have a length of +0 but got 1` (historique : #139, #146, #150).
2. `apps/mobile/src/screens/map/MapExplore.zeroResults.test.tsx` — « does not track zero_results at all when the query resolves with real results » : `Unable to find an element with the text: Square Voltaire`.
Avec un `.env.local` qui définit `VITE_MAP_STYLE_URL`, **39** tests échouent (ces 2 + 37 dans `MapExplore.{nearby,search,}.test.tsx`) : `MapCanvas` instancie alors un vrai MapLibre sous jsdom (`map.addControl is not a function` avec le mock actuel). Identique avant/après la PR (39 / 39). Ces tests n'ont pas été modifiés.
`npm run typecheck` complet : l'étape `astro check` du site vitrine échoue dans ce worktree (`Cannot find module '@astrojs/vercel'`) — environnement, aucun fichier landing modifié.
