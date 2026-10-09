# Sources des images marketing — apps/landing

Registre des images réelles utilisées sur le site public (`apps/landing/public/images/home/`). Sert à la fois de documentation des droits et de checklist avant d'ajouter une image.

> **Règle** : une image externe ne doit pas être ajoutée au site sans que sa source et sa licence soient renseignées dans ce fichier.

## Convention de nommage

Les fichiers sont nommés par **fonction/emplacement**, jamais par fournisseur, auteur ou banque d'images (pas de `pexels-12345.webp`, `shutterstock_987.webp`, etc.). Objectif : pouvoir remplacer une image plus tard en gardant **exactement le même nom de fichier et le même ratio**, sans toucher au code — seul ce fichier `IMAGE-SOURCES.md` doit être mis à jour (nouvelle ligne remplaçant l'ancienne).

## Arborescence prévue

```
apps/landing/public/images/
├── IMAGE-SOURCES.md
└── home/
    ├── hero/
    │   └── hero-aire-jeux-famille.webp
    ├── parks/
    │   └── (une image par parc réel, voir §Parcs ci-dessous)
    ├── families/
    │   └── famille-sortie-aire-jeux.webp
    ├── collectivites/
    │   └── aire-jeux-espace-public.webp
    ├── guides/
    │   ├── guide-age-enfant-aire-jeux.webp
    │   ├── guide-choisir-aire-jeux.webp
    │   └── guide-sortie-famille.webp
    └── community/
        └── communaute-toboggo.webp (si l'illustration actuelle est remplacée par une photo)
```

Tant qu'un fichier n'existe pas, la section correspondante du site affiche le `PhotoPlaceholder` de secours (voir `apps/landing/src/components/PhotoPlaceholder.astro`) — aucun changement de layout n'est nécessaire lors de l'ajout d'une image, seule une source (`src`) est à renseigner côté composant.

## ⚠️ Règle spécifique — dossier `parks/`

Chaque image de `home/parks/` doit être associée à **un parc réel et vérifiable**, jamais à une photo générique présentée sous le nom d'un parc. Si aucune photo fiable n'existe pour un parc donné, ne rien mettre — le placeholder reste affiché plutôt qu'une image trompeuse. Voir `apps/landing/src/data/demoParks.ts` pour la liste des parcs et leur état de vérification.

## Registre des images

| Fichier | Usage / emplacement | Source originale | Photographe / créateur | URL originale | Licence | Attribution requise | Date de récupération | Remarques |
|---|---|---|---|---|---|---|---|---|
| `hero/hero-aire-jeux-famille.webp` | Hero — photo superposée au mockup Explorer | Pexels | Ksenia Chernaya | https://www.pexels.com/photo/a-child-playing-on-outdoor-playground-8535898/ | Pexels License (gratuite, usage commercial autorisé) | Non | 2026-09-30 | Fillette de dos, visage non identifiable. Aucune marque visible. Ne pas présenter comme une utilisatrice/cliente Toboggo. |
| `families/famille-sortie-aire-jeux.webp` | Bloc "Pour les familles" | Pexels | RDNE Stock project | https://www.pexels.com/photo/a-family-playing-outside-8798762/ | Pexels License (gratuite, usage commercial autorisé) | Non | 2026-09-30 | Scène en pelouse/parc (pas une aire de jeux à structures), cohérent avec l'alt retenu ("sortie en plein air"). Personnes identifiables, aucune marque visible. Ne pas présenter comme une famille cliente Toboggo. |
| `collectivites/aire-jeux-espace-public.webp` | Bloc "Pour les collectivités" | Pexels | Harri Hofer | https://www.pexels.com/photo/modern-playground-in-copenhagen-urban-area-34770471/ | Pexels License (gratuite, usage commercial autorisé) | Non | 2026-09-30 | Photo prise à Copenhague (Danemark) — ne jamais légender comme une aire de jeux française ou un lieu géré par Toboggo. Aucune personne, aucune marque visible. Recadrage local (crop bas de l'image) pour garder la structure de jeu visible. |
| `guides/guide-age-enfant-aire-jeux.webp` | Carte guide "Comment choisir une aire de jeux adaptée à l'âge de son enfant ?" | Pexels | Boris Hamer | https://www.pexels.com/photo/child-playing-in-the-playground-17288400/ | Pexels License (gratuite, usage commercial autorisé) | Non | 2026-09-30 | Enfant identifiable (visage visible). Aucune marque visible. Ne pas présenter comme une utilisatrice Toboggo. |
| `guides/guide-choisir-aire-jeux.webp` | Carte guide "Que regarder avant de choisir un parc avec de jeunes enfants ?" | Pexels | Thirdman | https://www.pexels.com/photo/children-playing-in-a-playground-8926842/ | Pexels License (gratuite, usage commercial autorisé) | Non | 2026-09-30 | Enfants identifiables (visages visibles). Aucune marque visible. Ne pas présenter comme des utilisateurs Toboggo. |
| `guides/guide-sortie-famille.webp` | Carte guide "Préparer une sortie au parc en famille : les indispensables" | Pexels | Kampus Production | https://www.pexels.com/photo/family-at-the-park-6300857/ | Pexels License (gratuite, usage commercial autorisé) | Non | 2026-09-30 | Photo prise au Portugal, parc arboré (pas une aire de jeux à structures) — alt retenu en conséquence. Personnes identifiables, aucune marque visible. |

Licence Pexels vérifiée le 2026-09-30 sur https://www.pexels.com/license/ : utilisation gratuite (y compris commerciale), attribution non obligatoire, modification autorisée. Interdits : présenter une personne/marque comme approuvant un produit, revendre l'image non modifiée telle quelle, l'utiliser comme marque/logo. Ces 6 images respectent ces conditions — aucune n'est utilisée pour suggérer qu'une personne photographiée est cliente, utilisatrice ou ambassadrice de Toboggo.

### Comment remplir une ligne

- **Fichier** : chemin relatif exact sous `home/` (ex. `hero/hero-aire-jeux-famille.webp`).
- **Usage / emplacement** : section de la homepage (Hero, Familles, Collectivités, Communauté, Guide n°X, Parc "Nom réel").
- **Source originale** : banque d'images / site / shooting propre à Toboggo, etc.
- **Photographe / créateur** : nom si connu/requis par la licence, sinon "non communiqué".
- **URL originale** : lien vers la page de la photo (pas juste le nom de domaine).
- **Licence** : ex. libre de droits, CC0, Unsplash License, achat éditorial, shooting propriétaire Toboggo — préciser exactement.
- **Attribution requise** : Oui/Non, et si oui le texte exact à afficher et où.
- **Date de récupération** : date à laquelle l'image a été ajoutée au repo (pas la date de la photo elle-même).
- **Remarques** : droit à l'image des personnes reconnaissables, marques visibles, parc réel identifié, usage commercial autorisé ou non, etc.

## Variantes dérivées (optimisation, Lot 2 — 2026-10-09)

`node apps/landing/scripts/optimize-images.mjs` génère, sans retoucher les images :

- **Photos du site** : à côté de chaque original 1200 px, une variante `<nom>-800.webp` (800 px, qualité 82). `PhotoPlaceholder` les sert via `srcset` quand `sizes` est fourni ; l'original reste utilisé sur les grands écrans/haute densité. **Remplacer une photo = remplacer l'original, puis relancer le script** (la variante est régénérée ; elle hérite de la source et de la licence de l'original). Ces fichiers ne s'ajoutent pas au registre ci-dessus.
- **Captures de l'app** (`public/screenshots/`) : le PNG de capture est converti en WebP **sans perte** (pixels strictement identiques, contrôlés par le script) ; seul le `.webp` est servi.
