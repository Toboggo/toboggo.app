# Recette — badges des parcs et tri « Récents » (fix/park-badges-sort-layout)

Captures prises en local (Supabase local, compte et données de test, aucune donnée personnelle ni de production), icônes et images chargées.

## Tri « Récents » (défaut reproduit puis corrigé)
- `00` avant, 320 px : la rangée de tris (`overflow-x: auto`, flex-shrink) rétrécit à côté du bouton « Pour mes enfants » (`flex: none`) : largeur 169 px pour un contenu de 254 px → « Récents » invisible, « Mieux notés » coupé, sans indice de défilement.
- `01` après : tris + « Pour mes enfants » dans une seule rangée qui **passe à la ligne** ; capsules complètes, mêmes dimensions (36 px, rayon pill, bordure 1 px) via `ControlChip.module.css`, zone tactile 44 px sans chevauchement.

## Modèle de données — ce que « absent » veut dire
`park_public` calcule les booléens plats `wc`, `pmr`, `benches`, `water`, `parking` par `fstatus(...) = 'available'` : **`false` couvre unavailable, unknown et temporarily_unavailable** ; `null` = aucune ligne. Un `false` seul ne prouve donc pas une absence. Seule la map `features` (`status`) les distingue. `fenced`/`shade` sont calculés depuis la valeur enregistrée (`false` = valeur connue non clôturée / non ombragée).
- Présent : `true` (ou `status = available`).
- Absent : `status = unavailable`, ou `fenced`/`shade = false`.
- Inconnu : tout le reste (dont `false` isolé d'une disponibilité, `unknown`, `temporarily_unavailable`, `null`).
- « Vérifié » : uniquement si la ligne a un `verified_at`.
- Limite : le modèle n'a pas de ligne « inconnu » pour un jeu jamais mentionné ; seuls les jeux présents dans `features` sont listés (jamais tout le catalogue « à confirmer »).
Tests : `apps/mobile/src/lib/parkAmenities.test.ts` (null ≠ false, false isolé ≠ absent) et `components/ParkBadge.test.tsx`.

## Contextes
- `02` fiche complète : âge neutre, présents (vert), absents explicites (bordure grise) ; les inconnus ne sont pas affichés ici pour ne pas surcharger.
- `03` / `04` « Voir tout » : trois groupes (présents / absents / à confirmer), FR et ES.
- `05` Favoris et listes : résumé compact, équipements présents seulement (icônes).
- `06` panneau compact : âge + services présents.
- `07` valeurs de tokens du thème sombre (le panneau compact reste blanc : comportement préexistant, hors périmètre).
