# Récupération de mot de passe (app parents)

Parcours : `/login` → « Mot de passe oublié ? » → `/forgot-password` → e-mail Supabase
→ lien → `/reset-password` (formulaire « Nouveau mot de passe ») → déconnexion de la
session technique → `/login` avec « Votre mot de passe a été modifié ».

## Comment ça marche

- `sendPasswordReset()` (`packages/shared/src/api/auth.ts`) demande le lien avec
  `redirectTo = <origine>/reset-password`.
- Le lien ouvre une **session technique** (supabase-js, `detectSessionInUrl`, flux
  implicite : `#access_token=…&type=recovery`). `apps/mobile/src/lib/recoveryLink.ts`
  en prend un instantané synchrone au chargement (booléens uniquement), et
  `lib/session.ts` porte l'état `recovery` (aussi posé par l'événement
  `PASSWORD_RECOVERY`, et mémorisé dans `sessionStorage` pour survivre à un rechargement).
- Tant que `recovery` est vrai, `App.tsx` ne laisse que `/reset-password` : pas de
  redirection vers l'accueil/la carte, pas de choix de pseudo, pas de reprise de contribution.
- Lien expiré / déjà utilisé : Supabase renvoie `#error_code=otp_expired` → `/forgot-password?reason=…`.
- Aucun mot de passe, jeton ni lien signé n'est journalisé ; l'analytics assainit déjà les URL.

## Prérequis côté Supabase (dashboard — non gérés par le repo)

1. **Auth → URL Configuration → Redirect URLs** : ajouter `<origine de l'app>/reset-password`
   (prod : le domaine Vercel de l'app ; l'ajout d'une URL ne modifie pas le schéma).
   Sans cela Supabase retombe sur le Site URL ; l'app gère ce cas (la détection se fait
   sur `type=recovery`, pas sur le chemin) mais le lien n'atterrira pas sur la bonne origine.
2. **Auth → Email Templates → Reset Password** : le lien doit rester `{{ .ConfirmationURL }}`
   (pas de lien direct vers l'app avec le jeton, sinon la session technique est ouverte sans
   passer par le formulaire). Le gabarit n'est pas versionné dans le repo.
3. En local : `supabase/config.toml` autorise `http://localhost:5173/reset-password`.

## Constats Supabase (vérifiés en local, GoTrue)

- `POST /recover` répond `200 {}` que le compte existe ou non (pas d'énumération) ; seuls
  429 (`over_email_send_rate_limit`) et les erreurs réseau sont remontés à l'utilisateur.
- 2ᵉ clic sur le même lien : `#error=access_denied&error_code=otp_expired`.
- `PUT /user` avec le mot de passe actuel : `422 same_password`.
