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

  it("scopes to a commune with a server-side join (no id list) and applies status + verification filters", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [{ id: "park-1" }], error: null, count: 1 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage({
      communeId: "org-1",
      status: ["published"],
      verification: ["organization_verified"],
    });

    const q = queriesByTable["park_public"][0];
    expect(queriesByTable["organization_parks"]).toBeUndefined();
    expect(calls(q, "select")[0][0]).toContain("scope_c:organization_parks!inner(organization_id)");
    expect(calls(q, "eq")).toContainEqual(["scope_c.organization_id", "org-1"]);
    expect(calls(q, "in").some(([col]) => col === "id")).toBe(false);
    expect(calls(q, "in")).toContainEqual(["moderation_status", ["published"]]);
    expect(calls(q, "in")).toContainEqual(["verification_status", ["organization_verified"]]);
  });

  it("a commune with zero linked parks sees zero rows — the inner join, never everything", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [], error: null, count: 0 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const res = await listParksPage({ communeId: "org-empty" });

    expect(res.total).toBe(0);
    const q = queriesByTable["park_public"][0];
    expect(calls(q, "select")[0][0]).toContain("organization_parks!inner");
    expect(calls(q, "eq")).toContainEqual(["scope_c.organization_id", "org-empty"]);
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

  it("filters by source_type via a dedicated inner join (alias), keeping the display embed intact", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [{ id: "p1", park_sources: [{ source_type: "osm" }] }], error: null, count: 1 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage({ sourceTypes: ["osm"] });

    expect(queriesByTable["park_sources"]).toBeUndefined();
    const selectArgs = calls(queriesByTable["park_public"][0], "select")[0];
    expect(selectArgs[0]).toContain("park_sources(source_type)");
    expect(selectArgs[0]).toContain("src_filter:park_sources!inner(source_type)");
    expect(calls(queriesByTable["park_public"][0], "in")).toContainEqual(["src_filter.source_type", ["osm"]]);
    expect(calls(queriesByTable["park_public"][0], "in").some(([col]) => col === "id")).toBe(false);
  });

  it("combines the source filter (join) with the commune scope (join) — both apply server-side", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [{ id: "p1", park_sources: [{ source_type: "osm" }] }], error: null, count: 1 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage({ communeId: "org-1", sourceTypes: ["osm"] });

    const q = queriesByTable["park_public"][0];
    expect(calls(q, "in")).toContainEqual(["src_filter.source_type", ["osm"]]);
    expect(calls(q, "eq")).toContainEqual(["scope_c.organization_id", "org-1"]);
    expect(calls(q, "in").some(([col]) => col === "id")).toBe(false);
  });

  it("filters by organizationId with its own join alias — distinct from the commune-scope communeId", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      park_public: { data: [{ id: "p9" }], error: null, count: 1 },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await listParksPage({ organizationId: "org-9" });
    await listParksPage({ communeId: "org-1", organizationId: "org-9" });

    expect(calls(queriesByTable["park_public"][0], "eq")).toContainEqual(["scope_o.organization_id", "org-9"]);
    const both = calls(queriesByTable["park_public"][1], "eq");
    expect(both).toContainEqual(["scope_c.organization_id", "org-1"]);
    expect(both).toContainEqual(["scope_o.organization_id", "org-9"]);
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

describe("listParkSourcesByIds", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it("returns an empty map without querying when given no ids", async () => {
    const { client, queriesByTable } = makeFakeSupabase({});
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const map = await listParkSourcesByIds([]);

    expect(map.size).toBe(0);
    expect(queriesByTable["park_sources"]).toBeUndefined();
  });

  it("picks the highest-priority ORIGIN deterministically, whatever the row order (reverse_geocode is never the origin)", async () => {
    const { client } = makeFakeSupabase({
      park_sources: {
        data: [
          { park_id: "p1", source_type: "reverse_geocode" },
          { park_id: "p1", source_type: "osm" },
          { park_id: "p1", source_type: "municipality" },
          { park_id: "p2", source_type: "reverse_geocode" },
        ],
        error: null,
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const map = await listParkSourcesByIds(["p1"]);

    expect(map.get("p1")).toBe("municipality");
    // enrichment only → shown as-is rather than hidden
    expect((await listParkSourcesByIds(["p2"])).get("p2")).toBeUndefined();
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
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await fetchNearbyParks(MANHATTAN);
    expect(rpcCalls).toHaveLength(NEARBY_MAX_PAGES);
    // jamais silencieux : le plafond est signalé, avec la distance jusqu'où le résultat est complet
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/plafond de 8 pages/);
    warn.mockRestore();
  });

  it("pas d'avertissement tant que le rayon est épuisé avant le plafond", async () => {
    paged(1483);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await fetchNearbyParks(MANHATTAN);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("propage l'erreur d'une page", async () => {
    const { client } = makeFakeSupabase({ "rpc:nearby_parks": { data: null, error: new Error("timeout") } });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await expect(fetchNearbyParks(MANHATTAN)).rejects.toThrow("timeout");
  });
});
