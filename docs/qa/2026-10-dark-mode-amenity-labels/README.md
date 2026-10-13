# QA — mode sombre, libellés d'états, indisponibilité temporaire

Branche `fix/mobile-dark-mode-amenity-labels`, base `origin/main` (4432ae8). App mobile uniquement,
aucune migration, aucune écriture de production. Aucune donnée personnelle : les captures
viennent d'une base **locale** avec des parcs OSM publics et des photos synthétiques.

## Ce qui change

| Sujet | Correctif |
|---|---|
| Retour / Partager / Favori sur la photo de la fiche | Paire fixe `--color-photo-btn-bg` (blanc 92 %) + `--color-photo-btn-fg` (#24303a), identique en clair et en sombre (tokens dans `apps/mobile/src/index.css`). Avant : icône `--color-text` (quasi blanche en sombre) sur disque blanc. Anneau de focus visible. |
| Points du carrousel / compteur « 1/3 » | Pastille-voile `--color-photo-scrim` + point actif blanc. Avant : point actif = `--color-surface` (sombre en sombre) et compteur en `--color-on-primary` (sombre sur voile sombre). |
| Barre de navigation basse | **Défaut trouvé pendant l'audit** : fond `rgba(255,255,255,.75)` en dur, donc blanc en sombre avec libellés à 1,4–2,3:1. Maintenant `color-mix(--color-surface 75 %)` ; libellés inactifs en `--color-text-muted` en sombre. Rendu clair identique. |
| Cœur inactif des cartes parc | En sombre `--color-text-muted` au lieu de `--color-text-faint` (3,9:1). Clair inchangé. |
| État inconnu | Titre et statut « À confirmer » → « Non renseigné » / « Not specified » / « Sin información ». Pointillés conservés. « En attente de validation » (modération) non touché. Section vide toujours masquée. |
| `temporarily_unavailable` | Nouvel état `temporary`, lu depuis le statut détaillé **avant** les booléens agrégés (services et jeux). Fond `--color-warning-bg`, bordure continue `--color-accent`, texte `--color-warning-text`. Exclu des résumés (fiche, aperçu compact, cartes) qui n'affichent que `present`. FR/EN/ES. |
| « +N » | FR « 3 caractéristiques supplémentaires dans la fiche », EN « 3 more features in the park details », ES « 3 características más en la ficha » ; singuliers FR/EN/ES. `FitBadgeRow` inchangé (une ligne). |
| Ligne de statut des cellules Équipements | `opacity .85` retirée sur les états présent/temporaire : « Vérifié » passait à 3,9:1 en clair (11 px). |

## Contrastes mesurés (WCAG, opacité incluse)

| Élément | Sombre | Clair | Seuil |
|---|---|---|---|
| Icône Retour/Partager/Favori (sur disque, photo blanche ou noire) | 13,5 / 11,3 | 13,5 / 11,3 | 3 |
| Point actif / compteur sur le voile (photo blanche, pire cas) | 4,76 | 4,76 | 3 / 4,5 |
| « Vérifié » (après opacité) | 6,17 (avant 4,9) | 5,21 (avant **3,9**) | 4,5 |
| « Temporairement indisponible » nom / statut | 8,9 / 8,9 | 5,4 / 5,4 (statut avant **4,0**) | 4,5 |
| Cellules absent / non renseigné : nom / statut | 11,6 / 8,8 | 11,9 / 7,7 | 4,5 |
| Icônes des cellules (pire) | 6,0 | 3,25 | 3 |
| Bouton principal « Itinéraire » / « Voir les résultats » | **7,95** (texte sombre conservé ; blanc donnerait ≈ 2,6) | 3,16 (blanc sur vert de marque) | 4,5 |
| Scan de tout le texte visible, 24 routes en sombre | 0 texte < 4,5 hors boutons désactivés (« Continuer », « Rejoindre » ≈ 2,45, désactivés) | — | 4,5 |

## Captures (`docs/qa/2026-10-dark-mode-amenity-labels/`)

- `00`, `01`, `03` : avant (boutons invisibles, bascule / parking « À confirmer », barre blanche en sombre).
- `02`, `04`, `05`, `06`, `07`, `10` : après, sombre (équipements FR 375, aperçu compact, photo claire, sans photo + nom long 320, ES 320, focus clavier).
- `08`, `09` : après, clair (EN 430).

## Couverture réelle

Vérifié visuellement (navigateur intégré, données locales : présent / absent / inconnu / temporairement
indisponible, photos claires et sombres, photo absente, nom de 100 caractères) : fiche, Équipements,
aperçu compact, Filtres, Zone, recherche, liste « Autour de vous », barre de navigation, Apparence.
Thèmes clair / sombre / système, bascule **sans rechargement** (Sombre → Système → changement du
schéma OS), largeurs 320 / 375 / 430 (au moins deux par écran, pas la matrice complète), FR / EN / ES.
Scan de contraste automatisé sur 24 routes en sombre.

## Limites

- **Favoris et Mes ajouts avec contenu** : non testés. Le cœur renvoie à la connexion (invité) et je
  n'ai pas créé de compte ; vus en invité seulement, plus le composant `ParkCard` via « Autour de vous ».
- **Écrans connexion / onboarding** : fond blanc fixe en sombre (styles `--auth-*` propres), hors périmètre.
- **Clair, préexistant, non modifié** : bouton principal blanc sur vert de marque 3,16:1 ; titres de
  section en `--color-text-muted` 3,46:1 ; cibles des boutons de la fiche 38 px (dimensions conservées).
- **Test préexistant en échec sur `origin/main`** : `MapExplore.zeroResults.test.tsx`
  (« does not track zero_results… »). Vérifié sur `origin/main` propre, sans lien avec ces changements.
- Clavier : focus visible vérifié par programme + capture sur le bouton Favori ; pas de parcours Tab complet.
- Appuis tactiles : clics souris dans le navigateur ; pas de test sur appareil.
- Les libellés de badges de service « WC à confirmer » (`state.unknown.*`) ne sont pas dans le périmètre
  demandé (titre + statut) et ne s'affichent pas dans les résumés.
