import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../supabaseClient";
import { listReports } from "./reports";
import { listReviews } from "./reviews";
import { listPendingMedia, listProcessedMedia } from "./parkDetails";
import { isParkInOrganization, listAllParksForExport, parkExistsWithNameAndAddress } from "./parks";
import { makeFakeSupabase } from "../testUtils/fakeSupabase";

vi.mock("../supabaseClient", () => ({ getSupabase: vi.fn() }));

// Lot A — le périmètre d'une collectivité est une JOINTURE serveur (organization_parks),
// jamais une liste `park_id=in.(…)` : pas de limite d'URL, pas de troncature à 1000.
describe("périmètre collectivité côté serveur (reports / reviews / médias)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  const hasIdList = (calls: { method: string; args: unknown[] }[]) =>
    calls.some((c) => c.method === "in" && (c.args[0] === "park_id" || c.args[0] === "id"));

  it("listReports(communeId) : jointure parks→organization_parks, aucune requête organization_parks, aucun in(park_id)", async () => {
    const { client, queriesByTable } = makeFakeSupabase({ reports: { data: [], error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await listReports({ communeId: "org-1", status: ["open"] });
    const q = queriesByTable["reports"][0];
    expect(queriesByTable["organization_parks"]).toBeUndefined();
    expect(q.calls.find((c) => c.method === "select")?.args[0]).toContain("parks!inner(name, formatted_address, organization_parks!inner(organization_id))");
    expect(q.calls).toContainEqual({ method: "eq", args: ["parks.organization_parks.organization_id", "org-1"] });
    expect(hasIdList(q.calls)).toBe(false);
  });

  it("listReports() sans périmètre (Admin) : aucune jointure ajoutée, aucun filtre d'organisation", async () => {
    const { client, queriesByTable } = makeFakeSupabase({ reports: { data: [], error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await listReports();
    const q = queriesByTable["reports"][0];
    expect(q.calls.find((c) => c.method === "select")?.args[0]).toBe("*, parks!inner(name, formatted_address)");
    expect(q.calls.some((c) => c.method === "eq")).toBe(false);
  });

  it("listReviews(communeId) : même jointure serveur", async () => {
    const { client, queriesByTable } = makeFakeSupabase({ reviews: { data: [], error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await listReviews({ communeId: "org-1" });
    const q = queriesByTable["reviews"][0];
    expect(q.calls.find((c) => c.method === "select")?.args[0]).toContain("organization_parks!inner(organization_id)");
    expect(q.calls).toContainEqual({ method: "eq", args: ["parks.organization_parks.organization_id", "org-1"] });
    expect(hasIdList(q.calls)).toBe(false);
  });

  it("listPendingMedia / listProcessedMedia(communeId) : jointure interne vers le parc de l'organisation", async () => {
    const { client, queriesByTable } = makeFakeSupabase({ park_media: { data: [], error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await listPendingMedia({ communeId: "org-1" });
    await listProcessedMedia({ communeId: "org-1" });
    for (const q of queriesByTable["park_media"]) {
      expect(q.calls.find((c) => c.method === "select")?.args[0]).toContain("park:parks!park_media_park_id_fkey!inner(id, name, organization_parks!inner(organization_id))");
      expect(q.calls).toContainEqual({ method: "eq", args: ["park.organization_parks.organization_id", "org-1"] });
      expect(hasIdList(q.calls)).toBe(false);
    }
    expect(queriesByTable["organization_parks"]).toBeUndefined();
  });

  it("listPendingMedia() Admin : sans jointure ni filtre", async () => {
    const { client, queriesByTable } = makeFakeSupabase({ park_media: { data: [], error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await listPendingMedia();
    const q = queriesByTable["park_media"][0];
    expect(q.calls.find((c) => c.method === "select")?.args[0]).not.toContain("organization_parks");
  });

  it("isParkInOrganization : une requête sur la clé primaire (org, parc)", async () => {
    const { client, queriesByTable } = makeFakeSupabase({ organization_parks: { data: null, error: null, count: 1 } });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    expect(await isParkInOrganization("org-1", "park-1")).toBe(true);
    const q = queriesByTable["organization_parks"][0];
    expect(q.calls).toContainEqual({ method: "eq", args: ["organization_id", "org-1"] });
    expect(q.calls).toContainEqual({ method: "eq", args: ["park_id", "park-1"] });
  });

  it("isParkInOrganization : false si le parc n'est pas dans l'organisation", async () => {
    const { client } = makeFakeSupabase({ organization_parks: { data: null, error: null, count: 0 } });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    expect(await isParkInOrganization("org-1", "autre")).toBe(false);
  });
});

describe("curseur keyset de l'export — valeurs citées", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it("cite virgules, parenthèses et guillemets du dernier nom (pas d'injection dans or=())", async () => {
    const tricky = 'Parc "Les Pins", (nord) \\ test';
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: `p-${i}`, name: i === 999 ? tricky : "x", updated_at: "t" }));
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: (calls) =>
        calls.some((c) => c.method === "or")
          ? { data: [], error: null }
          : { data: full, error: null, count: 1001 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await listAllParksForExport({ sort: "name", order: "asc" });
    const second = queriesByTable["park_public"][1];
    const expr = second.calls.find((c) => c.method === "or")?.args[0] as string;
    expect(expr).toBe(
      'name.gt."Parc \\"Les Pins\\", (nord) \\\\ test",and(name.eq."Parc \\"Les Pins\\", (nord) \\\\ test",id.gt."p-999")',
    );
  });

  it("descendant : opérateur lt ; sans curseur au 1er lot", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: `p-${i}`, updated_at: "2026-01-01T00:00:00.000001+00:00" }));
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: (calls) => (calls.some((c) => c.method === "or") ? { data: [], error: null } : { data: full, error: null, count: 1001 }),
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await listAllParksForExport({});
    expect(queriesByTable["park_public"][0].calls.some((c) => c.method === "or")).toBe(false);
    expect(queriesByTable["park_public"][1].calls.find((c) => c.method === "or")?.args[0]).toContain("updated_at.lt.");
  });
});

describe("détection de doublon à l'import : requête serveur", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());
  it("échappe % _ \\ dans le nom, filtre l'adresse côté serveur, contrôle final strict", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [{ id: "1", name: "50%_Parc", formatted_address: "1 rue A" }, { id: "2", name: "50%_parc", formatted_address: "1 rue A" }], error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    expect(await parkExistsWithNameAndAddress("50%_Parc", "1 rue A")).toBe(true);
    expect(await parkExistsWithNameAndAddress("50%_PARC", "1 rue A")).toBe(false);
    const calls = queriesByTable["park_public"][0].calls;
    expect(calls.find((c) => c.method === "ilike")?.args).toEqual(["name", "50\\%\\_Parc"]);
    expect(calls).toContainEqual({ method: "eq", args: ["formatted_address", "1 rue A"] });
  });

  it("1000 résultats sans correspondance stricte : erreur explicite, jamais « pas de doublon » à tort", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}`, name: "parc", formatted_address: "1 rue A" }));
    const { client } = makeFakeSupabase({ park_public: { data: full, error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await expect(parkExistsWithNameAndAddress("PARC", "1 rue A")).rejects.toThrow(/incomplète/);
  });
});
