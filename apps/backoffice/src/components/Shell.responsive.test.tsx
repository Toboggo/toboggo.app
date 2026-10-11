import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Shell } from "./Shell";

// Lot C1 — navigation basse (≤ 860 px). jsdom n'applique pas les media queries :
// le contrat CSS est vérifié sur la source (garde de non-régression du bug
// « chaque entrée fait 100 % de la barre »), le comportement JS par un rendu.
vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listParks: vi.fn().mockResolvedValue([]),
    listReports: vi.fn().mockResolvedValue([]),
    listPendingMedia: vi.fn().mockResolvedValue([]),
    listParkEdits: vi.fn().mockResolvedValue([]),
  };
});

const scope = vi.hoisted(() => ({ isAdmin: false, communeId: "c1" as string | undefined }));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: scope.isAdmin, communeId: scope.communeId }) }));
vi.mock("../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = {
      memberships: [],
      communes: [],
      activeOrg: { type: "commune", communeId: "c1" },
      setActiveOrg: vi.fn(),
      userName: "Testeur",
      userEmail: "testeur@toboggo.local",
      currentRole: () => "gestionnaire",
      signOut: vi.fn(),
    };
    return sel ? sel(state) : state;
  },
}));

const css = readFileSync(resolve(__dirname, "Shell.module.css"), "utf-8");

/** Corps du dernier `@media (max-width: 860px) { … }` (accolades équilibrées). */
function mobileBlock(): string {
  const start = css.indexOf("@media (max-width: 860px)");
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", start) + 1, i);
  }
  throw new Error("bloc @media non fermé");
}

function rule(block: string, selector: string): string {
  const m = block.match(new RegExp(`(^|\\n)\\s*${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`));
  expect(m, `règle ${selector} absente du bloc mobile`).not.toBeNull();
  return m![2];
}

describe("Shell — barre de navigation basse (≤ 860 px)", () => {
  it("le mode bureau garde width: 100% sur .navItem (liste verticale inchangée)", () => {
    const desktop = css.slice(0, css.indexOf("@media (max-width: 860px)"));
    expect(rule(desktop, ".navItem")).toMatch(/width:\s*100%/);
  });

  it("le mode mobile neutralise width: 100% : les entrées ne prennent plus toute la barre", () => {
    const item = rule(mobileBlock(), ".navItem");
    expect(item).toMatch(/width:\s*auto/);
    expect(item).not.toMatch(/width:\s*100%/);
    expect(item).toMatch(/flex:\s*1 0 auto/); // se répartissent, ne rétrécissent pas
    expect(item).toMatch(/min-width:\s*\d+px/);
  });

  it("la barre défile horizontalement (pas la page) quand tout ne tient pas", () => {
    expect(rule(mobileBlock(), ".nav")).toMatch(/overflow-x:\s*auto/);
  });

  it("ramène l'entrée active dans la zone visible de la barre", () => {
    const scrollIntoView = vi.fn();
    (HTMLElement.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollIntoView;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/statistiques"]}>
          <Shell>
            <div>contenu</div>
          </Shell>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const active = container.querySelector('nav[aria-label="Navigation principale"] [aria-current="page"]');
    expect(active?.textContent).toContain("Statistiques");
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: "center", block: "nearest" });
    expect(scrollIntoView.mock.instances[0]).toBe(active);
  });
});
