import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../supabaseClient";
import { getParkSourceDistribution, listPendingMedia, listProcessedMedia } from "./parkDetails";
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

describe("listPendingMedia / listProcessedMedia — file Photos (Admin-UI-6D)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it("listPendingMedia résout l'auteur (profiles) en 1 requête batched, jamais un lookup par ligne", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_media: {
        data: [
          { id: "m1", park_id: "p1", user_id: "u1", status: "pending", source: "user", park: { id: "p1", name: "Parc A" } },
          { id: "m2", park_id: "p2", user_id: "u2", status: "pending", source: "user", park: { id: "p2", name: "Parc B" } },
        ],
        error: null,
      },
      profiles: { data: [{ id: "u1", name: "Alice" }, { id: "u2", name: "Bob" }], error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await listPendingMedia();

    expect(queriesByTable["park_media"]).toHaveLength(1);
    expect(queriesByTable["profiles"]).toHaveLength(1);
    expect(result.map((m) => [m.id, m.uploadedByName])).toEqual([
      ["m1", "Alice"],
      ["m2", "Bob"],
    ]);
  });

  it("uploadedByName=null quand profiles n'est pas lisible (RLS collectivité) plutôt qu'un nom inventé", async () => {
    const { client } = makeFakeSupabase({
      park_media: {
        data: [{ id: "m1", park_id: "p1", user_id: "u1", status: "pending", source: "user", park: { id: "p1", name: "Parc A" } }],
        error: null,
      },
      profiles: { data: [], error: null }, // RLS filtre tout pour un appelant non-staff
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await listPendingMedia();

    expect(result[0].uploadedByName).toBeNull();
  });

  it("n'appelle jamais profiles quand la liste est vide", async () => {
    const { client, queriesByTable } = makeFakeSupabase({ park_media: { data: [], error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    expect(await listPendingMedia()).toEqual([]);
    expect(queriesByTable["profiles"]).toBeUndefined();
  });

  it("listProcessedMedia filtre sur approved/rejected, jamais pending", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_media: { data: [{ id: "m1", park_id: "p1", user_id: null, status: "approved", source: "toboggo", park: null }], error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await listProcessedMedia();

    const inCall = queriesByTable["park_media"][0].calls.find((c) => c.method === "in" && c.args[0] === "status");
    expect(inCall?.args[1]).toEqual(["approved", "rejected"]);
    expect(result.map((m) => m.id)).toEqual(["m1"]);
  });
});
