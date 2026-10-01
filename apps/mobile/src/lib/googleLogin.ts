import { signInWithGoogle } from "@toboggo/shared";

/**
 * Marqueur « un login Google vient d'être démarré volontairement ».
 *
 * `signInWithGoogle()` redirige la page entière : le succès n'est observable
 * qu'au retour, dans `onAuthStateChange` (`session.ts`), qui traite aussi les
 * restaurations de session. Ce marqueur (sessionStorage, posé juste avant la
 * redirection, consommé UNE fois au retour) distingue les deux cas. Il ne
 * contient aucune donnée utilisateur, seulement un horodatage.
 */
const KEY = "toboggo:google-login-pending";
const TTL_MS = 10 * 60 * 1000; // un aller-retour OAuth, pas plus

export function markGoogleLoginStarted(): void {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* stockage indisponible : on ne mesure simplement pas ce login */
  }
}

export function clearGoogleLoginMarker(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* rien à nettoyer */
  }
}

/** Lit ET supprime le marqueur ; `true` seulement s'il existait et est frais. */
export function consumeGoogleLoginMarker(): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return false;
    sessionStorage.removeItem(KEY);
    const startedAt = Number(raw);
    return Number.isFinite(startedAt) && Date.now() - startedAt <= TTL_MS;
  } catch {
    return false;
  }
}

/** Démarre le login Google ; le marqueur est retiré si le démarrage échoue. */
export async function startGoogleLogin(): Promise<void> {
  markGoogleLoginStarted();
  try {
    await signInWithGoogle();
  } catch (err) {
    clearGoogleLoginMarker();
    throw err;
  }
}

/**
 * Un retour Google est-il la CRÉATION du compte (signup) ou la connexion d'un
 * compte existant (login) ?
 *
 * ⚠️ HEURISTIQUE ANALYTICS UNIQUEMENT — validée explicitement par le
 * fondateur. Supabase Auth n'expose AUCUN signal déterministe signup/login
 * dans notre flux OAuth (pas d'événement SIGNED_UP, pas de `is_new_user`) : un
 * retour OAuth est toujours un `SIGNED_IN`. Ne JAMAIS utiliser ce résultat
 * comme logique métier, d'autorisation ou de sécurité — il ne sert qu'à choisir
 * entre `signup_completed` et `login_completed` pour les dashboards.
 *
 * Signal : horodatages serveur Supabase du même objet `user` —
 * `last_sign_in_at` est écrit dans la même transaction que `created_at` à la
 * création (écart observé < 0,1 s sur les comptes Google réels), alors que
 * pour un compte existant (y compris un compte e-mail qui lie ensuite Google)
 * `created_at` est antérieur de plusieurs minutes/jours. Aucune horloge client
 * n'intervient. Donnée absente, invalide ou incohérente → `false`, c'est-à-dire
 * `login_completed` (sémantique historique).
 *
 * Erreur bornée : au pire un signup est compté comme login (sous-comptage),
 * un faux signup exigerait un compte existant créé < 10 s avant ce login.
 */
const NEW_ACCOUNT_MAX_GAP_MS = 10_000;

export function isNewAccount(user: { created_at?: string | null; last_sign_in_at?: string | null }): boolean {
  const created = Date.parse(user.created_at ?? "");
  const lastSignIn = Date.parse(user.last_sign_in_at ?? "");
  if (!Number.isFinite(created) || !Number.isFinite(lastSignIn)) return false;
  const gap = lastSignIn - created;
  return gap >= 0 && gap <= NEW_ACCOUNT_MAX_GAP_MS;
}
