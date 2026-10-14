// Classe une erreur Supabase Auth en catégorie affichable. Aucune donnée de
// l'erreur n'est conservée ni journalisée : seule la catégorie ressort.

export type AuthFailure = "rateLimit" | "network" | "samePassword" | "weakPassword" | "sessionLost" | "generic";

export function classifyAuthError(err: unknown): AuthFailure {
  const e = (err ?? {}) as { status?: number; code?: string; name?: string; message?: string };
  const code = e.code ?? "";
  const message = (e.message ?? "").toLowerCase();
  if (e.status === 429 || code.includes("rate_limit") || message.includes("rate limit")) return "rateLimit";
  if (
    e.name === "AuthRetryableFetchError" ||
    e.status === 0 ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  ) {
    return "network";
  }
  if (code === "same_password" || message.includes("different from the old password")) return "samePassword";
  if (code === "weak_password") return "weakPassword";
  if (
    e.name === "AuthSessionMissingError" ||
    code === "session_not_found" ||
    code === "session_expired" ||
    e.status === 401 ||
    message.includes("session missing")
  ) {
    return "sessionLost";
  }
  return "generic";
}
