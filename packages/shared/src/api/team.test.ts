import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../supabaseClient";
import { listOrganizationsWithCounts } from "./team";
import { makeFakeSupabase } from "../testUtils/fakeSupabase";

vi.mock("../supabaseClient", () => ({ getSupabase: vi.fn() }));

const ORG_LYON = { id: "org-lyon", name: "Ville de Lyon", type: "municipality", verified: true, created_at: "2026-01-01T00:00:00Z" };
const ORG_BORDEAUX = { id: "org-bordeaux", name: "Ville de Bordeaux", type: "municipality", verified: false, created_at: "2026-02-01T00:00:00Z" };

describe("listOrganizationsWithCounts — liste Admin des collectivités (Admin-UI-3B)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it("résout le nombre de parcs rattachés en 2 requêtes au total, quel que soit le nombre de collectivités", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      organizations: { data: [ORG_LYON, ORG_BORDEAUX], error: null },
      organization_parks: {
        data: [{ organization_id: "org-lyon" }, { organization_id: "org-lyon" }, { organization_id: "org-bordeaux" }],
        error: null,
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await listOrganizationsWithCounts();

    expect(queriesByTable["organizations"]).toHaveLength(1);
    expect(queriesByTable["organization_parks"]).toHaveLength(1);
    expect(result).toEqual([
      { ...ORG_LYON, parkCount: 2 },
      { ...ORG_BORDEAUX, parkCount: 1 },
    ]);
  });

  it("retourne parkCount: 0 pour une collectivité sans parc rattaché, plutôt que de l'omettre", async () => {
    const { client } = makeFakeSupabase({
      organizations: { data: [ORG_LYON], error: null },
      organization_parks: { data: [], error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    expect(await listOrganizationsWithCounts()).toEqual([{ ...ORG_LYON, parkCount: 0 }]);
  });

  it("ne renvoie aucun compteur de membres (retiré volontairement — voir commentaire de la fonction)", async () => {
    const { client } = makeFakeSupabase({
      organizations: { data: [ORG_LYON], error: null },
      organization_parks: { data: [], error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const [org] = await listOrganizationsWithCounts();
    expect(org).not.toHaveProperty("memberCount");
  });

  it("propage une vraie erreur Supabase sur organizations", async () => {
    const dbError = { message: "boom", code: "500" };
    const { client } = makeFakeSupabase({
      organizations: { data: null, error: dbError },
      organization_parks: { data: [], error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(listOrganizationsWithCounts()).rejects.toEqual(dbError);
  });

  it("propage une vraie erreur Supabase sur organization_parks", async () => {
    const dbError = { message: "boom", code: "500" };
    const { client } = makeFakeSupabase({
      organizations: { data: [ORG_LYON], error: null },
      organization_parks: { data: null, error: dbError },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(listOrganizationsWithCounts()).rejects.toEqual(dbError);
  });
});
