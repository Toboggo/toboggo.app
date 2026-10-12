import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPLIT-04B — every back-office app deployed on its own Vercel project (Root
 * Directory = the app folder) needs ITS OWN vercel.json: Vercel only reads the
 * one in the Root Directory, so it is never inherited from a sibling app.
 * Deep links (/parks/:id, /reports…) must fall back to index.html, real static
 * files must not, and the back offices must never be indexed.
 */
const APPS = ["backoffice", "backoffice-admin", "backoffice-collectivity"] as const;
const root = resolve(__dirname, "../../..");

type Header = { key: string; value: string };
type VercelConfig = {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: Header[] }[];
};
const load = (app: string): VercelConfig => JSON.parse(readFileSync(resolve(root, "apps", app, "vercel.json"), "utf-8"));

// The rewrite source is a plain regex group — `^source$` is exactly how Vercel
// evaluates it for this pattern (no path-to-regexp-only syntax is used).
const matcher = (source: string) => new RegExp(`^${source}$`);

describe.each(APPS)("apps/%s/vercel.json", (app) => {
  const cfg = load(app);
  const spa = matcher(cfg.rewrites[0].source);

  it("rewrites every application route to /index.html", () => {
    expect(cfg.rewrites).toHaveLength(1);
    expect(cfg.rewrites[0].destination).toBe("/index.html");
    for (const path of ["/", "/parks/abc", "/parks/new", "/reports", "/reviews", "/photos", "/settings", "/validation/e1", "/zzz/unknown"]) {
      expect(spa.test(path), path).toBe(true);
    }
  });

  it("never rewrites static files: a missing asset stays a real 404", () => {
    for (const path of ["/assets/index-abc.js", "/assets/nope.js", "/favicon.svg", "/icons-sprite.svg", "/apple-touch-icon.png"]) {
      expect(spa.test(path), path).toBe(false);
    }
  });

  it("is noindex and carries the security headers on every path", () => {
    const all = cfg.headers.find((h) => h.source === "/(.*)")!.headers;
    const get = (k: string) => all.find((h) => h.key === k)?.value;
    expect(get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(get("X-Content-Type-Options")).toBe("nosniff");
    expect(get("X-Frame-Options")).toBe("DENY");
    expect(get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(get("Permissions-Policy")).toContain("camera=()");
  });

  it("never caches the shell, caches hashed assets forever", () => {
    const cache = (src: string) => cfg.headers.find((h) => h.source === src)?.headers.find((h) => h.key === "Cache-Control")?.value;
    expect(cache("/")).toBe("no-cache");
    expect(cache("/index.html")).toBe("no-cache");
    expect(cache("/assets/(.*)")).toBe("public, max-age=31536000, immutable");
  });

  it("index.html carries the noindex meta and the static files the rewrite lets through exist", () => {
    const html = readFileSync(resolve(root, "apps", app, "index.html"), "utf-8");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    for (const f of ["favicon.svg", "icons-sprite.svg", "apple-touch-icon.png"]) {
      expect(existsSync(resolve(root, "apps", app, "public", f)), f).toBe(true);
    }
  });
});

describe("the three back-office configs stay identical", () => {
  it("same rewrite and headers (a change must be made everywhere on purpose)", () => {
    const [a, ...rest] = APPS.map(load);
    for (const other of rest) expect(other).toEqual(a);
  });
});
