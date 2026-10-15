# Modèles d'e-mails Supabase Auth (français, logo officiel)

Modèles HTML **à copier dans le dashboard Supabase** (Auth → Email Templates, onglets
Templates et Notifications). Ce dossier ne modifie ni Supabase ni Resend : rien n'est
appliqué tant que vous ne collez pas les modèles à la main. `config.toml` est volontairement
inchangé (`supabase config push` écraserait les modèles distants).

Générés par `npm run email:build` (source : `build.mjs`), contrôlés par `npm run email:check`.

## Logo

- Source : kit officiel v3, `logo/toboggo-color-2400.png` (logo horizontal couleur), réduit
  sans déformation à 360×94 px (affiché 180×47 px, soit 2× pour les écrans HD).
- Fichier : `apps/mobile/public/email/toboggo-logo-email.png` (copié tel quel dans `dist/email/` au build).
- URL utilisée : `https://toboggo-app.vercel.app/email/toboggo-logo-email.png` (domaine public déjà
  utilisé par l'app, cf. `ShareSheet.tsx`). **Aucun domaine inventé** ; si un domaine personnalisé
  est adopté, changer `LOGO_URL` dans `build.mjs` puis `npm run email:build`.

## Modèles → emplacement dashboard, objet, variables

| Fichier | Emplacement | Objet conseillé | Variables Supabase |
|---|---|---|---|
| `confirmation.html` | Confirm signup | Confirmez votre adresse e-mail | `{{ .ConfirmationURL }}` |
| `recovery.html` | Reset password | Réinitialisez votre mot de passe Toboggo | `{{ .ConfirmationURL }}` |
| `email_change.html` | Change email address | Confirmez votre nouvelle adresse e-mail | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| `invite.html` | Invite user | Vous êtes invité(e) à rejoindre Toboggo | `{{ .ConfirmationURL }}` |
| `magic_link.html` | Magic link | Votre lien de connexion Toboggo | `{{ .ConfirmationURL }}` |
| `reauthentication.html` | Reauthentication | Votre code de confirmation Toboggo | `{{ .Token }}` |
| `notification_password_changed.html` | Notifications → Password changed | Votre mot de passe Toboggo a été modifié | `{{ .Email }}` |
| `notification_email_changed.html` | Notifications → Email address changed | L'adresse e-mail de votre compte Toboggo a été modifiée | `{{ .OldEmail }}`, `{{ .NewEmail }}` |

## À vérifier avant installation (non faisable depuis le repo)

1. **Comparer avec le dashboard** : les textes et variables actuellement configurés ne sont pas
   accessibles depuis le repo (`config.toml` n'en versionne aucun). Les textes ici sont des
   propositions françaises ; relire les modèles existants (et leurs éventuelles variables
   personnalisées) avant de les remplacer.
2. **Variables des notifications** : `{{ .Email }}`, `{{ .OldEmail }}`, `{{ .NewEmail }}` à confirmer
   dans la doc Supabase / l'aperçu du dashboard pour les deux notifications (les notifications
   doivent aussi être activées côté dashboard).
3. **Logo public** : après déploiement de cette PR, ouvrir l'URL du logo en navigation privée
   (HTTP 200, `image/png`, 360×94) *avant* d'installer les modèles.
4. **Rendu clients réels** : envoyer un test (Gmail web/mobile, Apple Mail, Outlook) ; aperçu Chrome
   headless à 375 et 320 px déjà vérifié. Le modèle reste en thème clair (`color-scheme: light`).
5. Le gabarit « Reset password » doit garder `{{ .ConfirmationURL }}` (cf. `docs/operations/password-recovery.md`).
