import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { rich } from "./fixtures";
import { buildParkContent } from "./parkContent";
import { parkPageLd } from "./jsonld";

const landing = fileURLToPath(new URL("../../../", import.meta.url));

function files(dir: string, test: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, test);
    return test(name) ? [path] : [];
  });
}

const read = (path: string) => readFileSync(path, "utf8");
const rel = (path: string) => relative(landing, path);

describe("aucune photo sans droits documentés", () => {
  const ficheTemplate = join(landing, "src/pages/aires-de-jeux/[city]/[park].astro");

  it("the fiche template renders no image at all", () => {
    const source = read(ficheTemplate);
    expect(source).not.toMatch(/<img\b/i);
    expect(source).not.toMatch(/PhotoPlaceholder|cover_photo|\.photos\b|usablePhotos|<picture|background-image/);
  });

  it("the SEO modules never read or expose photos in a fiche, even if the data carries some", () => {
    const withPhotos = rich({ photos: [{ url: "https://exemple.invalid/a.webp", rightsStatus: "validated" }, { url: "https://exemple.invalid/b.webp", rightsStatus: "unknown" }] });
    const content = JSON.stringify(buildParkContent(withPhotos));
    const ld = JSON.stringify(parkPageLd(withPhotos, "FR", "/x/", "Millau"));
    for (const out of [content, ld]) {
      expect(out).not.toMatch(/exemple\.invalid|photo|image/i);
    }
  });

  it("the Supabase loader never selects photos or media", () => {
    const loader = read(join(landing, "src/lib/seo/loader.ts"));
    expect(loader).not.toMatch(/park_media|cover_photo|photos\s*:\s*\[[^\]]/);
    expect(loader).toMatch(/photos: \[\]/);
  });
});

describe("aucune écriture Supabase dans le code SEO", () => {
  const sources = [
    ...files(join(landing, "src/lib/seo"), (n) => n.endsWith(".ts") && !n.endsWith(".test.ts") && n !== "fixtures.ts"),
    ...files(join(landing, "src/pages/aires-de-jeux"), (n) => n.endsWith(".astro")),
    join(landing, "astro.config.mjs"),
    join(landing, "scripts/verify-dist.mjs"),
  ];

  it("scans the expected files", () => {
    expect(sources.length).toBeGreaterThan(15);
  });

  it("contains no write call (POST/PATCH/PUT/DELETE, insert/update/upsert/delete/rpc)", () => {
    const offenders = sources.flatMap((file) => {
      const text = read(file);
      const hits = [...text.matchAll(/method:\s*["'](POST|PATCH|PUT|DELETE)["']|\.(insert|update|upsert|delete|rpc)\(/g)];
      return hits.map((m) => `${rel(file)}: ${m[0]}`);
    });
    expect(offenders).toEqual([]);
  });

  it("the only HTTP method used by the loader is GET", () => {
    const methods = [...read(join(landing, "src/lib/seo/loader.ts")).matchAll(/method:\s*["']([A-Z]+)["']/g)].map((m) => m[1]);
    expect(methods).toEqual(["GET"]);
  });
});
