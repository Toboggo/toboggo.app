# Captures marketing — Website-2

Script Playwright ponctuel qui produit les 4 captures réelles de `apps/mobile`
utilisées comme mockups sur le site public (`apps/landing`) : Explorer,
Fiche parc, Filtres, Favoris. Rien n'est fabriqué — le script pilote l'UI
réelle exactement comme un utilisateur (navigation, clics, formulaire de
connexion), sur les données locales existantes.

## Prérequis

1. Supabase **local** démarré : `supabase start`.
2. Serveur mobile démarré : `npm run dev:mobile` (par défaut `:5173`).
3. `.env.local` à la racine du repo, avec `VITE_SUPABASE_URL` pointant vers
   `127.0.0.1`/`localhost` — **le script refuse de s'exécuter sinon** (garde-fou
   anti-prod, voir `capture-website2.mjs`).
4. Le compte de test `website2-captures-test@toboggo.local` doit déjà exister
   en local avec ses 4 favoris (créé manuellement lors de l'audit Website-2 —
   ce script ne le recrée pas).

## Usage

```bash
npm run captures:marketing
```

Port différent :

```bash
MOBILE_BASE_URL=http://localhost:5555 npm run captures:marketing
```

## Sortie

`apps/landing/public/screenshots/{explorer,park-detail,filters,favorites}.png`
— 375×812 CSS px, `deviceScaleFactor` 2 (≈ 750×1624 px réels).
