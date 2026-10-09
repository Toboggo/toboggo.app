# Polices auto-hébergées

Fichiers de `public/fonts/`, servis depuis le domaine du site (aucune requête vers Google Fonts).

| Fichier | Famille | Sous-ensemble | Notes |
|---|---|---|---|
| `fredoka-latin.woff2` | Fredoka | latin | police **variable**, axe `wght` 300–700 (utilisés : 500, 600, 700) |
| `fredoka-latin-ext.woff2` | Fredoka | latin-ext | chargé uniquement si un caractère hors latin est affiché |
| `nunito-latin.woff2` | Nunito | latin | police **variable**, axe `wght` 200–1000 (utilisés : 400, 600, 700) |
| `nunito-latin-ext.woff2` | Nunito | latin-ext | idem |

- **Licence** : SIL Open Font License 1.1 (Fredoka — The Fredoka Project Authors ; Nunito — The Nunito Project Authors). Redistribution et auto-hébergement autorisés.
- **Source** : fichiers WOFF2 tels que servis par Google Fonts (Fredoka v17, Nunito v32), récupérés le 2026-10-09, non modifiés.
- **Déclaration** : `@font-face` dans `src/styles/global.css` (mêmes `unicode-range` que Google Fonts, `font-display: swap`). **Ordre à respecter : `latin-ext` avant `latin`.**
- **Pas de `<link rel="preload">`** : mesuré, il retarde le premier rendu (le navigateur attend les polices préchargées). Le décalage de mise en page (CLS) est évité par des polices de repli aux **métriques ajustées** (`Nunito Fallback`, `Fredoka Fallback`, Arial local + `size-adjust`/`ascent-override`/`descent-override`). Si une police change de version, remesurer ces valeurs (voir le commentaire dans `global.css`).
- **Cache** : `/fonts/*` est servi en `immutable` 1 an (`vercel.json`) : **renommer le fichier** à chaque changement.
- **Mise à jour** : remplacer les fichiers en conservant leurs noms ; mettre à jour la version ci-dessus.
