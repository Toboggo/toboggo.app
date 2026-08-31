# Toboggo — Design System

> **Référence de l'utilisation UI de l'identité Toboggo** : tokens, composants,
> tailles, espacements, navigation, et règles d'utilisation des logos et
> pictogrammes dans une interface. Créé le 31/08/2026 à l'issue de l'audit design.
>
> Complémentaire de **`docs/identite-visuelle-formats.md`** (l'identité visuelle
> validée elle-même : logos + variantes, couleurs de marque, pictogrammes,
> formats d'assets). Aucun des deux ne remplace l'autre. En cas de contradiction
> avec d'anciennes conversations ou des pages Notion sur la *manière d'utiliser*
> l'UI, ce document fait foi.

## 1. Rôle et articulation des références

**Repère rapide :**
- Dessiner / choisir un logo ou un pictogramme officiel → `docs/identite-visuelle-formats.md`
- Savoir comment l'utiliser dans une UI (token, taille, placement, composant) → `docs/DESIGN-SYSTEM.md` (ce fichier)
- L'implémenter → `packages/design-system`

| Référence | Répond à | Rôle |
|---|---|---|
| `docs/identite-visuelle-formats.md` | « À quoi ressemble l'identité officielle ? Quel fichier / format pour quel usage ? » | **Identité visuelle validée** : logos + variantes, couleurs de marque, pictogrammes, formats & assets (icône d'app, favicon, splash, Open Graph) |
| **`docs/DESIGN-SYSTEM.md`** (ce fichier) | « Comment utiliser cette identité dans une UI ? » | **Utilisation UI** : tokens, composants, tailles, espacements, navigation, règles de placement des logos / pictogrammes, décisions fondateur, feuille de route du chantier design |
| `packages/design-system/` | « Comment c'est implémenté ? » | **Implémentation exécutable** : tokens CSS + primitives + `Logo` + sprite d'icônes |
| `docs/brand-assets/` | — | Fichiers logo / icône d'app d'origine (PNG ~270 px + « SVG » = PNG encapsulés) |
| `docs/Toboggo-Brand-Guidelines.pdf` | — | Présentation éditoriale (à montrer, pas à coder depuis). Non tracké. |
| Artifact Cowork « Brand kit » `1de5ba03-434f-45f3-a84e-6c280984f93f` | — | Bibliothèque visuelle vivante, **non connectée** à Claude Code |
| Artifact « Brand Guidelines » `b93e1fc5-26a7-4e22-970c-cd31546678e1` | — | Présentation éditoriale, **non connectée** |

**Aucune de ces sources ne se synchronise automatiquement.** Toute évolution de
marque se répercute à la main : `identite-visuelle-formats.md` (l'identité) →
`DESIGN-SYSTEM.md` (son usage) → `packages/design-system` (le code).

## 2. Décisions fondateur — 31/08/2026

Prises à la validation de l'audit design. Cadre : avancement progressif, **sans
refonte**, sans toucher à Supabase / données / cartographie / Vercel / logique
métier / migrations DB.

1. **Documentation design** = deux fichiers complémentaires :
   `docs/identite-visuelle-formats.md` pour l'**identité visuelle validée**
   (logos + variantes, couleurs, pictogrammes, formats/assets) et
   `docs/DESIGN-SYSTEM.md` (ce fichier) pour l'**utilisation UI** (tokens,
   composants, tailles, spacing, navigation, règles d'emploi des logos et
   pictogrammes). `packages/design-system` en est l'implémentation exécutable.
2. **Onglet 4 de la barre de navigation mobile** = « Contributions » (le libellé
   « Signalements » évoqué côté Notion est écarté).
3. **Catégories de signalement** = on conserve les **7 catégories métier
   existantes** (`broken_equipment`, `safety`, `cleanliness`, `vegetation`,
   `accessibility`, `wrong_info`, `other`). Les icônes `ic-report-*` du sprite
   sont donc à finaliser sur ces 7 entrées.
4. **8 critères vérifiés** = âge · ombre · WC · clôture · accessibilité PMR ·
   bancs · eau potable · parking. Icônes cibles : `ic-age`, `ic-shade`,
   `ic-toilets`, `ic-fence`, `ic-pmr`, `ic-bench`, `ic-water`, `ic-parking`.
5. **Icônes back-office** = même système Toboggo, exécution **légèrement plus
   sobre / pro** (pas un second jeu d'icônes).
6. **Aucun emoji** utilisé comme pictogramme d'interface à terme. (Un emoji
   purement éditorial — ex. confetti de succès — reste à trancher au cas par cas.)
7. **Admin vs Collectivité** = distinction **légère** par badge / libellé.
   **Pas de seconde palette**, pas de couleur d'accent dédiée.
8. **Mode sombre** = **différé**. On préserve son architecture technique
   (`[data-theme="dark"]` dans `tokens.css`, `useTheme`) mais la priorité est le
   light mode ; le dark n'est pas validé et ne doit pas s'activer tout seul
   (pas de `@media (prefers-color-scheme: dark)`).
9. **Logo** : ne jamais utiliser un PNG basse résolution agrandi comme source.
   Un export haute résolution (≥ 1024×1024) sera redemandé avant tout usage
   store / splash / Open Graph.
10. **Landing** : retirer / neutraliser à terme les statistiques marketing non
    réelles (« 2 400+ parcs », « 18 000+ avis », « 4.8/5 »).

## 3. Couleurs

7 teintes de marque. **Toujours passer par les tokens** (`var(--color-*)`),
jamais de hex en dur — c'est la condition pour que le dark mode reste cohérent
et pour éviter les dérives (`#16a34a` vert Tailwind, `#059669`, `#f08a2e`… vus
partout dans l'app mobile lors de l'audit).

| Nom | Hex | Token | Usage |
|---|---|---|---|
| Vert principal | `#2FA37C` | `--color-primary` | Actions, sélection, marque |
| Vert profond | `#1F7D5F` | `--color-primary-pressed` | Fin de dégradé, état pressé |
| Amber | `#FFB020` | `--color-accent` | Accent, boule du logo, étoiles, alertes douces |
| Bleu | `#4C9EEB` | `--color-info` | Filtres, liens, info |
| Crème | `#FFF8EC` | `--color-bg` | Fond principal |
| Encre | `#24303A` | `--color-text` | Texte principal |
| Gris muted | `#8A8578` | `--color-text-muted` | Texte secondaire, icônes inactives |

Tokens dérivés : `--color-primary-hover` `#268F6C`, `--color-primary-tint`
`#E6F5EE`, `--color-on-primary` `#FFFFFF`, `--color-accent-tint` `#FFF3DC`,
`--color-info-tint` `#EAF3FD`, `--color-bg-alt` `#F3EFE3`, `--color-surface`
`#FFFFFF`, `--color-surface-alt` `#F8F5EC`, `--color-text-faint` `#A8A190`,
`--color-border` `#ECE6D8`, `--color-border-strong` `#F1ECE0`, `--color-error`
`#EF4444` (+ `-tint`), `--color-warning-bg` / `--color-warning-text`.
`--color-success` / `--color-success-tint` sont des alias du vert de marque
(ajoutés en DESIGN-1 pour l'usage sémantique). `--color-overlay` = voile des
modales.

> Note : `--color-border-strong` est actuellement *plus clair* que
> `--color-border` malgré son nom. Non corrigé (changerait le rendu des champs,
> chips, boutons secondaires) — à traiter en phase composants.

## 4. Typographie

- **Fredoka** (`--font-heading`) — titres, boutons, libellés, badges. Chargée en
  graisses 500 / 600 / 700.
- **Nunito** (`--font-body`) — texte courant. Graisses 400 / 600 / 700.
- Les deux via Google Fonts (mêmes `<link>` dans les 3 surfaces).

Échelle de référence (tokens ajoutés en DESIGN-1, **pas encore appliquée écran
par écran** — migration DESIGN-7/8) :

| Token | Valeur | Usage indicatif |
|---|---|---|
| `--text-xs` | 12px | captions, aides de champ |
| `--text-sm` | 13px | libellés, méta |
| `--text-base` | 15px | corps, boutons |
| `--text-lg` | 18px | titres de dialogue |
| `--text-xl` | 22px | titres d'écran (back-office) |
| `--text-2xl` | 26px | titres d'écran (mobile), chiffres stat |

`--leading-tight` 1.2 · `--leading-normal` 1.5 · `--weight-regular/medium/semibold/bold` = 400/500/600/700.

## 5. Espacements, rayons, ombres, motion, z-index

- **Espacements** base 4px : `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 ·
  `-6` 24 · `-7` 28 · `-8` 32. (`--space-7` ajouté en DESIGN-1.)
- **Rayons** : `--radius-xs` 10 · `-sm` 14 · `-md` 18 · `-lg` 26 · `-pill` 999.
- **Ombres** : `--shadow-sm` / `-md` / `-lg` (clair + sombre).
- **Motion** (référence, non appliqué) : `--duration-fast` 120ms ·
  `--duration-base` 200ms · `--ease-standard` ease · `--ease-emphasized`
  `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Z-index** (documente l'existant) : `--z-nav` 50 · `--z-sheet-backdrop` 90 ·
  `--z-sheet` 95 · `--z-dialog` 100 · `--z-toast` 200.

Ne jamais improviser un padding / rayon / ombre en dur : utiliser ces variables.

## 6. Logo

- **Composant unique** : `packages/design-system/src/components/Logo.tsx` —
  `<Logo />` (lockup marque + wordmark « Toboggo » en Fredoka) et `<LogoMark />`
  (le symbole seul). **Seule implémentation autorisée** dans le code React
  (mobile, back-office). `apps/mobile/src/components/Logo.tsx` n'est qu'un
  ré-export.
- **Deux variantes de wordmark** (prop `variant`) :
  - `variant="brand"` — **wordmark bicolore officiel** : « Tobo » en vert de
    marque (`--color-primary`), « ggo » en amber (`--color-accent`), via tokens
    (jamais de hex en dur). C'est l'identité validée (cf.
    `identite-visuelle-formats.md`). À utiliser sur les surfaces
    marketing / onboarding / hero — **Splash, écran d'auth**.
  - `variant="mono"` (**défaut**) — wordmark une seule couleur, qui suit la
    couleur du texte (ou blanc forcé via `tone="light"`). Pour les surfaces
    denses / fonctionnelles et les fonds colorés : **sidebar back-office, nav
    landing, petites tailles**.
  - `tone` ne s'applique qu'à `variant="mono"` ; la variante bicolore garde ses
    couleurs de marque sur tout fond.
  - Le **swoosh décoratif** deux tons du fichier `02-wordmark-toboggo` n'est
    **pas** reproduit par le composant (c'est le lockup, pas l'artwork) — pour
    un usage print / marketing pixel-perfect, utiliser le fichier asset.
- **Ne pas recomposer le wordmark à la main.** Le Splash et l'écran d'auth
  affichaient un faux wordmark aux couleurs **non conformes** (`#059669` /
  `#f08a2e`, sans symbole) — remplacé par `<Logo variant="brand">` en DESIGN-2
  (31/08/2026).
- **Tracé du symbole (« T-toboggan »)** : barre horizontale, le montant descend
  puis courbe vers la **droite** en glissière, boule amber à l'arrivée. Ne pas
  inverser le sens (erreur déjà commise et corrigée le 29/08/2026).
- **`apps/landing`** (HTML statique, sans build) : le même SVG est dupliqué en
  dur dans `index.html` (nav + footer). Si le logo change, mettre à jour les
  deux copies.
- **Fichiers sources** (`docs/brand-assets/`) : `02-wordmark-toboggo`,
  `03-t-monogram`, `05-app-icon-square`, `08-favicon-circle`,
  `01-playground-logo` (variante illustrée — splash / onboarding / marketing,
  jamais favicon). PNG ~270 px : **suffisant web/favicon, insuffisant pour un
  export store 1024×1024** — export HD à redemander (décision fondateur #9).
- Favicons / icônes d'app à jour dans les 3 `public/` — ne pas les recréer à la
  main.

## 7. Système d'icônes

- `packages/design-system/src/icons/icons-sprite.svg` : 47 `<symbol>`,
  viewBox 24×24, trait 1.6px arrondi, `stroke="currentColor"`. Copié à
  l'identique dans `apps/mobile/public/` et `apps/backoffice/public/` (chargé
  au runtime par `useIconSprite()`, déjà appelé dans les deux `App.tsx`).
- Composant `<Icon name="ic-xxx" size={24} />` (`icons/Icon.tsx`) ; `IconName`
  liste les noms valides.
- **État réel (audit 31/08/2026) : le sprite est chargé mais `<Icon>` n'est
  utilisé nulle part.** Toutes les icônes UI sont aujourd'hui des emojis ou des
  `<svg>` inline dessinés à la main. **L'adoption du sprite est la phase
  DESIGN-3** (non démarrée à ce jour).
- Toute nouvelle icône : l'ajouter comme `<symbol>` dans **les 3 copies** du
  sprite + à `IconName` — pas de synchro automatique. Ne pas redessiner à la
  main : partir de l'artifact « Brand kit » (le fondateur colle le SVG).
- **Non validé par le fondateur, à retravailler** : `ic-age` (≈ `ic-user`),
  `ic-toilets`, `ic-pingpong`, `ic-report-info`. Modifications de `ic-climb` /
  `ic-motor` **non commitées** dans le working tree (à ne pas toucher pour
  l'instant).
- Icônes back-office : même système, exécution plus sobre (décision #5).

## 8. Composants (`packages/design-system`)

Primitives livrées : `Button` (`primary` / `secondary` / `ghost` / `danger`,
`size md/sm`, `block`, `loading`), `IconButton`, `Card`, `Tag`, `Chip`,
`Input` / `Textarea` / `Select` / `PasswordInput`, `Segmented`, `Toggle`,
`DualRangeSlider`, `Dialog`, `BottomSheet`, `StarRating` / `StarInput`,
`Avatar`, `Toast`, `EmptyState`, `StepDots`, `StatCard`, `Table`, `Logo` /
`LogoMark`, `Icon`.

**Manques identifiés (audit)** — à créer dans les phases suivantes :
`Checkbox`, `Radio`, `Spinner`, `Skeleton`, `Banner/Alert`, un `ScreenHeader`
unifié (fusion `TopBar` + `DetailHeader` + `WizardHeader` + `PageHeader`), un
`BottomNav` extrait, un `Menu`. `EmptyState.icon` prend aujourd'hui une string
emoji — à migrer vers `IconName`.

Les apps doivent **consommer** ces composants plutôt que recréer leurs styles
(l'audit a relevé des ré-implémentations locales : toggle / slider / boutons /
étoiles / header).

## 9. Mode sombre — différé

Architecture conservée : tokens `[data-theme="dark"]` dans `tokens.css`,
bascule via `useTheme` (défaut light). **Pas de `@media
(prefers-color-scheme: dark)`** — activation opt-in seulement. Les valeurs dark
sont dérivées automatiquement et **non validées visuellement**. Le dark mode est
de toute façon cassé partout où l'app écrit des hex en dur : sa validation n'a
de sens qu'**après** la migration vers tokens (DESIGN-7/8).

## 10. Landing (`apps/landing`)

Site statique sans build : `styles.css` re-déclare un sous-ensemble de tokens à
la main. **Divergences connues à réconcilier en DESIGN-9** :

- `--color-text-muted` = `#6b6a63` (≠ `#8a8578` du design system).
- `.btn` `padding: 13px 24px` (≠ `14px 22px`).
- Champs de formulaire `border-radius: 12px` (≠ `--radius-sm` 14).
- Pas de `--color-info`, pas d'échelle d'espacement, **pas de dark mode**.
- Grille « 8 critères » et étoiles de témoignages en **emoji / texte** (à passer
  en SVG).
- Boutons stores `href="#"` + glyphes `📱` / `▶` (à masquer/désactiver tant que
  l'app n'est pas soumise).
- Stats marketing non réelles (décision #10).

Convention (rappel `CLAUDE.md`) : tout nouveau token ajouté au design system
doit être répercuté ici si la landing en a besoin.

## 11. Chantier design — feuille de route

Issu de l'audit du 31/08/2026. Progressif, sans refonte.

| Phase | Objet | Statut |
|---|---|---|
| **DESIGN-1** | Consolidation des tokens (typo / motion / z-index / overlay / `--space-7` / `--color-success`), additif, zéro changement visuel | ✅ fait (31/08/2026) |
| **DESIGN-2** | `docs/DESIGN-SYSTEM.md` + articulation des docs + fix refs `CLAUDE.md` ; `<Logo variant="brand">` (wordmark bicolore officiel via tokens) appliqué au Splash et à l'écran d'auth | ✅ fait (31/08/2026) |
| DESIGN-3 | Adoption du système d'icônes (remplacer emojis + SVG inline par `<Icon>`) | ⏳ non démarré |
| DESIGN-4 | Boutons / champs / contrôles de formulaire (+ Checkbox, Radio, Spinner) | ⏳ |
| DESIGN-5 | Cards / badges / chips / états (Skeleton, Banner, étoiles unifiées) | ⏳ |
| DESIGN-6 | Navigation + overlays (`ScreenHeader`, `BottomNav`, `Menu`) | ⏳ |
| DESIGN-7 | App Parents — migration écran par écran vers les tokens | ⏳ |
| DESIGN-8 | Back-office — sortir des `style={{}}` inline, tokeniser | ⏳ |
| DESIGN-9 | Landing — aligner tokens, retirer emojis + stats non réelles | ⏳ |
| DESIGN-10 | Responsive + accessibilité + QA visuelle (light d'abord) | ⏳ |

## 12. Points de synchronisation restants (dette doc)

- Les en-têtes de `icons-sprite.svg` (×3) et le commentaire de `Icon.tsx`
  renvoient à `docs/identite-visuelle-formats.md` pour l'état de validation des
  groupes d'icônes — à revoir lors de DESIGN-3, en distinguant identité (→
  `identite-visuelle-formats.md`) et règles d'usage (→ ce fichier). Les 3
  sprites ont des modifs non commitées : on n'y touche pas maintenant.
- `apps/mobile/src/components/Logo.tsx` : ré-export sans importeur — nettoyage
  possible en DESIGN-6.
