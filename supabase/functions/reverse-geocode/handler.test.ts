import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRateLimiter, parseAllowedOrigins } from "./guard.ts";
import { GEOAPIFY_URL, handleRequest, type HandlerDeps } from "./handler.ts";

const GEOAPIFY_OK = {
  results: [
    { housenumber: "12", street: "Rue de la Capelle", postcode: "12100", city: "Millau", state: "Occitanie", county: "Aveyron", country_code: "fr", formatted: "x", lon: 3.07, lat: 44.09, datasource: { secret: "RAW" } },
  ],
};

function deps(over: Partial<HandlerDeps> = {}, upstream: () => Promise<Response> = async () => Response.json(GEOAPIFY_OK)) {
  const fetchImpl = vi.fn(upstream) as unknown as typeof fetch;
  return { fetchImpl, d: { apiKey: "SECRET-KEY", allowedOrigins: [], limiter: createRateLimiter({ max: 100, windowMs: 60_000 }), fetchImpl, ...over } as HandlerDeps };
}
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://x.supabase.co/functions/v1/reverse-geocode", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("reverse-geocode — accès invité / connecté", () => {
  it("config.toml : verify_jwt = false pour CETTE fonction uniquement", () => {
    const toml = readFileSync(new URL("../../config.toml", import.meta.url), "utf-8");
    const m = toml.match(/\[functions\.reverse-geocode\]([^[]*)/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/verify_jwt\s*=\s*false/);
    expect(toml.match(/^\[functions\./gm)).toHaveLength(1);
  });

  it("invité (clé publishable, AUCUN Authorization) → 200", async () => {
    const { d } = deps();
    const res = await handleRequest(post({ lat: 44.09, lng: 3.07 }, { apikey: "sb_publishable_x" }), d);
    expect(res.status).toBe(200);
  });

  it("connecté (Authorization: Bearer <jwt utilisateur>) → 200, même réponse", async () => {
    const { d } = deps();
    const res = await handleRequest(post({ lat: 44.09, lng: 3.07 }, { authorization: "Bearer user.jwt", apikey: "k" }), d);
    expect(res.status).toBe(200);
  });
});

describe("reverse-geocode — handler", () => {
  it("réponse limitée aux champs nécessaires, jamais la réponse brute ni la clé", async () => {
    const { d } = deps();
    const res = await handleRequest(post({ lat: 44.09, lng: 3.07 }), d);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      address: { address_line: "12 Rue de la Capelle", postal_code: "12100", city: "Millau", admin_area_1: "Occitanie", admin_area_2: "Aveyron", country_code: "FR", formatted: "x" },
    });
    expect(text).not.toMatch(/SECRET|RAW|datasource/);
  });

  it("destination Geoapify fixe, mêmes paramètres que le pipeline OSM, aucun `lang`", async () => {
    const { d, fetchImpl } = deps();
    await handleRequest(post({ lat: 44.09, lng: 3.07, language: "en", url: "https://evil.test", host: "evil.test" }), d);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [string, RequestInit];
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe(GEOAPIFY_URL);
    expect([...u.searchParams.keys()].sort()).toEqual(["apiKey", "format", "lat", "lon"]);
    expect(u.searchParams.get("format")).toBe("json");
    expect(init.signal).toBeInstanceOf(AbortSignal); // timeout conservé
  });

  it("POST uniquement : GET/PUT/DELETE → 405 sans appel amont ; OPTIONS → 204", async () => {
    const { d, fetchImpl } = deps();
    for (const method of ["GET", "PUT", "DELETE"]) {
      const res = await handleRequest(new Request("https://x/f", { method }), d);
      expect(res.status).toBe(405);
    }
    expect((await handleRequest(new Request("https://x/f", { method: "OPTIONS" }), d)).status).toBe(204);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("coordonnées invalides / JSON invalide / corps trop gros → 4xx, aucun appel amont", async () => {
    const { d, fetchImpl } = deps();
    for (const b of [{ lat: "44", lng: 3 }, { lat: 91, lng: 3 }, { lat: 0, lng: 0 }, {}, "pas du json"]) {
      expect((await handleRequest(post(b), d)).status).toBe(400);
    }
    expect((await handleRequest(post({ lat: 44, lng: 3, pad: "x".repeat(600) }), d)).status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("erreur / injoignabilité Geoapify → 502 sans fuite de clé ; résultat vide → { address: null }", async () => {
    const e1 = deps({}, async () => new Response("no", { status: 429 }));
    const r1 = await handleRequest(post({ lat: 44.09, lng: 3.07 }), e1.d);
    expect(r1.status).toBe(502);
    expect(await r1.text()).not.toMatch(/SECRET/);
    const e2 = deps({}, async () => { throw new Error("net SECRET-KEY"); });
    const r2 = await handleRequest(post({ lat: 44.09, lng: 3.07 }), e2.d);
    expect(r2.status).toBe(502);
    expect(await r2.text()).not.toMatch(/SECRET/);
    const e3 = deps({}, async () => Response.json({ results: [] }));
    expect(await (await handleRequest(post({ lat: 44.09, lng: 3.07 }), e3.d)).json()).toEqual({ address: null });
  });

  it("clé absente → 500 not_configured", async () => {
    const { d } = deps({ apiKey: undefined });
    expect((await handleRequest(post({ lat: 44.09, lng: 3.07 }), d)).status).toBe(500);
  });
});

describe("reverse-geocode — anti-abus (best effort)", () => {
  it("limiteur par IP : 429 au-delà du plafond, autre IP non touchée, fenêtre glissante", async () => {
    let now = 0;
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => now });
    const { d, fetchImpl } = deps({ limiter });
    const call = (ip: string) => handleRequest(post({ lat: 44.09, lng: 3.07 }, { "x-forwarded-for": ip }), d);
    expect((await call("1.1.1.1")).status).toBe(200);
    expect((await call("1.1.1.1")).status).toBe(200);
    const blocked = await call("1.1.1.1");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect((await call("2.2.2.2")).status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    now = 1500;
    expect((await call("1.1.1.1")).status).toBe(200);
  });

  it("ALLOWED_ORIGINS : origine inconnue → 403 sans appel amont ; origine autorisée reflétée", async () => {
    const { d, fetchImpl } = deps({ allowedOrigins: parseAllowedOrigins("https://app.toboggo.test/, https://admin.toboggo.test") });
    const bad = await handleRequest(post({ lat: 44.09, lng: 3.07 }, { origin: "https://evil.test" }), d);
    expect(bad.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    const ok = await handleRequest(post({ lat: 44.09, lng: 3.07 }, { origin: "https://app.toboggo.test" }), d);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("https://app.toboggo.test");
  });
});
