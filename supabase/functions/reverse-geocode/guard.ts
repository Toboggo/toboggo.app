// Garde-fous anti-abus de l'Edge Function (logique pure, testable).
//
// Limites réelles : Supabase n'offre pas de rate limiting natif pour les Edge
// Functions, et chaque isolat Deno a sa propre mémoire (éphémère, possiblement
// plusieurs en parallèle). Le limiteur ci-dessous est donc un FREIN
// « best effort » par isolat, pas un quota global. Le plafond dur de coût reste
// le quota/budget configuré côté compte Geoapify.

export interface RateLimiter {
  allow(key: string): boolean;
}

export function createRateLimiter(opts: { max: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? (() => Date.now());
  const hits = new Map<string, number[]>();
  return {
    allow(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < opts.windowMs);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 5000) {
        // Purge opportuniste : borne la mémoire de l'isolat.
        for (const [k, v] of hits) if (v.every((x) => t - x >= opts.windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}

/** `ALLOWED_ORIGINS` (liste séparée par des virgules, optionnelle) → tableau. */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/** IP cliente vue par la passerelle Supabase (premier élément de X-Forwarded-For). */
export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || "unknown";
}
