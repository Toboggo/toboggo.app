# Modèles d'e-mails Supabase Auth (français, logo officiel)

Modèles HTML **à copier dans le dashboard Supabase** (Auth → Email Templates, onglets
Templates et Notifications). Ce dossier ne modifie ni Supabase ni Resend : rien n'est
appliqué tant que vous ne collez pas les modèles à la main. `config.toml` est volontairement
inchangé (`supabase config push` écraserait les modèles distants).

Générés par `npm run email:build` (source : `build.mjs`), contrôlés par `npm run email:check`.

## Logo

- Source : kit officiel v3 versionné dans `docs/brand-kit-v3/`, `logo/toboggo-color-2400.png` (logo horizontal couleur), réduit
  sans déformation à 360×94 px (affiché 180×47 px, soit 2× pour les écrans HD).
- Fichier : `apps/landing/public/email/toboggo-logo-email.png` (copié tel quel dans `.vercel/output/static/email/` au build du site).
- URL utilisée : `https://toboggo.com/email/toboggo-logo-email.png` (domaine officiel du site vitrine, fourni par le
  fondateur). Pour changer de domaine, changer `LOGO_URL` dans `build.mjs` puis `npm run email:build`.

## Modèles → emplacement dashboard, objet, variables

| Fichier | Emplacement | Objet conseillé | Variables Supabase |
|---|---|---|---|
| `confirmation.html` | Confirm signup | Confirmez votre adresse e-mail | `{{ .ConfirmationURL }}` |
| `recovery.html` | Reset password | Réinitialisez votre mot de passe Toboggo | `{{ .ConfirmationURL }}` |
| `email_change.html` | Change email address | Confirmez votre nouvelle adresse e-mail | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| `invite.html` | Invite user | Vous êtes invité(e) à rejoindre Toboggo | `{{ .ConfirmationURL }}` |
| `magic_link.html` | Magic link | Votre lien de connexion Toboggo | `{{ .ConfirmationURL }}` |
| `reauthentication.html` | Reauthentication | Votre code de confirmation Toboggo | `{{ .Token }}` |
| `notification_password_changed.html` | Notifications → Password changed | Votre mot de passe Toboggo a été modifié | aucune (non documentée) |
| `notification_email_changed.html` | Notifications → Email address changed | L'adresse e-mail de votre compte Toboggo a été modifiée | aucune (texte générique) |

## Modifier un modèle

**Éditer `build.mjs` (source), jamais les `.html` directement**, puis `npm run email:build` et
commiter source + HTML ; `npm run email:check` échoue si un HTML diverge du générateur.

## Variables — vérifiées dans la doc officielle Supabase (15/10/2026)

Source : <https://supabase.com/docs/guides/auth/auth-email-templates>.

- `{{ .ConfirmationURL }}` : confirmation, invitation, magic link, reset, changement d'e-mail ; `{{ .Token }}` : OTP 6 chiffres (réauthentification).
- `{{ .NewEmail }}` : **uniquement** le modèle « Change email address » (corrigé : je l'utilisais à tort dans la notification).
- Notification « Email address changed » : la doc expose `{{ .OldEmail }}` et `{{ .Email }}` sans préciser leur sens ; le modèle est donc **générique, sans variable**.
- Notification « Password changed » : aucune variable documentée → le modèle n'en utilise aucune.
- `{{ .Email }}` dans « Change email address » : adresse d'origine (général) ; la doc n'a pas de matrice par modèle.
- Les notifications ne partent que si la notification correspondante est **activée** au niveau du projet.

## À vérifier avant installation (non faisable depuis le repo)

1. **Comparer avec le dashboard** : les textes et variables actuellement configurés ne sont pas
   accessibles depuis le repo (`config.toml` n'en versionne aucun). Les textes ici sont des
   propositions françaises ; relire les modèles existants (et leurs éventuelles variables
   personnalisées) avant de les remplacer.
2. **Notifications** : vérifier qu'elles sont activées au niveau du projet (« Email address changed », « Password changed »).
3. **Logo public** : après déploiement de cette PR, ouvrir l'URL du logo en navigation privée
   (HTTP 200, `image/png`, 360×94) *avant* d'installer les modèles.
4. **Rendu clients réels** : envoyer un test (Gmail web/mobile, Apple Mail, Outlook) ; aperçu Chrome
   headless à 375 et 320 px déjà vérifié. Le modèle reste en thème clair (`color-scheme: light`).
5. Le gabarit « Reset password » doit garder `{{ .ConfirmationURL }}` (cf. `docs/operations/password-recovery.md`).
