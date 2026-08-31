
# Toboggo — Identité visuelle : formats des assets

> **Rôle de ce document.** C'est la référence de l'**identité visuelle validée**
> de Toboggo : logos et leurs variantes, couleurs de marque, pictogrammes,
> formats et fichiers d'assets (icône d'app, favicon, splash, Open Graph).
>
> Pour savoir **comment utiliser** cette identité dans une interface — tokens,
> composants, tailles, espacements, boutons, cartes, navigation, règles de
> placement des logos et des pictogrammes — voir **`docs/DESIGN-SYSTEM.md`**.
> Pour l'**implémentation exécutable** de ces règles, voir `packages/design-system`.
> Les trois sont **complémentaires** — aucun ne remplace l'autre.

*Fiche de référence pratique : quels fichiers produire, dans quel format, pour le logo, les couleurs, l'icône d'app, et les icônes UI (équipements de parcs, critères de filtres). Complète la section "Identité de marque" de `contexte-projet.md`.*

## Fichiers sources réels (29/08/2026)

Les vrais fichiers de marque (dossier `Logos & icons` du founder) sont maintenant copiés et versionnés dans le repo sous **`docs/brand-assets/`** — ce sont eux la référence, plus une reconstitution :

| Fichier | Usage |
|---|---|
| `02-wordmark-toboggo` | Logo complet (texte « Toboggo » + swoosh) — nav, footer, écrans d'accueil |
| `03-t-monogram` | Le T seul, sans fond — usage libre sur fond clair |
| `05-app-icon-square` | Icône d'app, fond carré plein — source pour favicon/app icon |
| `06-favicon-square` | Variante favicon carrée (proche de app-icon, cadrage optimisé petite taille) |
| `08-favicon-circle` | Icône d'app, fond rond plein |
| `01-playground-logo` | Variante illustrée : le T intégré à une scène de parc (toboggan, balançoire, soleil, arbre) — splash screen, onboarding, marketing, pas pour favicon/icône (trop détaillée en petit) |
| `04-playground-scene` | La scène de parc seule (sans le T en premier plan) |
| `07-playground-icon-square` / `09-playground-icon-circle` | Scène illustrée dans un badge carré/rond |

⚠️ **Limite de résolution** : ces PNG sources sont assez bas en résolution (270×280px pour l'icône carrée, du même ordre pour les autres) — largement suffisant pour le web, les favicons et les icônes PWA (192/512px), mais **trop bas pour un export App Store/Play Store 1024×1024 net**. Il faudra redemander un export haute résolution à la source (l'outil qui a produit ces visuels) avant la mise en boutique. Les fichiers `.svg` du même dossier ne sont pas des vecteurs — ce sont ces mêmes PNG encapsulés dans une balise `<svg><image>`, donc pas plus nets en agrandissant.

## Logo — direction (confirmée par les fichiers réels)

- **Le logo complet** = texte simple « Toboggo » (« Tobo » en vert #2FA37C→#1F7D5F, « ggo » en amber #FFB020), avec un petit swoosh/sourire à deux tons sous les « gg ». Pas d'illustration de toboggan mêlée aux lettres.
- **L'icône seule** (app icon, favicon, avatar) = un **T stylisé dont le montant se prolonge en toboggan** — la barre du T reste horizontale et droite, le montant descend puis courbe vers la **droite** en glissière, une boule amber marque l'arrivée en bas. Confirmé par mesure directe sur les fichiers sources réels (`05-app-icon-square`, `08-favicon-circle`, `03-t-monogram`) le 29/08/2026 — une itération antérieure de cette fiche avait noté la courbe vers la gauche par erreur de lecture d'un visuel de référence ; c'est corrigé.
- Le badge existe en deux formes : **carré** (`05-app-icon-square`, source technique — iOS/Android appliquent leur propre masque) et **rond** (`08-favicon-circle`, pour les contextes déjà circulaires).
- Une **variante illustrée** existe aussi (`01-playground-logo`) pour les usages où le logo peut être plus détaillé (splash screen, onboarding, marketing) — pas adaptée à une icône ou un favicon.

L'artifact `Logo, couleurs & pictogrammes` reprend maintenant ces fichiers réels tels quels pour le logo complet, l'icône carrée, l'icône ronde et la variante illustrée. Seules les 3 cartes « variantes du symbole seul » (fond clair / inversé / monochrome) restent un vecteur redessiné à la main — nécessaire pour pouvoir changer leur couleur selon le fond — mais calé sur le même tracé que les fichiers réels.

## Couleurs — réalignées dans le code (29/08/2026)

Le code (`packages/design-system/src/tokens.css`, dupliqué dans `apps/landing/styles.css`, plus les `<meta name="theme-color">` et les logos SVG inline des 3 apps) utilisait des teintes génériques (vert Tailwind #16a34a, orange #f08a2e, bleu #2e6fa8) qui ne correspondaient **pas** aux vraies couleurs de marque. Corrigé aujourd'hui pour utiliser les hex confirmés par les fichiers réels :

- Hex comme source de vérité (déjà défini dans `contexte-projet.md`) : #2FA37C, #1F7D5F, #FFB020, #4C9EEB, #FFF8EC, #24303A, #8A8578.
- Fichiers modifiés : `packages/design-system/src/tokens.css` (--color-primary/-hover/-pressed/-tint, --color-accent/-tint, --color-info/-tint, clair et sombre), `packages/design-system/src/components/Logo.tsx` (dégradé du logo programmatique), `apps/mobile/index.html`, `apps/backoffice/index.html` (meta theme-color), `apps/landing/styles.css` (mêmes tokens dupliqués), `apps/landing/index.html` (2 logos SVG inline nav+footer).
- Favicons/icônes d'app remplacés dans les 3 apps (`apps/mobile/public/`, `apps/landing/assets/`, `apps/backoffice/public/`) par les vrais fichiers recadrés en carré propre (favicon.svg, apple-touch-icon.png 180×180, icon-192.png, icon-512.png — ce dernier est un agrandissement du 270×270 source, donc un peu moins net, à refaire depuis un export haute résolution plus tard).
- À redéclarer dans le format natif selon l'usage : Assets couleur Xcode `.colorset` (iOS), `colors.xml` (Android), config `capacitor.config` (statusbar/splash) — pas encore fait.

## Icône de l'app mobile (iOS + Android)

- **iOS** : 1 seul fichier source, PNG carré 1024×1024, fond opaque (pas de transparence), pas de coins arrondis (Apple applique le masque). Xcode génère toutes les tailles dérivées via l'Asset Catalog. **Pas encore disponible** — le fichier réel actuel ne fait que 270×270, insuffisant (voir plus haut).
- **Android — icône adaptative** : 2 calques séparés, un *foreground* (dessin, PNG transparent, ~432×432, zone de sécurité 264×264 centrale) et un *background* (fond uni/dégradé, même taille). Le système recompose selon la forme du launcher (rond, carré arrondi...). Prévoir aussi un PNG legacy 512×512 pour la fiche Play Store.
- **Outil recommandé** : `@capacitor/assets` — à partir d'un seul PNG/SVG source 1024×1024 + un fond, génère automatiquement toutes les déclinaisons iOS/Android (icônes + splash screens) en une commande. Attendre l'export haute résolution avant de lancer cet outil.

## Splash screen

- Un visuel source haute résolution (2732×2732), typiquement le logo centré sur fond crème #FFF8EC, redimensionné automatiquement par `@capacitor/assets`. Candidat naturel : la variante illustrée (`01-playground-logo`), une fois exportée en haute résolution.

## Favicon / icônes web (site vitrine, back-office)

- `favicon.ico` multi-résolution (16/32/48 px, un seul fichier) pour compat navigateurs anciens — pas encore généré (actuellement `favicon.svg` seul dans les 3 apps).
- `favicon.svg` — fait, à jour dans les 3 apps (29/08/2026).
- `apple-touch-icon.png` 180×180 — fait, à jour dans les 3 apps.
- `192×192` et `512×512` PNG pour le manifest si PWA — fait pour l'app mobile (icon-192/512.png) et la landing (icon-512.png seulement) ; le back-office n'a ni manifest ni ces tailles (pas nécessaire s'il n'est pas installable en PWA).
- Outil pratique : realfavicongenerator.net, à partir du pictogramme seul, pour générer un vrai `favicon.ico` multi-résolution le moment venu.

## Image de partage réseaux sociaux (Open Graph)

- 1200×630, PNG ou JPG, déclarée en meta tag `og:image`. Pas encore fait — bon candidat pour réutiliser la variante illustrée une fois exportée en haute résolution.

## Icônes UI — équipements de parcs et critères de filtres

Ces icônes sont un système à part de l'icône d'app : ce sont des pictogrammes internes à l'interface (filtres, fiches parcs), affichés dans une webview (le wrapper Capacitor charge l'app web) — donc pas besoin d'asset catalog natif iOS/Android, un simple set SVG web suffit.

**Exportées dans le code le 29/08/2026** : `packages/design-system/src/icons/icons-sprite.svg` (47 symboles `stroke="currentColor"`) + composant `<Icon name="ic-xxx" />` (`packages/design-system/src/icons/Icon.tsx`, exporté par `@toboggo/design-system`). Le sprite est copié dans `apps/mobile/public/` et `apps/backoffice/public/`, chargé au runtime via `useIconSprite()` (déjà appelé dans les deux `App.tsx`). C'est un export ponctuel du brouillon de l'artifact, pas une validation : les catégories de signalement et le style back-office restent des propositions (voir plus bas). Toute nouvelle icône ajoutée dans l'artifact doit être recopiée manuellement dans les 3 copies du sprite (`packages/design-system/src/icons/` + les 2 `public/`) — pas de synchronisation automatique.

Deux familles à distinguer, avec des exigences différentes :

**1. Icônes de critères/filtres** (tranche d'âge, ombre, WC, clôture, accès PMR + les critères manquants pour arriver aux "8 critères vérifiés" mentionnés dans le positionnement — à lister précisément avec le fondateur). Petit set (5-8 icônes), utilisé partout (chips de filtre, fiches parc, back-office) : mérite le plus haut niveau de finition et doit coller exactement au style de marque.

**2. Icônes d'équipements de jeu** (toboggan, balançoire, bac à sable, structure multi-jeux, cage à écureuil, tourniquet, trampoline, parcours sportif, tyrolienne...). Liste plus longue et ouverte, utilisée pour lister ce que contient chaque parc sur sa fiche. Enjeu de design plus faible par icône individuelle — certaines peuvent partir d'une librairie existante retouchée au style maison, la cohérence d'ensemble important plus que chaque icône seule.

**Recommandations de format** :

- Master en SVG, viewBox 24×24, style ligne ou plein cohérent avec le côté rond et ludique du logo (traits ~1.5-2px, coins arrondis) plutôt qu'un style fin/corporate.
- Icônes monochromes utilisant `currentColor` pour hériter la couleur selon l'état (gris muted #8A8578 par défaut, vert #2FA37C ou amber #FFB020 quand actif/sélectionné) — évite de dupliquer des fichiers par couleur.
- Livraison sous forme de composants (React/SVG) ou sprite SVG plutôt que fichiers PNG multiples — pas de contrainte de taille fixe puisque vectoriel, mais définir les tailles de rendu standard : 16px (chips denses), 20-24px (boutons de filtre, listes), 32-40px (icônes de fiche parc).
- Pour les icônes génériques (WC, parking, accès PMR), une librairie existante en ligne cohérente (Phosphor, Lucide, Material Symbols) peut servir de base rapide, à réhabiller au style maison. Pour les équipements spécifiques aux parcs (toboggan, balançoire, cage à écureuil...), il faudra probablement dessiner sur-mesure — ces pictogrammes n'existent pas dans les librairies génériques.

## Brand kit complet (29/08/2026) — typographie, espacements, composants UI + document de présentation

Suite à la demande d'un « brand kit complet » (au-delà du logo/couleurs/pictogrammes), deux ajouts, dans les deux formats discutés avec le fondateur :

1. **L'artifact interactif existant a été étendu** avec trois nouvelles sections, fidèles au vrai code (`packages/design-system`) plutôt qu'à une proposition graphique :
   - **Typographie** — spécimens Fredoka/Nunito aux tailles et graisses réellement utilisées (titres, boutons, libellés, texte courant).
   - **Espacements, rayons & ombres** — l'échelle de `tokens.css` (`--space-1` à `--space-8`, `--radius-xs` à `--radius-pill`, `--shadow-sm/md/lg`) avec un aperçu visuel de chaque valeur.
   - **Composants UI** — boutons (primary/secondary/ghost/danger, tailles, icon buttons), tags, champs de formulaire, segmented control + interrupteur, cartes, dialogue, et divers (points d'étape, toast, avatar, stat card, tableau) — copie visuelle exacte du CSS réel de `Button.module.css`, `Card.module.css`, `Tag.module.css`, `Input.module.css`, `Segmented.module.css`, `Dialog.module.css`, `Misc.module.css`.
   - Les vraies variables de `tokens.css` (`--color-primary`, `--space-4`, `--radius-lg`, `--shadow-md`, etc.) ont été ajoutées au `:root` de l'artifact sous préfixe `--ds-` (additif, sans toucher aux variables propres à l'artifact comme `--green`/`--amber`) — copiables telles quelles dans le code, contrairement aux anciennes variables de l'artifact qui n'existent que sur cette page.
   - Même URL qu'avant, republié en v10.

2. **Un document de présentation séparé, « Brand Guidelines »**, plus éditorial que le kit interactif — pensé pour être montré (investisseurs, agence, futur développeur) plutôt que pour copier du code : mission et positionnement de la marque, règles d'usage du logo (espace de respiration, taille minimale, 5 exemples « à ne pas faire » — dont l'erreur réelle de sens de courbe déjà commise et corrigée sur ce projet), palette avec paires de contraste, typographie, aperçu des icônes et de leurs 3 états, aperçu interface, et une courte section ton & voix déduite des textes déjà en place dans l'app (« Vérifié il y a 6 jours », etc.). Renvoie explicitement vers le kit interactif pour le code et les exports.
   - Nouvel artifact séparé : https://claude.ai/code/artifact/b93e1fc5-26a7-4e22-970c-cd31546678e1

## Fiche de suivi — artifact « Logo, couleurs & pictogrammes »

Un artifact de référence a été construit et itéré au fil des échanges (28-29/08/2026) : logo (fichiers réels + variantes recolorables), palette de couleurs copiable, puis système d'icônes complet (critères de filtre, équipements de jeu, services, navigation & actions, modes d'itinéraire, badges de fiabilité/score, back-office collectivité, catégories de signalement), avec un état "non vérifié" pour les équipements dont la présence n'est pas confirmée dans les données. Tout est copiable directement (bouton "Copier le SVG" par élément). C'est un brouillon de travail à valider avec le fondateur pour la partie icônes UI (pas une charte arrêtée — plusieurs éléments sont explicitement marqués comme des propositions : catégories de signalement, style back-office) ; en revanche la partie logo est maintenant fidèle aux vrais fichiers.

**Ce que couvrent ce doc, l'artifact et le nouveau document de présentation — pas tout à fait la même chose** : ce doc (`identite-visuelle-formats.md`) est la fiche de *formats et de décisions* — quel fichier pour quel usage, quelles tailles, quels hex, ce qui est fait vs pas encore, les limites connues. L'artifact « Logo, couleurs & pictogrammes » (devenu un brand kit complet) est la *bibliothèque visuelle vivante et copiable* — logo, couleurs, typographie, espacements/rayons/ombres, composants UI et tous les pictogrammes, chacun copiable en un clic (SVG, hex ou classe CSS), c'est là que tout nouvel élément est d'abord dessiné et itéré. Le document « Brand Guidelines » est une *présentation éditoriale* de la même marque — règles d'usage, ton, à montrer plutôt qu'à copier-coller. Le sprite dans le repo (`packages/design-system/src/icons/icons-sprite.svg`) est un **export figé** de la bibliothèque à la date du 29/08/2026 — si l'artifact évolue (nouvelle icône, catégorie de signalement validée...), il faut re-exporter manuellement vers le sprite ; rien ne se met à jour tout seul entre les quatre (artifact / guidelines / doc / sprite).

**Comment le réutiliser dans une future session (y compris Claude Code)** : ce fichier `.md` vit maintenant à deux endroits — dans le projet Cowork (lu par toute session Cowork attachée au projet Toboggo) et en fichier réel dans le repo (`docs/identite-visuelle-formats.md`, lu par Claude Code comme n'importe quel fichier). **Ces deux copies ne se synchronisent pas automatiquement** : si vous modifiez l'une, l'autre reste figée jusqu'à ce que vous la remplaciez à la main (retélécharger et écraser le fichier dans `docs/`, ou redemander la mise à jour ici). Pareil pour l'artifact : c'est une page web séparée, republiée à chaque itération ici, sans lien automatique avec le repo — pour qu'une session Claude Code s'en serve, il faut soit lui coller le lien, soit copier le SVG/PNG final directement dans les fichiers du projet (ce qui a été fait aujourd'hui pour les favicons et l'icône d'app). Le plus fiable si vous voulez que Claude Code applique un changement : décrire le changement ici pour que je le fasse dans les vrais fichiers du repo (comme aujourd'hui), plutôt que de compter sur une lecture indirecte.

## Points ouverts

- Liste précise des "8 critères vérifiés" (le contexte projet n'en cite que 5 explicitement : tranche d'âge, ombre, WC, clôture, PMR).
- Liste complète des types d'équipements à couvrir par une icône (à établir à partir des données OSM déjà collectées — champ `playground:*` probablement disponible sur une partie des 46 262 parcs).
- Décision de style : ligne simple vs. plein/duotone pour les icônes UI.
- Export haute résolution du logo (1024×1024 minimum) à obtenir de la source des visuels, avant tout export App Store/Play Store/splash screen.
- Génération effective des tailles Xcode `.colorset` / Android `colors.xml` / `capacitor.config` à partir des hex — pas encore fait.
- Liste réelle des catégories de signalement (seulement 2 nommées dans les docs : dégradation, info erronée).
- Design tokens dark mode (`tokens.css`) réalignés par dérivation automatique des hex de marque aujourd'hui — pas encore validés visuellement par le fondateur.
