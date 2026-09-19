import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../supabaseClient";
import { getParkSourceDistribution } from "./parkDetails";
import { makeFakeSupabase } from "../testUtils/fakeSupabase";

vi.mock("../supabaseClient", () => ({ getSupabase: vi.fn() }));

describe("getParkSourceDistribution — répartition des parcs par source (Admin-UI-2)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it("agrège par source_type, triée du plus grand au plus petit", async () => {
    const { client } = makeFakeSupabase({
      park_sources: {
        data: [
          { source_type: "osm" },
          { source_type: "municipality" },
          { source_type: "osm" },
          { source_type: "osm" },
          { source_type: "user" },
        ],
        error: null,
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await getParkSourceDistribution();

    expect(result).toEqual([
      { source_type: "osm", count: 3 },
      { source_type: "municipality", count: 1 },
      { source_type: "user", count: 1 },
    ]);
  });

  it("gère le cas mono-source (catalogue 100% OSM, état réel actuel)", async () => {
    const { client } = makeFakeSupabase({
      park_sources: { data: [{ source_type: "osm" }, { source_type: "osm" }], error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    expect(await getParkSourceDistribution()).toEqual([{ source_type: "osm", count: 2 }]);
  });

  it("retourne une liste vide plutôt que planter quand park_sources est vide", async () => {
    const { client } = makeFakeSupabase({ park_sources: { data: [], error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    expect(await getParkSourceDistribution()).toEqual([]);
  });

  it("propage une vraie erreur Supabase", async () => {
    const dbError = { message: "boom", code: "500" };
    const { client } = makeFakeSupabase({ park_sources: { data: null, error: dbError } });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(getParkSourceDistribution()).rejects.toEqual(dbError);
  });
});
