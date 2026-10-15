# Kit de marque Toboggo v3 — source officielle unique

Copie **intacte** du kit officiel fourni par le fondateur (`Logos & icons/toboggo-brand-kit-v3`).
C'est la **seule référence** pour tout travail visuel. **Ne pas redessiner** un logo ni une
icône, **ne pas modifier** ces fichiers (en dériver des exports, jamais l'inverse), et
**ne pas utiliser** `docs/brand-assets/` (v1, obsolète).

## Contenu

| Dossier | Fichiers | Usage |
|---|---|---|
| `logo/` | `toboggo-color` (.svg, -1200/-2400.png) | **Logo horizontal couleur** (fond clair) : sites, e-mails, documents. Variante par défaut. |
| | `toboggo-on-dark` | Logo horizontal pour fond sombre/coloré (« Tobo » blanc, « ggo » amber) |
| | `toboggo-white` | Logo horizontal tout blanc (fond vert/photo sombre, monochrome) |
| | `toboggo-black` | Logo horizontal monochrome #24303A (impression, fond clair sans couleur) |
| | `toboggo-circle-green`, `toboggo-circle-white` | Logo en pastille ronde (avatars réseaux sociaux) |
| `icon/` | `app-icon` (arrondi), `app-icon-square`, `app-icon-circle`, `app-icon-circle-white` | Icône d'application (T blanc sur vert #2FA37C, boule amber) |
| | `symbol-T`, `symbol-T-white` | Symbole seul « T-toboggan » (sans fond) — marqueur de carte, sceau |
| `favicon/` | `favicon.svg/.ico`, `favicon-16/32/48/192/512`, `apple-touch-icon`, variantes `-circle` | Favicons et icône iOS |
| `illustration/` | `toboggo-illustration` (.svg, rond, carré ; PNG 512→2400) | Scène de parc : splash, onboarding, marketing — **jamais** favicon/icône |
| `cover/` | `og-1200x630`, `facebook-1640x624`, `linkedin-1584x396`, `x-twitter-1500x500`, `youtube-2560x1440` × `light`/`green` | Visuels réseaux sociaux / Open Graph |

Suffixes PNG = largeur en px (`-2400` = master haute résolution, à réduire, jamais à agrandir).

## Couleurs (relevées dans les SVG officiels)

| Rôle | Hex | Token |
|---|---|---|
| Vert marque (« Tobo », fond d'icône) | `#2FA37C` | `--color-primary` |
| Amber (« ggo », boule du T) | `#FFB020` | `--color-accent` |
| Texte / logo monochrome noir | `#24303A` | `--color-text` |
| Blanc (T sur fond vert, variantes) | `#FFFFFF` | — |
| Illustration uniquement | `#1F7D5F`, `#82C8B0`, `#CBE8DF`, `#FFD079` | `--color-primary-pressed` pour `#1F7D5F` |

Dans l'UI, passer par les tokens CSS (`packages/design-system/src/tokens.css`) ; les hex ne sont
autorisés que là où les tokens sont impossibles (SVG exportés, **e-mails**).

## Règles

- Le symbole T : barre horizontale droite, montant qui descend puis courbe vers la **droite**,
  boule amber à l'arrivée — ne jamais inverser.
- Garder les proportions (pas d'étirement) ; sur fond clair → `toboggo-color`, sur sombre → `toboggo-on-dark`/`white`.
- Les composants React (`packages/design-system` : `LogoMark`) et le logo e-mail sont des **dérivés**
  de ce kit ; en cas de doute, ce dossier fait foi.

## Dérivés dans le repo

- `apps/mobile/public/email/toboggo-logo-email.png` — `logo/toboggo-color-2400.png` réduit à 360×94 px
  (affiché 180 px). Contrôlé par `npm run email:check`.
- `packages/design-system/src/assets/brand/app-icon*.svg` — icônes v3 (`LogoMark`).
