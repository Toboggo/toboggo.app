# Recette — cohérence design mobile (PR fix/mobile-design-consistency)

Captures prises en local (Supabase local, compte de test, données de test — aucune donnée personnelle ni de production), icônes et images chargées.

- `00` avant : contrôles beige (état avant #165/#166).
- `01` liste Explorer **avant** le contour fin des cartes : le ciel blanc de l'illustration de repli efface les coins arrondis.
- `02` après : carte avec photo, carte dont la photo est en erreur (repli sur l'illustration), coins visibles.
- `03` thème sombre inchangé.
- `04`, `05` fiche parc (375 px FR, 320 px EN).
- `06` Explorer replié.

Photos Explorer : photo valide → affichée ; URL en erreur → illustration de repli après l'échec (gris transitoire pendant le chargement) ; parc sans photo → illustration. Aucune régression : c'est le repli prévu, rendu peu lisible par le ciel blanc (corrigé ici).
