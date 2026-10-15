#!/usr/bin/env node
// Génère les modèles d'e-mails Supabase Auth (HTML, français) dans ce dossier.
//   node supabase/templates/build.mjs          → (ré)écrit les .html
//   node supabase/templates/build.mjs --check  → échoue si un .html est périmé ou invalide
//
// Les modèles sont à COPIER dans le dashboard Supabase (Auth → Email Templates /
// Notifications). Ce script ne parle jamais à Supabase ni à Resend.
// Couleurs = tokens de marque (packages/design-system/src/tokens.css), en dur car
// les e-mails ne supportent pas les variables CSS.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

// Domaine réellement déployé de l'app parents (cf. DEFAULT_PUBLIC_APP_URL dans
// apps/mobile/src/components/ShareSheet.tsx). Fichier : apps/mobile/public/email/.
export const LOGO_URL = "https://toboggo-app.vercel.app/email/toboggo-logo-email.png";
const C = { bg: "#f7f8f7", card: "#ffffff", border: "#ece6d8", text: "#24303a", muted: "#8a8578", primary: "#2fa37c", button: "#1f7d5f", tint: "#e6f5ee", accent: "#ffb020", accentTint: "#fff3dc" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const p = (html) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${C.text};">${html}</p>`;
const small = (html) => `<p style="margin:0 0 12px;font-size:13px;line-height:20px;color:${C.muted};">${html}</p>`;
const button = (label, href) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>
<td align="center" bgcolor="${C.button}" style="border-radius:999px;background-color:${C.button};">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:999px;">${label}</a>
</td></tr></table>`;
const linkFallback = (href) => small(`Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br><a href="${href}" target="_blank" style="color:${C.button};word-break:break-all;">${href}</a>`);
const code = (token) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>
<td align="center" bgcolor="${C.tint}" style="background-color:${C.tint};border-radius:12px;padding:16px 28px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;line-height:36px;font-weight:700;letter-spacing:8px;color:${C.text};">${token}</td>
</tr></table>`;

const URL = "{{ .ConfirmationURL }}";

export const templates = [
  { file: "confirmation.html", kind: "Auth → Email Templates → Confirm signup", subject: "Confirmez votre adresse e-mail", preheader: "Un dernier clic pour activer votre compte Toboggo.", required: [URL],
    body: [p("Bienvenue sur Toboggo&nbsp;!"), p("Confirmez votre adresse e-mail pour activer votre compte et retrouver vos aires de jeux préférées."), button("Confirmer mon adresse", URL), linkFallback(URL), small("Si vous n’êtes pas à l’origine de cette inscription, ignorez simplement cet e-mail.")] },
  { file: "recovery.html", kind: "Auth → Email Templates → Reset password", subject: "Réinitialisez votre mot de passe Toboggo", preheader: "Choisissez un nouveau mot de passe pour votre compte Toboggo.", required: [URL],
    body: [p("Bonjour,"), p("Vous avez demandé à réinitialiser le mot de passe de votre compte Toboggo. Cliquez sur le bouton ci-dessous pour en choisir un nouveau."), button("Choisir un nouveau mot de passe", URL), linkFallback(URL), small("Ce lien ne peut être utilisé qu’une seule fois et expire au bout d’un moment. Si vous n’avez rien demandé, ignorez cet e-mail&nbsp;: votre mot de passe actuel reste valable.")] },
  { file: "email_change.html", kind: "Auth → Email Templates → Change email address", subject: "Confirmez votre nouvelle adresse e-mail", preheader: "Confirmez le changement d’adresse e-mail de votre compte Toboggo.", required: [URL, "{{ .Email }}", "{{ .NewEmail }}"],
    body: [p("Bonjour,"), p("Vous avez demandé à remplacer l’adresse e-mail de votre compte Toboggo <strong>{{ .Email }}</strong> par <strong>{{ .NewEmail }}</strong>."), p("Confirmez ce changement en cliquant sur le bouton ci-dessous."), button("Confirmer la nouvelle adresse", URL), linkFallback(URL), small("Si vous n’êtes pas à l’origine de cette demande, ne cliquez pas sur le lien et sécurisez votre compte en changeant votre mot de passe.")] },
  { file: "invite.html", kind: "Auth → Email Templates → Invite user", subject: "Vous êtes invité(e) à rejoindre Toboggo", preheader: "Acceptez l’invitation pour créer votre accès Toboggo.", required: [URL],
    body: [p("Bonjour,"), p("Vous avez été invité(e) à rejoindre Toboggo. Acceptez l’invitation pour créer votre accès."), button("Accepter l’invitation", URL), linkFallback(URL), small("Si vous ne vous attendiez pas à cette invitation, vous pouvez ignorer cet e-mail.")] },
  { file: "magic_link.html", kind: "Auth → Email Templates → Magic link", subject: "Votre lien de connexion Toboggo", preheader: "Connectez-vous à Toboggo en un clic.", required: [URL],
    body: [p("Bonjour,"), p("Cliquez sur le bouton ci-dessous pour vous connecter à Toboggo. Aucun mot de passe n’est nécessaire."), button("Me connecter", URL), linkFallback(URL), small("Ce lien ne peut être utilisé qu’une seule fois. Si vous n’avez pas demandé à vous connecter, ignorez cet e-mail.")] },
  { file: "reauthentication.html", kind: "Auth → Email Templates → Reauthentication", subject: "Votre code de confirmation Toboggo", preheader: "Votre code de confirmation à saisir dans Toboggo.", required: ["{{ .Token }}"],
    body: [p("Bonjour,"), p("Pour confirmer cette opération sensible sur votre compte Toboggo, saisissez le code suivant&nbsp;:"), code("{{ .Token }}"), small("Ce code est temporaire et personnel&nbsp;: ne le communiquez à personne. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail et changez votre mot de passe.")] },
  { file: "notification_password_changed.html", kind: "Auth → Email Templates → Notifications → Password changed", subject: "Votre mot de passe Toboggo a été modifié", preheader: "Le mot de passe de votre compte Toboggo vient d’être modifié.", required: ["{{ .Email }}"],
    body: [p("Bonjour,"), p("Le mot de passe du compte Toboggo associé à <strong>{{ .Email }}</strong> vient d’être modifié."), small("Si c’est bien vous, aucune action n’est nécessaire. Sinon, réinitialisez votre mot de passe depuis l’écran de connexion («&nbsp;Mot de passe oublié&nbsp;?&nbsp;») et contactez-nous.")] },
  { file: "notification_email_changed.html", kind: "Auth → Email Templates → Notifications → Email address changed", subject: "L’adresse e-mail de votre compte Toboggo a été modifiée", preheader: "L’adresse e-mail de votre compte Toboggo vient d’être modifiée.", required: ["{{ .OldEmail }}", "{{ .NewEmail }}"],
    body: [p("Bonjour,"), p("L’adresse e-mail de votre compte Toboggo est passée de <strong>{{ .OldEmail }}</strong> à <strong>{{ .NewEmail }}</strong>."), small("Si c’est bien vous, aucune action n’est nécessaire. Sinon, réinitialisez votre mot de passe et contactez-nous sans attendre.")] },
];

export function render(t) {
  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${t.subject}</title>
<style>
  @media only screen and (max-width:480px) {
    .card { padding:24px 20px !important; }
    .wrap { padding:16px 8px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${t.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background-color:${C.bg};">
<tr><td align="center" class="wrap" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td class="card" bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.border};border-radius:16px;padding:32px 36px;font-family:${FONT};">
<img src="${LOGO_URL}" alt="Toboggo" width="180" height="47" style="display:block;border:0;outline:none;text-decoration:none;width:180px;height:47px;margin:0 0 28px;">
${t.body.join("\n")}
</td></tr>
<tr><td align="center" style="padding:16px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">Vous recevez cet e-mail suite à une action sur un compte Toboggo.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

export function problems(t, html) {
  const out = [];
  for (const v of t.required) if (!html.includes(v)) out.push(`variable manquante ${v}`);
  if (!html.includes('alt="Toboggo"')) out.push("logo sans alt");
  if (!html.includes(LOGO_URL)) out.push("URL du logo absente");
  if ((html.match(/\{\{/g) ?? []).length !== (html.match(/\}\}/g) ?? []).length) out.push("accolades déséquilibrées");
  if (/<script|\bvar\(--/.test(html)) out.push("script ou variable CSS interdits en e-mail");
  return out;
}

const check = process.argv.includes("--check");
let failed = false;
for (const t of templates) {
  const html = render(t);
  const path = join(dir, t.file);
  const errs = problems(t, html);
  if (check) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== html) errs.push("fichier périmé : relancer `npm run email:build`");
  } else writeFileSync(path, html);
  if (errs.length) { failed = true; console.error(`✗ ${t.file}: ${errs.join("; ")}`); }
  else console.log(`✓ ${t.file}`);
}
process.exit(failed ? 1 : 0);
