import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../supabaseClient";
import {
  assertValidAgeRange,
  createPark,
  fetchNearbyParks,
  NEARBY_MAX_PAGES,
  NEARBY_PAGE_SIZE,
  getParkCountryDistribution,
  getParkStatusCounts,
  isValidCoordinate,
  listAllParksForExport,
  listOrgParkIds,
  listParks,
  listParksPage,
  listParkSourcesByIds,
  updatePark,
} from "./parks";
import { formatAgeRange } from "../utils/age";
import { makeFakeSupabase } from "../testUtils/fakeSupabase";

vi.mock("../supabaseClient", () => ({ getSupabase: vi.fn() }));

describe("createPark — bug B1 (no placeholder coordinates)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it("A. refuses to create a park with no coordinates at all", async () => {
    const { client } = makeFakeSupabase({});
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(createPark({ name: "Parc Test", formatted_address: "1 rue Test" })).rejects.toThrow();
  });

  it("A. refuses out-of-range coordinates", async () => {
    const { client } = makeFakeSupabase({});
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(
      createPark({ name: "Parc Test", formatted_address: "1 rue Test", latitude: 999, longitude: 4.8 }),
    ).rejects.toThrow(/coordonnées/i);
  });

  it("A. refuses (0, 0) — the classic uninitialised-value sentinel", async () => {
    const { client } = makeFakeSupabase({});
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(
      createPark({ name: "Parc Test", formatted_address: "1 rue Test", latitude: 0, longitude: 0 }),
    ).rejects.toThrow(/coordonnées/i);
  });

  it("B. creates a park with the real coordinates supplied — never a placeholder", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      parks: { data: { id: "new-park-id" }, error: null },
      park_public: { data: { id: "new-park-id", name: "Parc Test" }, error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await createPark({
      name: "Parc Test",
      formatted_address: "1 rue Test",
      latitude: 45.764043,
      longitude: 4.835659,
    });

    const insertCall = queriesByTable["parks"][0].calls.find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    const insertedRow = insertCall!.args[0] as { latitude: number; longitude: number };
    expect(insertedRow.latitude).toBe(45.764043);
    expect(insertedRow.longitude).toBe(4.835659);
    // The historical bug: a hardcoded Lyon-area fallback. Assert it is gone,
    // not just that *some* value was passed.
    expect(insertedRow.latitude).not.toBe(45.75);
    expect(insertedRow.longitude).not.toBe(4.85);
  });

  it("surfaces a failed organization_parks link instead of silently dropping it", async () => {
    const { client } = makeFakeSupabase({
      parks: { data: { id: "new-park-id" }, error: null },
      organization_parks: { data: null, error: { message: "RLS denied" } },
      park_public: { data: { id: "new-park-id" }, error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(
      createPark({
        name: "Parc Test",
        formatted_address: "1 rue Test",
        latitude: 45.764043,
        longitude: 4.835659,
        organization_id: "org-1",
      }),
    ).rejects.toBeTruthy();
  });
});

describe("listParks — bug B2 (collectivité scoping via organization_parks)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it("C. scopes by organization_parks, not the legacy parks.commune_id column", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      organization_parks: { data: [{ park_id: "park-1" }], error: null },
      park_public: { data: [{ id: "park-1", name: "Parc de la collectivité" }], error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await listParks({ communeId: "org-1" });

    expect(result).toEqual([{ id: "park-1", name: "Parc de la collectivité" }]);

    const orgParksQuery = queriesByTable["organization_parks"][0];
    expect(orgParksQuery.calls).toContainEqual({ method: "eq", args: ["organization_id", "org-1"] });

    const parkPublicQuery = queriesByTable["park_public"][0];
    expect(parkPublicQuery.calls).toContainEqual({ method: "in", args: ["id", ["park-1"]] });
    // The fixed bug: a park created via the back office never gets a V1
    // `commune_id`, so filtering on it would make it disappear. Assert the
    // legacy column is never used for this scoping.
    expect(parkPublicQuery.calls.some((c) => c.method === "eq" && c.args[0] === "commune_id")).toBe(false);
  });

  it("returns no rows (not every row) for a collectivité with zero linked parks", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      organization_parks: { data: [], error: null },
      park_public: { data: [], error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParks({ communeId: "org-empty" });

    const parkPublicQuery = queriesByTable["park_public"][0];
    const inCall = parkPublicQuery.calls.find((c) => c.method === "in" && c.args[0] === "id");
    expect(inCall).toBeDefined();
    // `IN ()` would match nothing in a way that's easy to get backwards —
    // assert a non-empty sentinel list is used instead of an empty array.
    expect((inCall!.args[1] as unknown[]).length).toBeGreaterThan(0);
  });

  it("coalesces concurrent calls for the same organisation into a single organization_parks query", async () => {
    // A screen (e.g. the dashboard, or the sidebar badges) routinely calls
    // listParks/listReports/listReviews/listPendingMedia in parallel for the
    // same communeId — each used to re-run its own organization_parks
    // lookup. Simulate that fan-out directly against listOrgParkIds.
    const { client, queriesByTable } = makeFakeSupabase({
      organization_parks: { data: [{ park_id: "park-1" }], error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const [a, b, c] = await Promise.all([
      listOrgParkIds("org-1"),
      listOrgParkIds("org-1"),
      listOrgParkIds("org-1"),
    ]);

    expect(a).toEqual(["park-1"]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(queriesByTable["organization_parks"]).toHaveLength(1);
  });

  it("does not cache across separate (non-overlapping) calls — a later call re-fetches", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      organization_parks: { data: [{ park_id: "park-1" }], error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listOrgParkIds("org-1");
    await listOrgParkIds("org-1");

    expect(queriesByTable["organization_parks"]).toHaveLength(2);
  });
});

describe("listParksPage — server pagination / sort / search (Lot 3A)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  function calls(q: { calls: { method: string; args: unknown[] }[] }, method: string) {
    return q.calls.filter((c) => c.method === method).map((c) => c.args);
  }

  it("requests the right page window and returns the exact total + page count", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [{ id: "p1" }, { id: "p2" }], error: null, count: 57 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const res = await listParksPage({ page: 3, pageSize: 25 });

    expect(res.total).toBe(57);
    expect(res.page).toBe(3);
    expect(res.pageCount).toBe(3);
    expect(res.rows).toHaveLength(2);
    // page 3, size 25 -> rows 50..74
    expect(calls(queriesByTable["park_public"][0], "range")[0]).toEqual([50, 74]);
  });

  it("asks PostgREST for an exact count", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [], error: null, count: 0 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage();

    const selectArgs = calls(queriesByTable["park_public"][0], "select")[0];
    expect(selectArgs[1]).toEqual({ count: "exact" });
  });

  it("filters by name server-side (ilike) only when a non-empty query is given", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [], error: null, count: 0 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage({ q: "  gourg  " });
    expect(calls(queriesByTable["park_public"][0], "ilike")[0]).toEqual(["name", "%gourg%"]);

    await listParksPage({ q: "   " });
    expect(calls(queriesByTable["park_public"][1], "ilike")).toHaveLength(0);
  });

  it("orders by the requested sort key plus a stable id tiebreaker", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [], error: null, count: 0 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage({ sort: "name", order: "asc" });

    const orderArgs = calls(queriesByTable["park_public"][0], "order");
    expect(orderArgs[0]).toEqual(["name", { ascending: true }]);
    expect(orderArgs[1]).toEqual(["id", { ascending: true }]);
  });

  it("defaults to updated_at desc", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [], error: null, count: 0 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage();

    expect(calls(queriesByTable["park_public"][0], "order")[0]).toEqual(["updated_at", { ascending: false }]);
  });

  it("scopes to a commune via organization_parks and applies status + verification filters", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      organization_parks: { data: [{ park_id: "park-1" }, { park_id: "park-2" }], error: null },
      park_public: { data: [{ id: "park-1" }], error: null, count: 1 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage({
      communeId: "org-1",
      status: ["published"],
      verification: ["organization_verified"],
    });

    const inArgs = calls(queriesByTable["park_public"][0], "in");
    expect(inArgs).toContainEqual(["id", ["park-1", "park-2"]]);
    expect(inArgs).toContainEqual(["moderation_status", ["published"]]);
    expect(inArgs).toContainEqual(["verification_status", ["organization_verified"]]);
  });

  it("a commune with zero linked parks sees zero rows (sentinel), never everything", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      organization_parks: { data: [], error: null },
      park_public: { data: [], error: null, count: 0 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const res = await listParksPage({ communeId: "org-empty" });

    expect(res.total).toBe(0);
    const inArgs = calls(queriesByTable["park_public"][0], "in");
    expect(inArgs[0]).toEqual(["id", ["00000000-0000-0000-0000-000000000000"]]);
  });
});

describe("listParksPage — Admin-UI-5B (filtre Source, filtre Collectivité, colonne Source)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  function calls(q: { calls: { method: string; args: unknown[] }[] }, method: string) {
    return q.calls.filter((c) => c.method === method).map((c) => c.args);
  }

  it("left-joins park_sources by default and reads each row's source_type from the embedded resource", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: {
        data: [
          { id: "p1", park_sources: [{ source_type: "osm" }] },
          { id: "p2", park_sources: [] },
        ],
        error: null,
        count: 2,
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const res = await listParksPage();

    // No separate `park_sources` request at all — the join is embedded in
    // the single `park_public` select, never a per-row/per-page follow-up.
    expect(queriesByTable["park_sources"]).toBeUndefined();
    const selectArgs = calls(queriesByTable["park_public"][0], "select")[0];
    expect(selectArgs[0]).toContain("park_sources(source_type)");
    expect(res.rows.find((r) => r.id === "p1")?.source_type).toBe("osm");
    expect(res.rows.find((r) => r.id === "p2")?.source_type).toBeNull();
  });

  it("filters by source_type via a real join (`!inner`), never an id=in.(…) list — a source can match the whole catalog", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [{ id: "p1", park_sources: [{ source_type: "osm" }] }], error: null, count: 1 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage({ sourceTypes: ["osm"] });

    expect(queriesByTable["park_sources"]).toBeUndefined();
    const selectArgs = calls(queriesByTable["park_public"][0], "select")[0];
    expect(selectArgs[0]).toContain("park_sources!inner(source_type)");
    expect(calls(queriesByTable["park_public"][0], "in")).toContainEqual(["park_sources.source_type", ["osm"]]);
    // Crucially, no id-based restriction is derived from the source filter.
    expect(calls(queriesByTable["park_public"][0], "in").some(([col]) => col === "id")).toBe(false);
  });

  it("combines the source filter (join) with the commune scope (id list) — both apply", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      organization_parks: { data: [{ park_id: "p1" }], error: null },
      park_public: { data: [{ id: "p1", park_sources: [{ source_type: "osm" }] }], error: null, count: 1 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage({ communeId: "org-1", sourceTypes: ["osm"] });

    const inArgs = calls(queriesByTable["park_public"][0], "in");
    expect(inArgs).toContainEqual(["id", ["p1"]]);
    expect(inArgs).toContainEqual(["park_sources.source_type", ["osm"]]);
  });

  it("filters by organizationId via organization_parks — distinct from the commune-scope communeId", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      organization_parks: { data: [{ park_id: "p9" }], error: null },
      park_public: { data: [{ id: "p9" }], error: null, count: 1 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage({ organizationId: "org-9" });

    const inArgs = calls(queriesByTable["park_public"][0], "in");
    expect(inArgs).toContainEqual(["id", ["p9"]]);
  });

  it("Admin-UI-7D-C : filters by countryCode via a plain eq (no join needed, unlike sourceTypes)", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [{ id: "p1" }], error: null, count: 1 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage({ countryCode: "ES" });

    const eqArgs = calls(queriesByTable["park_public"][0], "eq");
    expect(eqArgs).toContainEqual(["country_code", "ES"]);
  });
});

describe("listAllParksForExport — Admin-UI-8B (export CSV, jamais listParks() ni un tableau tronqué par max_rows)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  function calls(q: { calls: { method: string; args: unknown[] }[] }, method: string) {
    return q.calls.filter((c) => c.method === method).map((c) => c.args);
  }

  it("un catalogue sous max_rows tient en une seule page", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [{ id: "p1" }, { id: "p2" }], error: null, count: 2 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const rows = await listAllParksForExport();

    expect(rows.map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(queriesByTable["park_public"]).toHaveLength(1);
    expect(calls(queriesByTable["park_public"][0], "range")[0]).toEqual([0, 999]);
  });

  it("0 résultat : un seul appel, aucune page supplémentaire, tableau vide", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [], error: null, count: 0 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    expect(await listAllParksForExport()).toEqual([]);
    expect(queriesByTable["park_public"]).toHaveLength(1);
  });

  it("régression >1000 : 2500 parcs répartis sur 3 pages — aucune ligne perdue, aucune dupliquée, arrêt exact à la dernière page", async () => {
    const total = 2500;
    const page0 = Array.from({ length: 1000 }, (_, i) => ({ id: `p-${i}` }));
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `p-${1000 + i}` }));
    const page2 = Array.from({ length: 500 }, (_, i) => ({ id: `p-${2000 + i}` }));

    const { client, queriesByTable } = makeFakeSupabase({
      park_public: (calls) => {
        const rangeCall = calls.find((c) => c.method === "range");
        const [from] = (rangeCall?.args ?? [0]) as [number, number];
        if (from === 0) return { data: page0, error: null, count: total };
        if (from === 1000) return { data: page1, error: null };
        return { data: page2, error: null };
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const rows = await listAllParksForExport();

    expect(rows).toHaveLength(total);
    expect(new Set(rows.map((r) => r.id)).size).toBe(total); // aucune duplication
    // Toutes les lignes 0..2499 sont présentes, dans l'ordre des pages.
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: total }, (_, i) => `p-${i}`));
    // Exactement 3 requêtes (2500 / 1000 par page) — jamais une 4e de trop,
    // jamais une seule requête tronquée à 1000.
    expect(queriesByTable["park_public"]).toHaveLength(3);
    expect(calls(queriesByTable["park_public"][0], "range")[0]).toEqual([0, 999]);
    expect(calls(queriesByTable["park_public"][1], "range")[0]).toEqual([1000, 1999]);
    expect(calls(queriesByTable["park_public"][2], "range")[0]).toEqual([2000, 2999]);
  });

  it("propage les mêmes filtres (statut, source, pays, recherche, tri) à chaque page, y compris au-delà de la première", async () => {
    const total = 1500;
    const page0 = Array.from({ length: 1000 }, (_, i) => ({ id: `p-${i}`, park_sources: [{ source_type: "osm" }] }));
    const page1 = Array.from({ length: 500 }, (_, i) => ({ id: `p-${1000 + i}`, park_sources: [{ source_type: "osm" }] }));

    const { client, queriesByTable } = makeFakeSupabase({
      park_public: (calls) => {
        const rangeCall = calls.find((c) => c.method === "range");
        const [from] = (rangeCall?.args ?? [0]) as [number, number];
        if (from === 0) return { data: page0, error: null, count: total };
        return { data: page1, error: null };
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listAllParksForExport({
      status: ["published"],
      sourceTypes: ["osm"],
      countryCode: "ES",
      q: "gourg",
      sort: "name",
      order: "asc",
    });

    for (const q of queriesByTable["park_public"]) {
      expect(calls(q, "in")).toContainEqual(["moderation_status", ["published"]]);
      expect(calls(q, "in")).toContainEqual(["park_sources.source_type", ["osm"]]);
      expect(calls(q, "eq")).toContainEqual(["country_code", "ES"]);
      expect(calls(q, "ilike")).toContainEqual(["name", "%gourg%"]);
      expect(calls(q, "order")[0]).toEqual(["name", { ascending: true }]);
    }
  });

  it("une erreur sur une page intermédiaire (pas la première) est bien remontée, jamais avalée", async () => {
    const total = 2200;
    const page0 = Array.from({ length: 1000 }, (_, i) => ({ id: `p-${i}` }));

    const { client } = makeFakeSupabase({
      park_public: (calls) => {
        const rangeCall = calls.find((c) => c.method === "range");
        const [from] = (rangeCall?.args ?? [0]) as [number, number];
        if (from === 0) return { data: page0, error: null, count: total };
        if (from === 1000) return { data: null, error: { message: "boom" } };
        return { data: [], error: null };
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(listAllParksForExport()).rejects.toEqual({ message: "boom" });
  });

  it("une erreur sur la toute première page est remontée sans tenter aucune autre page", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: null, error: { message: "boom" } },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(listAllParksForExport()).rejects.toEqual({ message: "boom" });
    expect(queriesByTable["park_public"]).toHaveLength(1);
  });

  it("respecte la même restriction communeId/organizationId que listParksPage (via resolveIdRestriction partagé)", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      organization_parks: { data: [{ park_id: "p1" }], error: null },
      park_public: { data: [{ id: "p1" }], error: null, count: 1 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listAllParksForExport({ communeId: "org-1" });

    const inArgs = calls(queriesByTable["park_public"][0], "in");
    expect(inArgs).toContainEqual(["id", ["p1"]]);
  });
});

describe("getParkStatusCounts / getParkCountryDistribution — Admin-UI-7D-C (comptes exacts, jamais un tableau tronqué par max_rows)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it("getParkStatusCounts : un count exact (head:true) par statut demandé, en parallèle", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: (calls) => {
        const eq = calls.find((c) => c.method === "eq");
        const status = eq?.args[1] as string | undefined;
        const counts: Record<string, number> = { published: 1523, pending: 12 };
        return { data: null, error: null, count: (status && counts[status]) ?? 0 };
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await getParkStatusCounts(["published", "pending"]);

    expect(result).toEqual({ published: 1523, pending: 12 });
    expect(queriesByTable["park_public"]).toHaveLength(2);
    for (const q of queriesByTable["park_public"]) {
      const selectArgs = q.calls.find((c) => c.method === "select")?.args;
      expect(selectArgs?.[1]).toEqual({ count: "exact", head: true });
    }
  });

  it("getParkStatusCounts régression >1000 : reste exact quand le vrai total dépasse max_rows (jamais un .filter().length sur un tableau tronqué à 1000)", async () => {
    const { client } = makeFakeSupabase({
      park_public: { data: null, error: null, count: 2201 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    expect(await getParkStatusCounts(["published"])).toEqual({ published: 2201 });
  });

  it("getParkStatusCounts : scope communeId via organization_parks", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      organization_parks: { data: [{ park_id: "p1" }, { park_id: "p2" }], error: null },
      park_public: { data: null, error: null, count: 2 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await getParkStatusCounts(["published"], { communeId: "org-1" });

    const inArgs = queriesByTable["park_public"][0].calls.find((c) => c.method === "in")?.args;
    expect(inArgs).toEqual(["id", ["p1", "p2"]]);
  });

  it("getParkCountryDistribution : agrège via un count total puis une pagination sur country_code seul (jamais le tableau Park complet)", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: (calls) => {
        const rangeCall = calls.find((c) => c.method === "range");
        if (!rangeCall) return { data: null, error: null, count: 3 };
        return {
          data: [{ country_code: "FR" }, { country_code: "FR" }, { country_code: "ES" }],
          error: null,
        };
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await getParkCountryDistribution();

    expect(result).toEqual([
      { country_code: "FR", count: 2 },
      { country_code: "ES", count: 1 },
    ]);
    // 1 requête de count (head) + 1 seule page (3 lignes < 1000) — jamais un select() sans filtre sur les colonnes complètes de Park.
    expect(queriesByTable["park_public"]).toHaveLength(2);
    const pageSelect = queriesByTable["park_public"][1].calls.find((c) => c.method === "select")?.args[0];
    expect(pageSelect).toBe("country_code");
  });

  it("getParkCountryDistribution régression >1000 : agrège correctement sur plusieurs pages au-delà de max_rows", async () => {
    const total = 2500;
    const page0 = Array.from({ length: 1000 }, () => ({ country_code: "FR" }));
    const page1 = [
      ...Array.from({ length: 700 }, () => ({ country_code: "FR" })),
      ...Array.from({ length: 300 }, () => ({ country_code: "ES" })),
    ];
    const page2 = Array.from({ length: 500 }, () => ({ country_code: "ES" }));

    const { client, queriesByTable } = makeFakeSupabase({
      park_public: (calls) => {
        const rangeCall = calls.find((c) => c.method === "range");
        if (!rangeCall) return { data: null, error: null, count: total };
        const [from] = rangeCall.args as [number, number];
        if (from === 0) return { data: page0, error: null };
        if (from === 1000) return { data: page1, error: null };
        return { data: page2, error: null };
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await getParkCountryDistribution();

    expect(result).toEqual([
      { country_code: "FR", count: 1700 },
      { country_code: "ES", count: 800 },
    ]);
    // 1 count + 3 pages (2500 lignes / 1000 par page) : jamais 1 seule requête tronquée.
    expect(queriesByTable["park_public"]).toHaveLength(4);
  });

  it("getParkCountryDistribution : un catalogue vide ne déclenche aucune page", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: null, error: null, count: 0 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    expect(await getParkCountryDistribution()).toEqual([]);
    expect(queriesByTable["park_public"]).toHaveLength(1);
  });

  it("un futur pays apparaît automatiquement — aucune liste de pays codée en dur", async () => {
    const { client } = makeFakeSupabase({
      park_public: (calls) => {
        const rangeCall = calls.find((c) => c.method === "range");
        if (!rangeCall) return { data: null, error: null, count: 1 };
        return { data: [{ country_code: "PT" }], error: null };
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    expect(await getParkCountryDistribution()).toEqual([{ country_code: "PT", count: 1 }]);
  });
});

describe("listParkSourcesByIds", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it("returns an empty map without querying when given no ids", async () => {
    const { client, queriesByTable } = makeFakeSupabase({});
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const map = await listParkSourcesByIds([]);

    expect(map.size).toBe(0);
    expect(queriesByTable["park_sources"]).toBeUndefined();
  });

  it("keeps the first source row when a park has more than one (rare, never expected to throw)", async () => {
    const { client } = makeFakeSupabase({
      park_sources: {
        data: [
          { park_id: "p1", source_type: "osm" },
          { park_id: "p1", source_type: "municipality" },
        ],
        error: null,
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const map = await listParkSourcesByIds(["p1"]);

    expect(map.get("p1")).toBe("osm");
  });
});

describe("updatePark — ages (provenance for a numeric bound, direct write for a clear)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  function setup() {
    const { client, queriesByTable, rpcCalls } = makeFakeSupabase({
      parks: { data: null, error: null },
      park_public: { data: { id: "p1" }, error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    return { queriesByTable, rpcCalls };
  }
  const directRow = (q: ReturnType<typeof setup>["queriesByTable"]) =>
    q["parks"]?.[0]?.calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown> | undefined;
  const rpcFor = (calls: { fn: string; params: unknown }[], key: string) =>
    calls.find(
      (c) => c.fn === "apply_park_attribute" && (c.params as { p_attribute_key: string }).p_attribute_key === key,
    )?.params as { p_value_json: unknown } | undefined;

  it("age key absent → no direct write of the column, no RPC call", async () => {
    const { queriesByTable, rpcCalls } = setup();
    await updatePark("p1", { description: "x" });
    const row = directRow(queriesByTable)!;
    expect("min_age" in row).toBe(false);
    expect("max_age" in row).toBe(false);
    expect("ages_derived" in row).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("age present with a number → goes through apply_park_attribute (NOT a direct parks.update)", async () => {
    const { queriesByTable, rpcCalls } = setup();
    await updatePark("p1", { age_min: 2, age_max: 10 });
    expect(rpcFor(rpcCalls, "min_age")!.p_value_json).toBe(2);
    expect(rpcFor(rpcCalls, "max_age")!.p_value_json).toBe(10);
    // the RPC projection owns min_age / max_age / ages_derived
    const row = directRow(queriesByTable);
    expect(row === undefined || !("min_age" in row)).toBe(true);
  });

  it("age clear (null) → direct write, explicitly (0032's RPC rejects a JSON-null value_json)", async () => {
    const { queriesByTable, rpcCalls } = setup();
    await updatePark("p1", { age_min: null, age_max: null });
    const row = directRow(queriesByTable)!;
    expect(row.min_age).toBeNull();
    expect(row.max_age).toBeNull();
    expect(row.ages_derived).toBe(false);
    // never silently forwarded to the RPC as null
    expect(rpcCalls).toHaveLength(0);
  });

  it("clears one bound + sets the other → clear goes direct, set goes to the RPC", async () => {
    const { queriesByTable, rpcCalls } = setup();
    await updatePark("p1", { age_min: 3, age_max: null });
    expect(rpcFor(rpcCalls, "min_age")!.p_value_json).toBe(3);
    const row = directRow(queriesByTable)!;
    expect(row.max_age).toBeNull();
    expect("min_age" in row).toBe(false);
    expect(row.ages_derived).toBe(false);
  });

  it("min > max (both numbers) → refused before any write or RPC call", async () => {
    const { queriesByTable, rpcCalls } = setup();
    await expect(updatePark("p1", { age_min: 10, age_max: 3 })).rejects.toThrow(/âge/i);
    expect(directRow(queriesByTable)).toBeUndefined();
    expect(rpcCalls).toHaveLength(0);
  });

  it("min-only / max-only never triggers the range check", async () => {
    setup();
    await expect(updatePark("p1", { age_min: 8 })).resolves.toBeDefined();
    await expect(updatePark("p1", { age_max: 4 })).resolves.toBeDefined();
  });
});

describe("assertValidAgeRange", () => {
  it("throws only when both bounds are numbers and min > max", () => {
    expect(() => assertValidAgeRange(10, 3)).toThrow();
    expect(() => assertValidAgeRange(3, 10)).not.toThrow();
    expect(() => assertValidAgeRange(5, 5)).not.toThrow();
    expect(() => assertValidAgeRange(10, null)).not.toThrow();
    expect(() => assertValidAgeRange(null, 3)).not.toThrow();
    expect(() => assertValidAgeRange(undefined, undefined)).not.toThrow();
  });
});

describe("updatePark — provenance routing via apply_park_attribute (D3 Phase 1)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  // Stored park the RPC composite is merged over (address + location paths read it).
  const CURRENT = {
    id: "p1",
    name: "Ancien nom",
    address_line: "1 rue Ancienne",
    postal_code: "12000",
    city: "Rodez",
    admin_area_1: null,
    admin_area_2: null,
    latitude: 44.35,
    longitude: 2.57,
  };

  function setup(extra: Record<string, { data: unknown; error: unknown; count?: unknown }> = {}) {
    const { client, queriesByTable, rpcCalls } = makeFakeSupabase({
      parks: { data: null, error: null },
      park_public: { data: CURRENT, error: null },
      ...extra,
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    return { queriesByTable, rpcCalls };
  }
  const directRow = (q: ReturnType<typeof setup>["queriesByTable"]) =>
    q["parks"]?.[0]?.calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown> | undefined;
  const rpcFor = (calls: { fn: string; params: unknown }[], key: string) =>
    calls.find(
      (c) => c.fn === "apply_park_attribute" && (c.params as { p_attribute_key: string }).p_attribute_key === key,
    )?.params as { p_park_id: string; p_attribute_key: string; p_value_json: unknown } | undefined;

  it("name → apply_park_attribute (key 'name', scalar value) — never a direct parks.update of `name`", async () => {
    const { queriesByTable, rpcCalls } = setup();
    await updatePark("p1", { name: "Square des Tilleuls" });
    expect(rpcFor(rpcCalls, "name")).toEqual({
      p_park_id: "p1",
      p_attribute_key: "name",
      p_value_json: "Square des Tilleuls",
    });
    expect(directRow(queriesByTable)).toBeUndefined();
  });

  it("structured address → ONE RPC call (key 'address', full 5-field composite merged over current)", async () => {
    const { queriesByTable, rpcCalls } = setup();
    await updatePark("p1", { address_line: "12 rue des Écoles", city: "Millau" });
    expect(rpcFor(rpcCalls, "address")!.p_value_json).toEqual({
      address_line: "12 rue des Écoles",
      postal_code: "12000", // untouched field kept from the stored park
      city: "Millau",
      admin_area_1: null,
      admin_area_2: null,
    });
    expect(directRow(queriesByTable)).toBeUndefined();
    // the view-derived column is never sent
    expect(rpcCalls.some((c) => JSON.stringify(c.params).includes("formatted_address"))).toBe(false);
  });

  it("clearing an address field with null → the clear reaches the RPC, NOT reverted to the stored value", async () => {
    const { rpcCalls } = setup();
    await updatePark("p1", { postal_code: null, city: null });
    expect(rpcFor(rpcCalls, "address")!.p_value_json).toEqual({
      address_line: "1 rue Ancienne", // untouched
      postal_code: null, // explicitly cleared — not "12000"
      city: null, // explicitly cleared — not "Rodez"
      admin_area_1: null,
      admin_area_2: null,
    });
  });

  it("clearing the ONLY changed address field still routes through the RPC (presence, not `!= null`)", async () => {
    const { queriesByTable, rpcCalls } = setup();
    await updatePark("p1", { city: null });
    expect(rpcFor(rpcCalls, "address")).toBeDefined();
    expect((rpcFor(rpcCalls, "address")!.p_value_json as { city: unknown }).city).toBeNull();
    expect(directRow(queriesByTable)).toBeUndefined();
  });

  it("legacy formatted_address falls back to address_line and still goes through the RPC", async () => {
    const { rpcCalls } = setup();
    await updatePark("p1", { formatted_address: "3 place du Marché, 12100 Millau" });
    expect((rpcFor(rpcCalls, "address")!.p_value_json as { address_line: unknown }).address_line).toBe(
      "3 place du Marché, 12100 Millau",
    );
  });

  it("a structured address_line wins over a legacy formatted_address in the same patch", async () => {
    const { rpcCalls } = setup();
    await updatePark("p1", { address_line: "5 rue A", formatted_address: "ignored" });
    expect((rpcFor(rpcCalls, "address")!.p_value_json as { address_line: unknown }).address_line).toBe("5 rue A");
  });

  it("location → RPC (key 'location', {lat,lng}); a valid pair passes validation first", async () => {
    const { queriesByTable, rpcCalls } = setup();
    await updatePark("p1", { latitude: 44.1, longitude: 3.07 });
    expect(rpcFor(rpcCalls, "location")!.p_value_json).toEqual({ lat: 44.1, lng: 3.07 });
    expect(directRow(queriesByTable)).toBeUndefined();
  });

  it("location — out-of-range / (0,0) / lone bound are refused BEFORE any RPC or write", async () => {
    const a = setup();
    await expect(updatePark("p1", { latitude: 999, longitude: 3.07 })).rejects.toThrow(/coordonn/i);
    expect(a.rpcCalls).toHaveLength(0);

    const b = setup();
    await expect(updatePark("p1", { latitude: 0, longitude: 0 })).rejects.toThrow(/coordonn/i);
    expect(b.rpcCalls).toHaveLength(0);

    const c = setup();
    await expect(updatePark("p1", { latitude: 44.1 })).rejects.toThrow(/ensemble/i);
    await expect(updatePark("p1", { longitude: 3.07 })).rejects.toThrow(/ensemble/i);
    expect(c.rpcCalls).toHaveLength(0);
  });

  it("non-covered columns (description, moderation_status) → direct parks.update, no RPC", async () => {
    const { queriesByTable, rpcCalls } = setup();
    await updatePark("p1", { description: "Nouvelle description", status: "published" });
    const row = directRow(queriesByTable)!;
    expect(row.description).toBe("Nouvelle description");
    expect(row.moderation_status).toBe("published");
    expect("latitude" in row).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("name + address + description in one patch → 2 RPC calls (name, address) + 1 direct update (description only)", async () => {
    const { queriesByTable, rpcCalls } = setup();
    await updatePark("p1", { name: "N", address_line: "5 rue A", description: "D" });
    expect(rpcFor(rpcCalls, "name")).toBeDefined();
    expect(rpcFor(rpcCalls, "address")).toBeDefined();
    expect(rpcCalls).toHaveLength(2);
    expect(directRow(queriesByTable)).toEqual({ description: "D" });
  });

  it("an RPC error is propagated — a manual correction never silently no-ops", async () => {
    const { client } = makeFakeSupabase({
      park_public: { data: CURRENT, error: null },
      "rpc:apply_park_attribute": { data: null, error: { message: "check_violation" } },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await expect(updatePark("p1", { name: "X" })).rejects.toBeTruthy();
  });

  it("no regression: applyFeatures still upserts park_features alongside a provenance edit", async () => {
    const { queriesByTable, rpcCalls } = setup({
      features: { data: [{ id: "f-slide", code: "slide" }], error: null },
      park_features: { data: null, error: null },
    });
    await updatePark("p1", { name: "N", play_equipment: ["toboggan"] });
    expect(rpcFor(rpcCalls, "name")).toBeDefined();
    const pf = queriesByTable["park_features"]?.[0]?.calls.find((c) => c.method === "upsert")?.args[0];
    expect(pf).toEqual([{ park_id: "p1", feature_id: "f-slide", status: "available", value: null, quantity: null }]);
  });

  it("organization_parks link failure is still propagated (bug B2), even with a provenance edit", async () => {
    const { client } = makeFakeSupabase({
      parks: { data: null, error: null },
      park_public: { data: CURRENT, error: null },
      organization_parks: { data: null, error: { message: "RLS denied" } },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await expect(updatePark("p1", { name: "N", organization_id: "org-1" })).rejects.toBeTruthy();
  });
});

describe("formatAgeRange (canonical helper — ../utils/age — never invents a band)", () => {
  it("both absent → 'Âge non renseigné' (never a default band / 'Tout âge')", () => {
    expect(formatAgeRange(null, null)).toBe("Âge non renseigné");
    expect(formatAgeRange(undefined, undefined)).toBe("Âge non renseigné");
  });
  it("full range", () => {
    expect(formatAgeRange(3, 10)).toBe("3–10 ans");
  });
  it("min only", () => {
    expect(formatAgeRange(2, null)).toBe("Dès 2 ans");
  });
  it("max only", () => {
    expect(formatAgeRange(null, 6)).toBe("Jusqu'à 6 ans");
  });
  it("min === max renders without inventing a wider band", () => {
    expect(formatAgeRange(5, 5)).toBe("5 ans");
  });
});

describe("isValidCoordinate", () => {
  it("accepts a real French coordinate", async () => {
    expect(isValidCoordinate(45.764043, 4.835659)).toBe(true);
  });

  it("rejects NaN, out-of-range and (0, 0)", async () => {
    expect(isValidCoordinate(NaN, 4.8)).toBe(false);
    expect(isValidCoordinate(45.7, NaN)).toBe(false);
    expect(isValidCoordinate(95, 4.8)).toBe(false);
    expect(isValidCoordinate(45.7, 200)).toBe(false);
    expect(isValidCoordinate(0, 0)).toBe(false);
  });
});


describe("createPark — pays + fuseau (US P0)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  async function insertedRow(input: Parameters<typeof createPark>[0]) {
    const { client, queriesByTable } = makeFakeSupabase({
      parks: { data: { id: "new-park-id" }, error: null },
      park_public: { data: { id: "new-park-id" }, error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await createPark(input);
    const insert = queriesByTable["parks"][0].calls.find((c) => c.method === "insert");
    return insert!.args[0] as { country_code: string; timezone: string };
  }

  it("un parc à Manhattan n'est plus FR / Europe/Paris", async () => {
    const row = await insertedRow({ name: "Playground", latitude: 40.758, longitude: -73.9855 });
    expect(row.country_code).toBe("US");
    expect(row.timezone).toBe("America/New_York");
  });

  it("FR inchangé (Lyon) et ES corrigé (Barcelone n'est plus FR)", async () => {
    const fr = await insertedRow({ name: "Parc", latitude: 45.764043, longitude: 4.835659 });
    expect([fr.country_code, fr.timezone]).toEqual(["FR", "Europe/Paris"]);
    const es = await insertedRow({ name: "Parque", latitude: 41.39, longitude: 2.17 });
    expect([es.country_code, es.timezone]).toEqual(["ES", "Europe/Madrid"]);
  });

  it("respecte country_code / timezone fournis", async () => {
    const row = await insertedRow({
      name: "Parc",
      latitude: 40.758,
      longitude: -73.9855,
      country_code: "US",
      timezone: "America/Detroit",
    });
    expect([row.country_code, row.timezone]).toEqual(["US", "America/Detroit"]);
  });

  it("pays introuvable ⇒ rejet explicite, aucun INSERT", async () => {
    const { client, queriesByTable } = makeFakeSupabase({ parks: { data: { id: "x" }, error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await expect(createPark({ name: "Park", latitude: 43.65, longitude: -79.38 })).rejects.toMatchObject({
      reason: "country_unresolved",
    });
    expect(queriesByTable["parks"]).toBeUndefined();
  });
});

describe("fetchNearbyParks — pagination au-delà de max_rows (Manhattan)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  const MANHATTAN = { lat: 40.758, lng: -73.9855 };

  /** `total` lignes triées par distance croissante, tranchées par `.range()` comme PostgREST. */
  function paged(total: number, opts: { capPerPage?: number } = {}) {
    const all = Array.from({ length: total }, (_, i) => ({
      id: `park-${i}`,
      name: "Playground",
      latitude: 40.75,
      longitude: -73.98,
      distance_m: 400 + i * 12,
      features: {},
    }));
    const responder = (calls: { method: string; args: unknown[] }[]) => {
      const range = calls.find((c) => c.method === "range");
      const [from, to] = (range?.args ?? [0, total - 1]) as [number, number];
      const end = Math.min(to, from + (opts.capPerPage ?? Infinity) - 1);
      return { data: all.slice(from, end + 1), error: null };
    };
    const { client, rpcCalls } = makeFakeSupabase({ "rpc:nearby_parks": responder });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    return { rpcCalls, all };
  }

  it("rend les 1 483 parcs de 20 km autour de Times Square, sans doublon, triés", async () => {
    const { rpcCalls } = paged(1483);
    const parks = await fetchNearbyParks({ ...MANHATTAN, radiusMeters: 20000 });
    expect(parks).toHaveLength(1483);
    expect(new Set(parks.map((p) => p.id)).size).toBe(1483);
    expect(parks.map((p) => p.distance_m)).toEqual([...parks.map((p) => p.distance_m)].sort((a, b) => a - b));
    // le dernier parc (le plus loin) n'est plus tronqué
    expect(parks[parks.length - 1].id).toBe("park-1482");
    expect(rpcCalls).toHaveLength(2);
  });

  it("conserve le rayon et le centre sur chaque page", async () => {
    const { rpcCalls } = paged(1483);
    await fetchNearbyParks({ ...MANHATTAN, radiusMeters: 20000 });
    for (const call of rpcCalls) {
      expect(call.params).toEqual({ p_lat: MANHATTAN.lat, p_lng: MANHATTAN.lng, p_radius_m: 20000 });
    }
  });

  it("zone peu dense : un seul appel (comportement historique)", async () => {
    const { rpcCalls } = paged(12);
    expect(await fetchNearbyParks({ lat: 45.764, lng: 4.8357 })).toHaveLength(12);
    expect(rpcCalls).toHaveLength(1);
  });

  it("exactement une page pleine : une page suivante vide termine proprement", async () => {
    const { rpcCalls } = paged(NEARBY_PAGE_SIZE);
    expect(await fetchNearbyParks(MANHATTAN)).toHaveLength(NEARBY_PAGE_SIZE);
    expect(rpcCalls).toHaveLength(2);
  });

  it("ignore un parc renvoyé deux fois entre deux pages", async () => {
    const dup = (id: string) => ({ id, name: "P", latitude: 1, longitude: 1, distance_m: 1, features: {} });
    const page1 = Array.from({ length: NEARBY_PAGE_SIZE }, (_, i) => dup(`p${i}`));
    const responder = (calls: { method: string; args: unknown[] }[]) => {
      const from = (calls.find((c) => c.method === "range")?.args[0] ?? 0) as number;
      return { data: from === 0 ? page1 : [dup("p999"), dup("extra")], error: null };
    };
    const { client } = makeFakeSupabase({ "rpc:nearby_parks": responder });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    const parks = await fetchNearbyParks(MANHATTAN);
    expect(parks).toHaveLength(NEARBY_PAGE_SIZE + 1);
  });

  it("garde-fou : jamais plus de NEARBY_MAX_PAGES appels", async () => {
    const full = Array.from({ length: NEARBY_PAGE_SIZE }, (_, i) => i);
    const { client, rpcCalls } = makeFakeSupabase({
      "rpc:nearby_parks": (calls) => {
        const from = (calls.find((c) => c.method === "range")?.args[0] ?? 0) as number;
        return { data: full.map((i) => ({ id: `p${from + i}`, name: "P", latitude: 1, longitude: 1, distance_m: 1, features: {} })), error: null };
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await fetchNearbyParks(MANHATTAN);
    expect(rpcCalls).toHaveLength(NEARBY_MAX_PAGES);
  });

  it("propage l'erreur d'une page", async () => {
    const { client } = makeFakeSupabase({ "rpc:nearby_parks": { data: null, error: new Error("timeout") } });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await expect(fetchNearbyParks(MANHATTAN)).rejects.toThrow("timeout");
  });
});
