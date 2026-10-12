# Recette — couleurs des cellules Équipements et aperçu compact sur une ligne

Les captures de référence du 12/10 (22.22.29 et 22.24.00) n'étaient **pas accessibles** à la session : le défaut a été reproduit à la main sur les données locales (captures `00`, `00b`). Captures locales, données de test, aucune donnée personnelle.

## Équipements
- `00b` avant : cellules « présent » et « à confirmer » blanches. `01` après : présent = fond vert léger + icône et nom `--color-primary-on-tint` ; absent = fond neutre + bordure grise continue ; à confirmer = fond neutre + bordure grise en pointillés ; « Vérifié » (opacité réduite, sous le nom) seulement avec `verified_at`.
- Retour à la ligne uniquement entre les mots (`overflow-wrap: normal`, pas de césure) ; vérifié FR/EN/ES à 320 px : aucun nom ne déborde, hauteur de cellule adaptée (« Structure d'escalade » sur deux lignes, jamais coupée dans un mot).

## Aperçu compact
- `00` avant (320 px) : âge + Clôturé, puis Ombragé + WC sur une 2ᵉ ligne (sheet 518 px de haut). `03` après : `1–8 ans | Clôturé | +2` sur UNE ligne (sheet ≈ 28 px plus basse).
- `FitBadgeRow` : rend tous les badges, mesure (avant peinture), garde ceux qui tiennent + « +N » ; N = nombre exact de badges masqués, l'âge est épinglé et jamais compté. Re-mesure au changement de largeur. Mesures : 320 px FR → `1–8 ans, Clôturé, +2` ; 375 px FR → idem ; 430 px FR → les 4 badges, pas de « +N » ; 320 px ES → `1–8 años, +3` (aria-label « 3 características más en la ficha »).
- Pas de « Vérifié », d'absent ni d'inconnu dans l'aperçu.

## Positions du panneau
Le panneau d'un parc sélectionné n'a **qu'une position** : `SNAPS_SINGLE = ["fit"]` (hauteur = contenu) ; il n'y a pas de position basse/intermédiaire/haute pour la sélection (celles de PEEK 84 px / medium / 0,9 concernent la liste « Autour de vous »). Un geste sur la poignée navigue vers la fiche. Les positions de la liste n'ont pas été modifiées. Contrôle : la hauteur du panneau diminue d'une ligne de badges ; le bouton Itinéraire et « Voir la fiche » restent au-dessus de la navigation.
