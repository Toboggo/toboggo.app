# Blog Toboggo — Sanity

Le blog du site public (`apps/landing`, Astro statique, URL `/guides/…`) est alimenté par **Sanity**
(projet `1m1y03h0`, dataset `production`, plan gratuit). L'édition se fait dans **Sanity Studio**
(`apps/studio`, interface en français).

```
Éditeur ──▶ Studio (apps/studio) ──▶ Sanity (dataset production)
                                        │  publication
                                        ▼  webhook
                              Vercel Deploy Hook ──▶ build du site (lit Sanity) ──▶ pages HTML statiques
Prévisualisation : Studio ─(secret court)─▶ /api/preview/enable/ ─(cookie signé)─▶ /apercu/<slug>/ (rendu à la demande)
```

## Ce qui est en place

| Élément | Où |
|---|---|
| Modèles `Article`, `Catégorie`, `Auteur` | `apps/studio/schemaTypes/` |
| Liste `/guides/`, détail `/guides/<slug>/` | `apps/landing/src/pages/guides/` |
| Accès Sanity, GROQ, rendu du contenu riche, SEO | `apps/landing/src/lib/blog/` |
| Aperçu authentifié des brouillons | `src/pages/apercu/[slug].astro`, `src/pages/api/preview/*`, `src/lib/blog/previewSession.ts` |
| Sitemap (articles + `lastmod`) | `apps/landing/astro.config.mjs` |
| Tests (brouillons exclus, cookie, HTML, JSON-LD) | `apps/landing/src/lib/blog/blog.test.ts` |

- **Contenu dans le HTML** : tout est généré au build ; aucune requête Sanity depuis le navigateur.
- **SEO** : `<title>` / description = champs « SEO » (repli : titre / résumé), canonical sur `SITE_URL`, Open Graph
  `article` + `article:*`, `summary_large_image` (couverture recadrée 1200×630), JSON-LD `Article` + `BreadcrumbList`,
  `lastmod` dans le sitemap.
- **URL conservées** : `/guides/` existait déjà (page « à venir ») et garde la même URL. Il n'existait **aucun article** à
  migrer (3 sujets « à venir » sans contenu) : rien n'a été perdu. Tant qu'aucun article n'est publié, `/guides/` reste
  `noindex` et hors sitemap, avec les 3 sujets « à venir » ; dès le premier article publié il devient indexable.
- **Brouillons** : jamais exportés. Le site interroge la perspective `published` + filtre explicite
  `!(_id in path("drafts.**"))`, slug obligatoire, `publishedAt <= now()`.
- **Date de publication future** : l'article n'apparaît qu'au premier build après cette date (site statique) —
  déclencher un redéploiement manuel ce jour-là.
- **Images** : servies par `cdn.sanity.io` (redimensionnées, `srcset`) ; autorisé dans la CSP (`img-src`) de `vercel.json`.

## Variables d'environnement

| Variable | Où | Secret ? | Rôle |
|---|---|---|---|
| `SANITY_API_READ_TOKEN` | Vercel (projet `toboggo-website`, **Production + Preview**) ; `apps/landing/.env.local` en local | **OUI** (serveur uniquement, jamais `PUBLIC_`) | Jeton « Viewer » : prévisualisation des brouillons (obligatoire) et lecture du contenu publié si le dataset devient privé |
| `SANITY_PROJECT_ID`, `SANITY_DATASET` | idem | non (facultatif) | Défauts `1m1y03h0` / `production` |
| `SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET`, `SANITY_STUDIO_SITE_URL` | `apps/studio/.env.local` (voir `.env.example`) | non (publiques par construction) | Config du Studio ; `SITE_URL` = origine utilisée par « Prévisualiser » |

Le jeton n'est lu que dans `src/lib/blog/client.ts` (frontmatter Astro / endpoints), jamais dans un script navigateur.
Vérification : `grep -r "<le jeton>" apps/landing/dist` ne doit rien renvoyer.

## Réglages manuels (une seule fois)

### Sanity (manage.sanity.io → projet `1m1y03h0`)
1. **API → Tokens → Add API token** : nom `toboggo-website-read`, permission **Viewer**. Copier la valeur (affichée une fois).
2. **API → Webhooks → Create** : nom `Redéploiement site`, URL = le Deploy Hook Vercel (ci-dessous), méthode `POST`,
   dataset `production`, déclencheurs **Create, Update, Delete**, filtre
   `_type in ["article", "category", "author"]`, projection `{}`. Par défaut les webhooks ne partent que sur les
   documents **publiés** (pas à chaque frappe d'un brouillon).
3. **API → CORS origins** : aucune entrée nécessaire pour le site (requêtes serveur). Le Studio hébergé sur
   `*.sanity.studio` est autorisé automatiquement ; pour un Studio ailleurs, ajouter son origine avec « Allow credentials ».
4. **Membres** : inviter les rédacteurs (rôle *Editor*), ils auront accès au Studio et à la prévisualisation.

### Vercel (projet `toboggo-website`)
1. **Settings → Environment Variables** : ajouter `SANITY_API_READ_TOKEN` (Production **et** Preview), puis redéployer.
2. **Settings → Git → Deploy Hooks → Create Hook** : nom `sanity-publish`, branche `main` ; copier l'URL dans le webhook Sanity.
3. **Settings → General → Build & Output** : **Output Directory = vide (défaut)**. L'adapter `@astrojs/vercel` écrit
   `.vercel/output` ; un override « Output Directory » (ex. `dist`) casserait la prévisualisation.
4. **Node.js Version : 22.x** (requis par Astro 7 et le Studio).
5. **Deployment Protection** : si la protection est active sur les Preview, l'aperçu de PR demande une connexion Vercel (normal).

### Studio
Hébergement gratuit par Sanity :
```bash
npm run install:studio        # une fois (le Studio a son propre package-lock, hors workspaces)
cd apps/studio && npx sanity login && npx sanity deploy   # choisir un nom d'hôte, ex. toboggo
```
Le Studio sera accessible sur `https://<nom>.sanity.studio`. En local : `npm run install:studio && npm run dev:studio`
(http://localhost:3333).

## Rédiger, prévisualiser, publier

1. Studio → **Article** → *Créer*. Remplir : titre, **slug** (bouton *Générer*, unique, ne plus le changer après
   publication), résumé, **image de couverture + texte alternatif** (obligatoire), catégorie, auteur (à créer au préalable
   dans *Catégorie* / *Auteur*), date de publication, contenu (titres H2–H4, listes, citation, liens, images avec alt).
   Onglet **Référencement (SEO)** : titre SEO (≤ 60 car.) et description SEO (≤ 155 car.), facultatifs.
2. **Prévisualiser** : menu d'actions du document (`⋯` à côté de *Publier*) → **Prévisualiser**. Le Studio génère un
   secret valable 1 h, le site le vérifie côté serveur, pose un cookie, puis affiche le **brouillon** sur
   `/apercu/<slug>/` (bandeau « Prévisualisation du brouillon », `noindex`, jamais mis en cache). Seul un membre
   du projet Sanity peut produire ce secret.
3. **Publier** : bouton **Publier**. Le webhook déclenche un build Vercel (≈ 1 à 2 min) ; l'article apparaît sur
   `/guides/<slug>/`, dans `/guides/`, sur l'accueil (3 derniers) et dans le sitemap.
4. **Modifier** un article publié : éditer, *Publier* à nouveau ; renseigner « Date de modification » seulement pour
   une mise à jour de fond. **Dépublier / supprimer** : l'article disparaît au build suivant (l'ancienne URL renverra 404).

## Limites connues
- Site statique : une publication n'est visible qu'après le build déclenché par le webhook (1–2 min).
- Le recadrage des images utilise le centre (le point focal « hotspot » n'est pas appliqué).
- Si Sanity est indisponible pendant un build, le build échoue volontairement (sinon le blog serait vidé sans bruit) ;
  le site déjà en ligne reste intact.
- `apps/studio` est hors des workspaces npm racine (un paquet transitif de Sanity remplace le binaire `tsc` du
  monorepo) : il a son propre `package-lock.json` ; scripts racine `install:studio`, `dev:studio`, `build:studio`,
  `typecheck:studio`.
