import { getSupabase } from "../supabaseClient";

export async function signUp(email: string, password: string, name: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
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

export async function sendPasswordReset(email: string) {
  const supabase = getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function getSession() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(cb: (userId: string | null) => void) {
  const supabase = getSupabase();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}
