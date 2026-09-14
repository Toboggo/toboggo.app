import { getSupabase } from "../supabaseClient";

export async function signUp(email: string, password: string, name: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
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

/**
 * Sends the "forgot password" e-mail. `redirectTo` defaults to this app's
 * dedicated recovery screen (`/reset-password`) so the emailed link lands the
 * user there directly — same pattern as `signInWithGoogle`'s default. Never
 * reveals whether `email` actually has an account: Supabase resolves this the
 * same way either way, and the caller shows the same confirmation regardless.
 */
export async function sendPasswordReset(email: string, redirectTo?: string) {
  const supabase = getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo:
      redirectTo ?? (typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined),
  });
  if (error) throw error;
}

/**
 * Sets a new password for the currently active session. Meant to be called
 * only once `onPasswordRecovery` has confirmed the session actually comes
 * from the password-recovery flow: Supabase's recovery link signs the browser
 * in with a session scoped to this action, and `updateUser` applies against
 * whatever session is currently active — no token is ever read, stored, or
 * passed manually.
 */
export async function updatePassword(password: string) {
  const supabase = getSupabase();
  const { error } = await supabase.auth.updateUser({ password });
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

/**
 * True once `onPasswordRecovery` has seen a genuine `PASSWORD_RECOVERY` event
 * during this page's lifetime. Module-level, not component state: see
 * `wasPasswordRecoveryDetected` for why `ResetPassword.tsx` needs this rather
 * than reacting to the event itself.
 */
let recoveryDetected = false;

/**
 * Fires `cb` if/when Supabase reports the `PASSWORD_RECOVERY` auth event —
 * i.e. the browser just landed on a genuine, still-valid recovery link and
 * got a recovery session.
 *
 * Checked against this project's installed `@supabase/supabase-js` (2.112.4):
 * the access token's `amr` claim — the seemingly obvious alternative — does
 * NOT distinguish a recovery session from any other OTP-based sign-in in this
 * GoTrue version. A real local recovery link was requested and decoded during
 * review (via the local Supabase + Mailpit) and its `amr` was
 * `[{ "method": "otp", ... }]`, not `"recovery"` — using `amr` here would
 * reject every genuine recovery link. The email's actual verify link instead
 * carries `type=recovery`, and `auth-js` reads exactly that
 * (`redirectType === 'recovery'`, see `GoTrueClient.js` around
 * `_initialize()`) to decide whether to emit `PASSWORD_RECOVERY` instead of
 * `SIGNED_IN` — this event is Supabase's own conclusion, not a guess derived
 * from a token.
 *
 * Independent subscription from `onAuthStateChange` (session.ts owns that one
 * and has its own deliberate dedupe logic) — supabase-js supports any number
 * of concurrent `onAuthStateChange` listeners.
 */
export function onPasswordRecovery(cb: () => void) {
  const supabase = getSupabase();
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      recoveryDetected = true;
      cb();
    }
  });
  return () => data.subscription.unsubscribe();
}

/**
 * Whether `PASSWORD_RECOVERY` has already fired during this page's lifetime —
 * `ResetPassword.tsx`'s actual gate, checked synchronously on mount alongside
 * its own `onPasswordRecovery` subscription (for a recovery that completes
 * *after* mount, if that ever becomes reachable).
 *
 * This exists because, verified by tracing a real recovery link end to end
 * (Supabase + Mailpit) with temporary logging: `ResetPassword.tsx` cannot
 * reliably observe the live event itself. `App.tsx` renders `null` (per its
 * `loading` gate in `session.ts`) until `session.ts`'s own `onAuthStateChange`
 * subscription — registered earlier, from `App`'s first effect — has already
 * reacted to the *same* event and resolved the resulting profile fetch;
 * `/reset-password` (part of the `<Routes>` tree gated behind `loading`)
 * cannot mount before that finishes. So by construction, `ResetPassword.tsx`
 * always mounts *after* `PASSWORD_RECOVERY` would have fired, not before —
 * a live listener registered at that point structurally cannot catch it. Only
 * `App.tsx`'s listener (registered unconditionally, before its own `loading`
 * check) is early enough; this flag is how that fact reaches `ResetPassword.tsx`.
 */
export function wasPasswordRecoveryDetected(): boolean {
  return recoveryDetected;
}
