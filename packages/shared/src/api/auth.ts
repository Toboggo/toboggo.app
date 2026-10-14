import type { AuthChangeEvent } from "@supabase/supabase-js";
import { getSupabase } from "../supabaseClient";

/** Chemin (relatif à l'origine de l'app) où atterrit le lien « Mot de passe oublié ». */
export const PASSWORD_RECOVERY_PATH = "/reset-password";

export async function signUp(email: string, password: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Without this, the confirmation email always links to the Supabase
      // project's configured Site URL (the Vercel deploy) even when signup
      // was started from a local dev server — same fix as signInWithGoogle.
      emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Starts the Google OAuth flow. In the browser this redirects away to Google and
 * comes back to `redirectTo` (default: the app origin) with the session in the
 * URL, which supabase-js picks up automatically (detectSessionInUrl). Requires
 * the Google provider to be enabled in the Supabase dashboard, with the app
 * origin listed under Auth → URL Configuration → Redirect URLs.
 */
export async function signInWithGoogle(redirectTo?: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo:
        redirectTo ?? (typeof window !== "undefined" ? window.location.origin : undefined),
    },
  });
  if (error) throw error;
  return data;
}

export async function deleteOwnAccount() {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("delete_own_account");
  if (error) throw error;
  await supabase.auth.signOut();
}

export async function signOut() {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Fermeture de session locale uniquement (n'appelle pas le serveur) : repli si `signOut()` échoue. */
export async function signOutLocal() {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}

/**
 * Envoie l'e-mail de récupération. Le lien ramène sur `/reset-password` (qui doit
 * figurer dans Auth → URL Configuration → Redirect URLs). Supabase ne révèle pas
 * si l'adresse existe : un succès ici ne prouve rien sur l'existence du compte.
 */
export async function sendPasswordReset(email: string) {
  const supabase = getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo:
      typeof window !== "undefined" ? `${window.location.origin}${PASSWORD_RECOVERY_PATH}` : undefined,
  });
  if (error) throw error;
}

/** Définit le nouveau mot de passe de l'utilisateur de la session courante (session de récupération). */
export async function updatePassword(newPassword: string) {
  const supabase = getSupabase();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function getSession() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(cb: (userId: string | null, event: AuthChangeEvent) => void) {
  const supabase = getSupabase();
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    cb(session?.user.id ?? null, event);
  });
  return () => data.subscription.unsubscribe();
}
