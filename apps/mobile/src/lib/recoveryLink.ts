// Instantané du lien de retour Supabase (récupération de mot de passe), pris
// UNE fois, de façon synchrone, à l'import de ce module — c'est-à-dire avant que
// supabase-js (detectSessionInUrl) ne consomme puis nettoie l'URL, et avant que
// le routeur ne bouge. `main.tsx` l'importe en premier.
//
// Ne conserve que des indicateurs (booléen / catégorie) : jamais de jeton ni
// d'URL, rien n'est journalisé.

export type RecoveryLinkError = "expired" | "invalid";

export interface AuthLinkSnapshot {
  /** Le lien portait `type=recovery` (lien valide : supabase-js ouvre une session technique). */
  recovery: boolean;
  /** Lien refusé par Supabase (expiré / déjà utilisé / invalide). */
  error: RecoveryLinkError | null;
}

export const RESET_PASSWORD_PATH = "/reset-password";

export function readAuthLink(loc: Pick<Location, "hash" | "search" | "pathname">): AuthLinkSnapshot {
  const params = new URLSearchParams(loc.search);
  new URLSearchParams(loc.hash.replace(/^#/, "")).forEach((v, k) => params.set(k, v));

  const errorCode = params.get("error_code");
  if (errorCode === "otp_expired") return { recovery: false, error: "expired" };
  // Autres erreurs : seulement si on atterrit sur la page de réinitialisation
  // (une erreur OAuth Google, p. ex. `access_denied`, n'est pas un lien e-mail).
  if ((params.has("error") || errorCode) && loc.pathname === RESET_PASSWORD_PATH) {
    return { recovery: false, error: "invalid" };
  }
  return { recovery: params.get("type") === "recovery" && params.has("access_token"), error: null };
}

function snapshot(): AuthLinkSnapshot {
  if (typeof window === "undefined") return { recovery: false, error: null };
  try {
    const snap = readAuthLink(window.location);
    // Lien en erreur : supabase-js ne nettoie pas l'URL — on retire le hash
    // (il contient la description de l'erreur) sans toucher au reste.
    if (snap.error && window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    return snap;
  } catch {
    return { recovery: false, error: null };
  }
}

export const initialAuthLink: AuthLinkSnapshot = snapshot();

// La session technique de récupération persiste (localStorage) : sans repère, un
// rechargement de /reset-password (le hash a été nettoyé) la transformerait en
// session normale. On garde donc un drapeau pour l'onglet (sessionStorage) —
// un booléen seulement, jamais de jeton ni d'identité.
const PENDING_KEY = "toboggo.recoveryPending";

export function isRecoveryPending(): boolean {
  try {
    return window.sessionStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRecoveryPending(pending: boolean): void {
  try {
    if (pending) window.sessionStorage.setItem(PENDING_KEY, "1");
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* stockage indisponible : la récupération reste valable pour cette page */
  }
}
