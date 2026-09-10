import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../supabaseClient";
import {
  assertValidAgeRange,
  createPark,
  isValidCoordinate,
  listOrgParkIds,
  listParks,
  listParksPage,
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
