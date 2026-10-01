import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Garde-fou : une seule URL par page (slash final). Un lien interne vers une
// route du site sans slash final provoquerait une redirection ou un doublon.
const ROUTES = "fonctionnalites|collectivites|guides|a-propos|contact|faq|cgu|mentions-legales|aires-de-jeux";
const BAD_LINK = new RegExp(`["'\`](/(?:${ROUTES}))(?=["'\`#?])`, "g");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(astro|ts)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe("internal links", () => {
  it("always end with a trailing slash", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const offenders = sources(root).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(BAD_LINK)].map((m) => `${file.replace(root, "src/")}: ${m[1]}`),
    );
    expect(offenders).toEqual([]);
  });
});
