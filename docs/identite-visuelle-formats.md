
# Toboggo — Identité visuelle : formats des assets

*Fiche de référence pratique : quels fichiers produire, dans quel format, pour le logo, les couleurs, l'icône d'app, et les icônes UI (équipements de parcs, critères de filtres). Complète la section "Identité de marque" de `contexte-projet.md`.*

## Logo — direction finale (28/08/2026, corrigée après mesure pixel sur l'image de référence)

D'après les visuels de référence transmis par le fondateur, la marque a deux éléments distincts, à ne pas mélanger :

- **Le logo complet** = texte simple « Toboggo » (« Tobo » en vert #2FA37C→#1F7D5F, « ggo » en amber #FFB020), avec un petit swoosh/sourire à deux tons sous les « gg ». Pas d'illustration de toboggan mêlée aux lettres.
- **L'icône seule** (app icon, favicon, avatar) = un **T stylisé dont le montant se prolonge en toboggan** — la barre du T reste horizontale et droite, le montant descend puis courbe vers la **droite** en glissière, une boule amber marque l'arrivée en bas. C'est cette marque, et uniquement elle, qui porte la métaphore du toboggan. Le style est **plat** (pas de dégradé glossy/reflet sur l'icône — seul le fond du badge garde un très léger dégradé vert diagonal).

⚠️ Une itération précédente de cette fiche avait noté la courbe vers la **gauche** : c'était une erreur de lecture du visuel, corrigée le 28/08/2026 après une mesure pixel par pixel de l'image de référence (le montant du T rejoint la boule sous le tiers droit de la barre, pas sous le tiers gauche). Si un ancien export "courbe à gauche" a été copié quelque part, il doit être remplacé.

Le badge existe en deux formes, toutes deux vues sur la planche de référence : **carré** (source technique, iOS/Android appliquent leur propre masque) et **rond** (pour les contextes déjà circulaires — avatar, favicon rond, réseaux sociaux).

Une reconstitution SVG à la main de ce concept a été faite dans l'artifact `Logo, couleurs & pictogrammes` (icône carrée + icône ronde + variantes + wordmark), fidèle à la composition, au sens de la courbe et aux couleurs, mais ce n'est **pas un tracé vectoriel identique au pixel près** au visuel fourni — une image rendue ne se retro-convertit jamais exactement en SVG. Aucun fichier source (Figma/Illustrator/IA) n'a été déposé au projet à ce stade, seulement les images rendues. Si un fichier source existe ou est produit par un designer, il devient la référence à utiliser pour les exports finaux (l'icône notamment mérite un vrai fichier vectoriel propre avant publication App Store/Play Store).

## Couleurs — format de référence

- Hex comme source de vérité (déjà défini dans `contexte-projet.md`) : #2FA37C, #1F7D5F, #FFB020, #4C9EEB, #FFF8EC, #24303A, #8A8578.
- À redéclarer dans le format natif selon l'usage : variables CSS / config Tailwind (site + back-office), Assets couleur Xcode `.colorset` (iOS), `colors.xml` (Android), config `capacitor.config` (statusbar/splash).

## Icône de l'app mobile (iOS + Android)

- **iOS** : 1 seul fichier source, PNG carré 1024×1024, fond opaque (pas de transparence), pas de coins arrondis (Apple applique le masque). Xcode génère toutes les tailles dérivées via l'Asset Catalog.
- **Android — icône adaptative** : 2 calques séparés, un *foreground* (dessin, PNG transparent, ~432×432, zone de sécurité 264×264 centrale) et un *background* (fond uni/dégradé, même taille). Le système recompose selon la forme du launcher (rond, carré arrondi...). Prévoir aussi un PNG legacy 512×512 pour la fiche Play Store.
- **Outil recommandé** : `@capacitor/assets` — à partir d'un seul PNG/SVG source 1024×1024 + un fond, génère automatiquement toutes les déclinaisons iOS/Android (icônes + splash screens) en une commande.

## Splash screen

- Un visuel source haute résolution (2732×2732), typiquement le logo centré sur fond crème #FFF8EC, redimensionné automatiquement par `@capacitor/assets`.

## Favicon / icônes web (site vitrine, back-office)

- `favicon.ico` multi-résolution (16/32/48 px, un seul fichier) pour compat navigateurs anciens.
- `favicon.svg` pour navigateurs modernes.
- `apple-touch-icon.png` 180×180 (ajout à l'écran d'accueil iOS Safari).
- `192×192` et `512×512` PNG pour le manifest si PWA.
- Outil pratique : realfavicongenerator.net, à partir du pictogramme seul.

## Image de partage réseaux sociaux (Open Graph)

- 1200×630, PNG ou JPG, déclarée en meta tag `og:image`.

## Icônes UI — équipements de parcs et critères de filtres

Ces icônes sont un système à part de l'icône d'app : ce sont des pictogrammes internes à l'interface (filtres, fiches parcs), affichés dans une webview (le wrapper Capacitor charge l'app web) — donc pas besoin d'asset catalog natif iOS/Android, un simple set SVG web suffit.

Deux familles à distinguer, avec des exigences différentes :

**1. Icônes de critères/filtres** (tranche d'âge, ombre, WC, clôture, accès PMR + les critères manquants pour arriver aux "8 critères vérifiés" mentionnés dans le positionnement — à lister précisément avec le fondateur). Petit set (5-8 icônes), utilisé partout (chips de filtre, fiches parc, back-office) : mérite le plus haut niveau de finition et doit coller exactement au style de marque.

**2. Icônes d'équipements de jeu** (toboggan, balançoire, bac à sable, structure multi-jeux, cage à écureuil, tourniquet, trampoline, parcours sportif, tyrolienne...). Liste plus longue et ouverte, utilisée pour lister ce que contient chaque parc sur sa fiche. Enjeu de design plus faible par icône individuelle — certaines peuvent partir d'une librairie existante retouchée au style maison, la cohérence d'ensemble important plus que chaque icône seule.

**Recommandations de format** :

- Master en SVG, viewBox 24×24, style ligne ou plein cohérent avec le côté rond et ludique du logo (traits ~1.5-2px, coins arrondis) plutôt qu'un style fin/corporate.
- Icônes monochromes utilisant `currentColor` pour hériter la couleur selon l'état (gris muted #8A8578 par défaut, vert #2FA37C ou amber #FFB020 quand actif/sélectionné) — évite de dupliquer des fichiers par couleur.
- Livraison sous forme de composants (React/SVG) ou sprite SVG plutôt que fichiers PNG multiples — pas de contrainte de taille fixe puisque vectoriel, mais définir les tailles de rendu standard : 16px (chips denses), 20-24px (boutons de filtre, listes), 32-40px (icônes de fiche parc).
- Pour les icônes génériques (WC, parking, accès PMR), une librairie existante en ligne cohérente (Phosphor, Lucide, Material Symbols) peut servir de base rapide, à réhabiller au style maison. Pour les équipements spécifiques aux parcs (toboggan, balançoire, cage à écureuil...), il faudra probablement dessiner sur-mesure — ces pictogrammes n'existent pas dans les librairies génériques.

## Fiche de suivi — artifact « Logo, couleurs & pictogrammes »

Un artifact de référence a été construit et itéré au fil des échanges (28/08/2026) : logo (texte + icône T-toboggan carrée + ronde + variantes), palette de couleurs copiable, puis système d'icônes complet (critères de filtre, équipements de jeu, services, navigation & actions, modes d'itinéraire, badges de fiabilité/score, back-office collectivité, catégories de signalement), avec un état "non vérifié" pour les équipements dont la présence n'est pas confirmée dans les données. Tout est en SVG copiable directement (bouton "Copier le SVG" par élément). C'est un brouillon de travail à valider avec le fondateur, pas une charte arrêtée — plusieurs éléments sont explicitement marqués comme des propositions (catégories de signalement, style back-office).

**Comment le réutiliser dans une future session** : ce fichier `.md` est la référence texte durable — n'importe quel outil (Claude Code, un autre IDE, un humain) peut le lire dès qu'il est un vrai fichier dans le repo du projet. L'artifact "Logo, couleurs & pictogrammes" est une page web séparée (URL stable, republiée à chaque itération) : pour qu'une session Claude Code s'en serve, il faut soit lui coller le lien (si elle peut le récupérer par le web), soit copier le SVG final (bouton "Copier le SVG" sur chaque élément de l'artifact) directement dans les fichiers du projet de code. Il n'y a pas de synchronisation automatique entre l'artifact et un repo de code : à chaque changement de design validé, il faut le signaler explicitement à la session qui code (ex : "le sens de la courbe du T a changé, voici le nouveau SVG, mets à jour l'asset d'icône").

## Points ouverts

- Liste précise des "8 critères vérifiés" (le contexte projet n'en cite que 5 explicitement : tranche d'âge, ombre, WC, clôture, PMR).
- Liste complète des types d'équipements à couvrir par une icône (à établir à partir des données OSM déjà collectées — champ `playground:*` probablement disponible sur une partie des 46 262 parcs).
- Décision de style : ligne simple vs. plein/duotone pour les icônes UI.
- Récupérer (ou faire refaire) le fichier logo source réel — puisqu'un visuel de référence existe mais pas de fichier éditable/vectoriel au projet. Important avant tout export final (App Store, impression).
- Choix carré vs. rond comme forme canonique d'icône affichée à l'usage (le carré reste la source technique dans tous les cas, iOS/Android appliquent leur propre masque) — les deux variantes existent maintenant dans l'artifact.
- Liste réelle des catégories de signalement (seulement 2 nommées dans les docs : dégradation, info erronée).
- Variante illustrée détaillée du T (scène de parc avec toboggan, balançoire, soleil, arbre) vue dans les références du fondateur — pas construite dans l'artifact (trop détaillée pour un usage icône/favicon, plutôt adaptée à une illustration marketing) ; à décider si elle doit être développée séparément.
