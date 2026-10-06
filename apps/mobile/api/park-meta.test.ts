// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./park-meta";

const SHELL = `<!doctype html><html lang="fr"><head><title>Toboggo — x</title><meta name="description" content="old" /></head><body><div id="root"></div></body></html>`;
const SB = "https://proj.supabase.co";

vi.mock("node:fs", async (orig) => {
  const real = await orig<typeof import("node:fs")>();
  return {
    ...real,
    readFileSync: (p: string, ...rest: unknown[]) =>
      String(p).endsWith("index.html") ? SHELL : (real.readFileSync as (...a: unknown[]) => unknown)(p, ...rest),
  };
});

function mockDb(rows: unknown[] | number) {
  vi.stubGlobal("fetch", vi.fn(async () =>
    typeof rows === "number" ? new Response("{}", { status: rows }) : new Response(JSON.stringify(rows), { status: 200 }),
  ));
}
const call = (id: string, lang = "fr") =>
  handler.fetch(new Request(`https://app.example/api/park-meta?id=${id}`, { headers: { "accept-language": lang } }));

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", SB);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("VERCEL_ENV", "preview");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("park-meta", () => {
  it("avec photo, adresse et avis : métadonnées propres au parc dans le HTML initial", async () => {
    mockDb([{ id: "p1", name: "Parc Blandan", address_line: "33 rue Cdt Pegoud", city: "Lyon", rating: 4.25, review_count: 12, cover_photo: null, photos: [`${SB}/storage/v1/object/public/park-photos/a.jpg`] }]);
    const res = await call("p1");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=300");
    expect(html).toContain('<meta property="og:title" content="Parc Blandan" />');
    expect(html).toContain('content="33 rue Cdt Pegoud, Lyon · ⭐ 4,3/5 · 12 avis"');
    expect(html).toContain(`<meta property="og:image" content="${SB}/storage/v1/object/public/park-photos/a.jpg" />`);
    expect(html).toContain('<link rel="canonical" href="https://app.example/park/p1" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).not.toContain('content="old"');
  });

  it("sans photo ni avis ni adresse : visuel Toboggo, repli de description, pas d'ancienne balise", async () => {
    mockDb([{ id: "p2", name: "Parc X", address_line: null, city: null, rating: 0, review_count: 0, cover_photo: null, photos: [] }]);
    const html = await (await call("p2")).text();
    expect(html).toContain('og:image" content="https://app.example/og/park-fallback.png"');
    expect(html).toContain("équipements, âges et avis des parents");
    expect(html).not.toContain("⭐");
  });

  it("EN / ES : pluriels et formats locaux", async () => {
    const row = { id: "p3", name: "Park", address_line: "1 Main St", city: "Lyon", rating: 4.25, review_count: 1, cover_photo: null, photos: [] };
    mockDb([row]);
    expect(await (await call("p3", "en-US,en;q=0.9")).text()).toContain("⭐ 4.3/5 · 1 review\"");
    mockDb([{ ...row, review_count: 3 }]);
    expect(await (await call("p3", "es-ES")).text()).toContain("⭐ 4,3/5 · 3 opiniones");
  });

  it("échappe le HTML du nom", async () => {
    mockDb([{ id: "p4", name: 'Parc "<b>"', address_line: null, city: null, rating: 0, review_count: 0, cover_photo: null, photos: [] }]);
    const html = await (await call("p4")).text();
    expect(html).toContain("Parc &quot;&lt;b&gt;&quot;");
  });

  it("photo non https ignorée", async () => {
    mockDb([{ id: "p5", name: "P", address_line: null, city: null, rating: 0, review_count: 0, cover_photo: "http://insecure/a.jpg", photos: [] }]);
    expect(await (await call("p5")).text()).toContain("/og/park-fallback.png");
  });

  it("parc introuvable : 404 court en cache, noindex, shell servi", async () => {
    mockDb([]);
    const res = await call("nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
    const html = await res.text();
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain('<div id="root">');
  });

  it("erreur base : 200 sans cache, jamais mis en cache", async () => {
    mockDb(500);
    const res = await call("p6");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
