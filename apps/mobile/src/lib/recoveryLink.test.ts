import { describe, expect, it } from "vitest";
import { readAuthLink } from "./recoveryLink";

const at = (pathname: string, hash = "", search = "") => readAuthLink({ pathname, hash, search });

describe("readAuthLink", () => {
  it("lien de récupération valide (type=recovery + access_token)", () => {
    expect(at("/reset-password", "#access_token=x&refresh_token=y&type=recovery")).toEqual({ recovery: true, error: null });
    // Même si Supabase retombe sur le Site URL (chemin non autorisé).
    expect(at("/", "#access_token=x&type=recovery").recovery).toBe(true);
  });

  it("n'est pas une récupération : login Google / signup / pas de jeton", () => {
    expect(at("/", "#access_token=x&type=signup").recovery).toBe(false);
    expect(at("/", "#access_token=x").recovery).toBe(false);
    expect(at("/", "#type=recovery").recovery).toBe(false);
    expect(at("/map").recovery).toBe(false);
  });

  it("lien expiré / déjà utilisé (otp_expired) où qu'il atterrisse", () => {
    const h = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    expect(at("/reset-password", h)).toEqual({ recovery: false, error: "expired" });
    expect(at("/", h)).toEqual({ recovery: false, error: "expired" });
  });

  it("autre erreur : invalide sur /reset-password seulement (pas un échec OAuth)", () => {
    expect(at("/reset-password", "#error=server_error").error).toBe("invalid");
    expect(at("/", "#error=access_denied&error_description=user+cancelled").error).toBeNull();
  });
});
