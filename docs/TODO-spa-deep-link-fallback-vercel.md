# TODO — SPA deep-link fallback Vercel

Constaté le 2026-09-30 : `curl -I https://toboggo-app.vercel.app/some/deep/route` → **404**.
`apps/mobile` n'a pas de rewrite SPA (`vercel.json` ne contient que des headers de cache).
Une ouverture directe d'une URL profonde (ex. `/park/<id>`) sans service worker installé
échoue côté serveur ; seule une PWA déjà installée la sert via la NavigationRoute du SW.

À faire (hors lot PWA) : ajouter dans `apps/mobile/vercel.json` un rewrite
`/(.*) → /index.html` qui n'intercepte PAS les fichiers statiques (`/assets/*`, `sw.js`,
`manifest.webmanifest`, icônes) — un asset manquant doit rester un 404, pas du HTML.
Vérifier ensuite : deep link en navigation privée, `/assets/inexistant.js` → 404.
