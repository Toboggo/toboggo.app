// Gestionnaire HTTP du reverse geocoding, sans API Deno (dépendances injectées)
// pour être testable sous Vitest. `index.ts` ne fait que le brancher.

import { extractAddress, parseCoordinates } from "./address.ts";
import { clientKey, type RateLimiter } from "./guard.ts";

/** Destination FIXE : rien dans la requête entrante ne peut la modifier. */
export const GEOAPIFY_URL = "https://api.geoapify.com/v1/geocode/reverse";
export const UPSTREAM_TIMEOUT_MS = 8000;
export const MAX_BODY_BYTES = 512;

export interface HandlerDeps {
  /** Clé Geoapify (secret serveur). */
  apiKey: string | undefined;
  /** Origines navigateur autorisées ; vide = pas de restriction (dev local). */
  allowedOrigins: string[];
  limiter: RateLimiter;
  fetchImpl: typeof fetch;
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowed.length && origin ? origin : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin, deps.allowedOrigins);
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
    });

  // Restriction d'origine (navigateurs) — voir limites dans index.ts.
  if (deps.allowedOrigins.length && origin && !deps.allowedOrigins.includes(origin.replace(/\/$/, ""))) {
    return json({ error: "origin_not_allowed" }, 403);
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, { Allow: "POST, OPTIONS" });

  if (!deps.apiKey) return json({ error: "not_configured" }, 500);

  if (!deps.limiter.allow(clientKey(req))) return json({ error: "rate_limited" }, 429, { "Retry-After": "60" });

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const coords = parseCoordinates(body);
  if (!coords) return json({ error: "invalid_coordinates" }, 400);

  // Mêmes paramètres que `scripts/osm/geoapify.py` (aucun `lang` : la donnée
  // persistée ne dépend pas de la langue de l'interface).
  const params = new URLSearchParams({
    lat: String(coords.lat),
    lon: String(coords.lng),
    apiKey: deps.apiKey,
    format: "json",
  });
  try {
    const res = await deps.fetchImpl(`${GEOAPIFY_URL}?${params}`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!res.ok) return json({ error: "upstream_error", status: res.status }, 502);
    return json({ address: extractAddress(await res.json()) });
  } catch {
    return json({ error: "upstream_unreachable" }, 502);
  }
}
