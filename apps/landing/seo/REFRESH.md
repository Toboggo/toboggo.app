# Rafraîchissement des données (Deploy Hook Vercel)

Le site est **statique** : les données Supabase sont lues **au build**. Toute modification en base n'apparaît qu'au prochain déploiement. Le Deploy Hook permet de le déclencher sans commit.

**Rien n'est configuré** : ni le hook Vercel, ni le workflow. Ce document dit exactement quoi faire.

## 1. Créer le Deploy Hook (toi, dans Vercel)
1. Projet **toboggo-website** → *Settings* → *Git* → *Deploy Hooks*.
2. Nom : `data-refresh` ; branche : `main`.
3. Copier l'URL générée (elle contient un secret — ne la committe jamais, ne la colle pas dans un chat).

## 2. Déclenchement manuel
```bash
curl -X POST "$VERCEL_DEPLOY_HOOK_URL"
```
(à lancer depuis ta machine avec l'URL en variable d'environnement.) Un build de production démarre ; les logs affichent `[seo] snapshot : N parcs …` et `[seo] … pages publiées (…)`.

## 3. Déclenchement nocturne
Option recommandée : **GitHub Actions** (planification gratuite, secret chiffré).
1. Dépôt GitHub → *Settings* → *Secrets and variables* → *Actions* → **New repository secret** : `VERCEL_DEPLOY_HOOK_URL` = l'URL du hook.
2. Copier `refresh-workflow.draft.yml` vers `.github/workflows/landing-data-refresh.yml` (fichier hors `apps/landing` : à faire par toi ou sur demande explicite).
3. Vérifier à la main une première fois (*Actions* → *Run workflow*).

Alternative : un cron Vercel appelant le hook (nécessite une route serverless, donc non recommandé pour un site statique).

## À surveiller
- **Fréquence** : une fois par nuit suffit ; ne pas brancher le hook sur chaque écriture en base (risque d'inonder les builds).
- **Échec volontaire du build** : si la lecture Supabase est tronquée ou incohérente (`[seo] … content-range`, total différent, trop peu de lignes), ou si une ville validée n'est plus éligible en production, le build **échoue** et l'ancien site reste en ligne. C'est le comportement voulu : il suffit de lire les logs.
- Les variables `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` doivent exister en **Production**.
