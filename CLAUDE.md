# Toboggo — instructions pour Claude Code

Monorepo npm workspaces : `apps/mobile`, `apps/landing`, `apps/backoffice`, `packages/design-system`, `packages/shared`.

- `npm run dev:mobile` / `npm run dev:backoffice` — lancer en dev
- `npm run build` — build mobile + backoffice
- `npm run lint` / `npm run typecheck`

Le design d'origine (prototype Claude Design) vit dans `../Claude Design files Localisateur de parcs enfants/` (hors repo) — voir `README.md` à la racine pour le contexte du handoff.

## Identité visuelle — à respecter partout, ne pas réinventer

Toute icône, logo, couleur ou pictogramme ajouté ou modifié dans ce projet doit respecter deux références **complémentaires** :
- **`docs/identite-visuelle-formats.md`** — l'**identité visuelle validée** : logos et variantes, couleurs de marque, pictogrammes, formats & fichiers d'assets. Les fichiers logo/icône d'origine sont dans **`docs/brand-assets/`**.
- **`docs/DESIGN-SYSTEM.md`** — **comment l'utiliser en UI** : tokens, composants, tailles, espacements, navigation, règles de placement des logos et pictogrammes, décisions fondateur, feuille de route du chantier design.

Repère : dessiner/choisir l'officiel → identité visuelle ; l'utiliser en UI → DESIGN-SYSTEM ; l'implémenter → `packages/design-system`. Ne pas redessiner le logo, ne pas inventer une nouvelle teinte de vert/orange/bleu à l'œil : réutiliser ce qui existe déjà.

**Couleurs de marque** (définies dans `packages/design-system/src/tokens.css`, dupliquées dans `apps/landing/styles.css` — dupliquer aussi côté landing pour tout nouveau token) :
- Vert `#2FA37C` → `#1F7D5F` (dégradé) — couleur primaire, marque
- Amber `#FFB020` — accent
- Bleu `#4C9EEB` — info
- Crème `#FFF8EC` — fond
- Encre `#24303A` — texte
- Gris muted `#8A8578` — texte secondaire

Toujours passer par les CSS custom properties (`var(--color-primary)`, etc.) plutôt que des hex en dur, pour que le thème sombre reste cohérent.

**Espacements, rayons, ombres, typographie** : mêmes principes, définis dans `packages/design-system/src/tokens.css` (`--space-1` à `--space-8` en base 4px, `--radius-xs` à `--radius-pill`, `--shadow-sm/md/lg`, échelle typo `--text-*`, `--font-heading` = Fredoka, `--font-body` = Nunito ; motion et z-index aussi tokenisés). Liste complète et à jour dans `docs/DESIGN-SYSTEM.md`. Ne pas improviser un padding ou un rayon en dur : utiliser ces variables.

**Logo** : composant `packages/design-system/src/components/Logo.tsx` (`<Logo />` / `<LogoMark />`) — c'est la seule implémentation à utiliser dans le code React (mobile, backoffice). Utiliser `<Logo variant="brand" />` (wordmark bicolore officiel « Tobo » vert / « ggo » amber, via tokens) sur les surfaces marketing/onboarding (Splash, auth) ; `variant="mono"` (défaut) ailleurs (sidebar backoffice, petites tailles, fonds colorés). `apps/landing` est en HTML statique sans build : le même SVG y est dupliqué en dur (nav + footer dans `index.html`) — si le logo change, mettre à jour les deux. Le tracé du "T-toboggan" : barre horizontale, le montant descend puis courbe vers la **droite**, boule amber à l'arrivée — ne pas inverser le sens de la courbe (erreur déjà faite une fois, corrigée le 29/08/2026 après vérification pixel par pixel sur les fichiers sources).

**Fichiers logo réels** (`docs/brand-assets/`) : `02-wordmark-toboggo` (logo complet texte), `03-t-monogram` (T seul), `05-app-icon-square` / `08-favicon-circle` (icône d'app carrée/ronde), `01-playground-logo` (variante illustrée — splash/onboarding/marketing uniquement, pas favicon). Résolution source limitée (~270px) — insuffisant pour un export App Store/Play Store 1024×1024, à ne pas utiliser tel quel pour ces exports sans re-demander une version haute résolution.

**Favicons/icônes d'app** déjà à jour dans `apps/mobile/public/`, `apps/landing/assets/`, `apps/backoffice/public/` (favicon.svg, apple-touch-icon.png, icon-192.png, icon-512.png) — régénérés depuis les fichiers réels le 29/08/2026, ne pas les recréer à la main.

**Icônes UI** (filtres, équipements de jeu, services, navigation, badges, back-office, signalement) : exportées dans `packages/design-system/src/icons/icons-sprite.svg` (47 symboles, `stroke="currentColor"`) + composant `<Icon name="ic-xxx" />` (`packages/design-system/src/icons/Icon.tsx`). Le sprite est aussi copié dans `apps/mobile/public/` et `apps/backoffice/public/` (chargé au runtime via `useIconSprite()`, déjà appelé dans les deux `App.tsx`). Utiliser `<Icon name="ic-slide" size={24} />` plutôt que redessiner une icône équivalente. `IconName` liste les noms valides — regénérer cette liste si le sprite change (`grep '<symbol id=' icons-sprite.svg`).

C'est un **export ponctuel (29/08/2026) d'un brouillon**, et à ce jour **`<Icon>` n'est utilisé nulle part** — l'adoption du sprite est la phase DESIGN-3 (pas démarrée). Décisions fondateur (31/08/2026, voir `docs/DESIGN-SYSTEM.md` §2) : on conserve les **7 catégories de signalement** métier existantes ; les icônes back-office restent le même système Toboggo, exécution un peu plus sobre ; `ic-age`/`ic-toilets`/`ic-pingpong`/`ic-report-info` restent à retravailler. Si le fondateur colle un nouveau SVG copié depuis l'artifact Cowork "Logo, couleurs & pictogrammes" (qui reste la référence vivante, non connectée à Claude Code), l'ajouter comme nouveau `<symbol>` dans `icons-sprite.svg` (les 3 copies : design-system + les 2 `public/`) et l'ajouter à `IconName`, plutôt que redessiner à la main.

**Deux références vivantes, ni l'une ni l'autre connectée à Claude Code** — pour voir un composant, une icône ou un état avant de le coder, demander au fondateur le lien ou lui faire coller le SVG/CSS ici plutôt que deviner :
- Kit interactif "Logo, couleurs & pictogrammes" (logo, couleurs, typographie, espacements/rayons/ombres, composants UI, tous les pictogrammes — copiables en un clic) : `https://claude.ai/code/artifact/1de5ba03-434f-45f3-a84e-6c280984f93f`
- Document "Brand Guidelines" (présentation éditoriale : mission, règles d'usage du logo, ton & voix — à montrer, pas à coder depuis) : `https://claude.ai/code/artifact/b93e1fc5-26a7-4e22-970c-cd31546678e1`
