import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSnapshot, resetSnapshotCache } from "./snapshot";
import { isStrictBuild, loadSeoSite, missingSnapshotError } from "./seoSite";
import { park } from "./fixtures";

beforeEach(() => resetSnapshotCache());
afterEach(() => vi.unstubAllEnvs());

describe("shared snapshot", () => {
  it("returns null without Supabase configuration (no pages are generated)", async () => {
    expect(await loadSnapshot({})).toBeNull();
    expect(await loadSeoSite({})).toBeNull();
  });

  it("loads once and shares the result between concurrent callers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "seo-"));
    const file = join(dir, "snapshot.json");
    writeFileSync(file, JSON.stringify({ fetchedAt: "2026-10-02T00:00:00Z", parks: [park()], stats: { parkRows: 1, verifiedLinks: 0, verifiedOrgs: 0, requests: 3 } }));
    const env = { SEO_SNAPSHOT_FILE: file };
    const [a, b] = await Promise.all([loadSnapshot(env), loadSnapshot(env)]);
    expect(a).toBe(b);
    expect(await loadSnapshot(env)).toBe(a);
  });

  it("performs ONE network pass for any number of callers (config, hub, cities, home)", async () => {
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      const table = new URL(url).pathname.split("/").pop();
      const rows = table === "park_public" ? Array.from({ length: 120 }, (_, i) => ({ id: `id-${i}`, name: "P", slug: null, city: "Millau", admin_area_2: null, postal_code: "12100", address_line: null, latitude: 44.1, longitude: 3.07, min_age: null, max_age: null, features: {}, verification_status: null, last_verified_at: null })) : [];
      void init;
      return new Response(JSON.stringify(rows), { status: 206, headers: { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" } });
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const env = { PUBLIC_SUPABASE_URL: "https://x.supabase.co", PUBLIC_SUPABASE_ANON_KEY: "k" };
      await Promise.all([loadSeoSite(env), loadSeoSite(env), loadSnapshot(env), loadSeoSite(env)]);
      expect(fetchSpy).toHaveBeenCalledTimes(3); // parcs + liens vérifiés + organisations, une seule fois
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("strict mode (production or SEO_STRICT=1)", () => {
  it("isStrictBuild: true for SEO_STRICT=1 or VERCEL_ENV=production, false otherwise", () => {
    expect(isStrictBuild({ SEO_STRICT: "1" })).toBe(true);
    expect(isStrictBuild({ VERCEL_ENV: "production" })).toBe(true);
    expect(isStrictBuild({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isStrictBuild({ SEO_STRICT: "0" })).toBe(false);
    expect(isStrictBuild({})).toBe(false);
  });

  it("missing Supabase variables + approved city + strict → the build FAILS with an explicit message", async () => {
    await expect(loadSeoSite({}, { strict: true, approved: ["millau"] })).rejects.toThrow(/PUBLIC_SUPABASE_URL \/ PUBLIC_SUPABASE_ANON_KEY sont manquantes/);
    await expect(loadSeoSite({}, { strict: true, approved: ["millau"] })).rejects.toThrow(/millau/);
    await expect(loadSeoSite({}, { strict: true, approved: ["millau"] })).rejects.toThrow(/snapshot Supabase n'a pas pu être chargé/);
  });

  it("invalid variables (not an http(s) URL, empty key) count as missing in strict mode", async () => {
    await expect(loadSeoSite({ PUBLIC_SUPABASE_URL: "pas-une-url", PUBLIC_SUPABASE_ANON_KEY: "k" }, { strict: true, approved: ["millau"] })).rejects.toThrow(/manquantes ou invalides/);
    await expect(loadSeoSite({ PUBLIC_SUPABASE_URL: "https://x.supabase.co", PUBLIC_SUPABASE_ANON_KEY: " " }, { strict: true, approved: ["millau"] })).rejects.toThrow(/manquantes ou invalides/);
  });

  it("missing variables WITHOUT strict → current degraded fallback is kept (null, no city pages)", async () => {
    await expect(loadSeoSite({}, { strict: false, approved: ["millau"] })).resolves.toBeNull();
  });

  it("strict with no approved city does not fail (nothing can disappear)", async () => {
    await expect(loadSeoSite({}, { strict: true, approved: [] })).resolves.toBeNull();
  });

  it("reads SEO_STRICT / VERCEL_ENV from the process by default", async () => {
    vi.stubEnv("SEO_STRICT", "1");
    await expect(loadSeoSite({})).rejects.toThrow(/PUBLIC_SUPABASE_URL/);
    vi.stubEnv("SEO_STRICT", "");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(loadSeoSite({})).rejects.toThrow(/PUBLIC_SUPABASE_URL/);
    vi.stubEnv("VERCEL_ENV", "preview");
    await expect(loadSeoSite({})).resolves.toBeNull();
  });

  it("explains the cause when the snapshot cannot be loaded although variables exist", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(loadSeoSite({ PUBLIC_SUPABASE_URL: "https://x.supabase.co", PUBLIC_SUPABASE_ANON_KEY: "k" }, { strict: false })).rejects.toThrow(
      /snapshot Supabase n'a pas pu être chargé — park_public : API injoignable ou trop lente \(fetch failed\)/,
    );
    vi.unstubAllGlobals();
  });

  it("the error message names both variables and the way out", () => {
    const message = missingSnapshotError(["millau"]).message;
    expect(message).toMatch(/^\[seo\] /);
    expect(message).toMatch(/PUBLIC_SUPABASE_URL/);
    expect(message).toMatch(/PUBLIC_SUPABASE_ANON_KEY/);
    expect(message).toMatch(/Production et Preview/);
  });
});
