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

describe("updatePark — ages (Lot 3C.1 — clearable NULL)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  function setup() {
    const { client, queriesByTable } = makeFakeSupabase({
      parks: { data: null, error: null },
      park_public: { data: { id: "p1" }, error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    return queriesByTable;
  }
  function updateRow(q: ReturnType<typeof setup>) {
    return q["parks"]?.[0].calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown> | undefined;
  }

  it("age key absent → the column is not written at all", async () => {
    const q = setup();
    await updatePark("p1", { description: "x" });
    const row = updateRow(q)!;
    expect("min_age" in row).toBe(false);
    expect("max_age" in row).toBe(false);
    expect("ages_derived" in row).toBe(false);
  });

  it("age present with null → writes NULL (explicit clear) + ages_derived=false", async () => {
    const q = setup();
    await updatePark("p1", { age_min: null, age_max: null });
    const row = updateRow(q)!;
    expect(row.min_age).toBeNull();
    expect(row.max_age).toBeNull();
    expect(row.ages_derived).toBe(false);
  });

  it("age present with a number → sets it", async () => {
    const q = setup();
    await updatePark("p1", { age_min: 2, age_max: 10 });
    const row = updateRow(q)!;
    expect(row.min_age).toBe(2);
    expect(row.max_age).toBe(10);
    expect(row.ages_derived).toBe(false);
  });

  it("clears only one bound, leaves the other key untouched", async () => {
    const q = setup();
    await updatePark("p1", { age_max: null });
    const row = updateRow(q)!;
    expect(row.max_age).toBeNull();
    expect("min_age" in row).toBe(false);
  });

  it("min > max (both numbers) → refused before any write", async () => {
    setup();
    await expect(updatePark("p1", { age_min: 10, age_max: 3 })).rejects.toThrow(/âge/i);
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

describe("updatePark — structured address (Lot 3C.1)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  function run(patch: Record<string, unknown>) {
    const { client, queriesByTable } = makeFakeSupabase({
      parks: { data: null, error: null },
      park_public: { data: { id: "p1" }, error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    return updatePark("p1", patch as never).then(() => {
      return queriesByTable["parks"]?.[0].calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>;
    });
  }

  it("writes address_line / postal_code / city straight to the canonical columns", async () => {
    const row = await run({ address_line: "12 rue des Écoles", postal_code: "12100", city: "Millau" });
    expect(row.address_line).toBe("12 rue des Écoles");
    expect(row.postal_code).toBe("12100");
    expect(row.city).toBe("Millau");
    // never writes the view-derived / V1-trigger-managed column
    expect("formatted_address" in row).toBe(false);
  });

  it("present + null clears a structured field", async () => {
    const row = await run({ postal_code: null, city: null });
    expect(row.postal_code).toBeNull();
    expect(row.city).toBeNull();
  });

  it("legacy formatted_address still falls back to address_line", async () => {
    const row = await run({ formatted_address: "1 place du Centre, 12100 Millau" });
    expect(row.address_line).toBe("1 place du Centre, 12100 Millau");
  });

  it("a structured address_line wins over a legacy formatted_address in the same patch", async () => {
    const row = await run({ address_line: "5 rue A", formatted_address: "ignored" });
    expect(row.address_line).toBe("5 rue A");
  });
});

describe("updatePark — coordinate validation (Lot 3C.1)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  function setup() {
    const { client, queriesByTable } = makeFakeSupabase({
      parks: { data: null, error: null },
      park_public: { data: { id: "p1" }, error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    return queriesByTable;
  }

  it("a valid position update passes and is written", async () => {
    const q = setup();
    await updatePark("p1", { latitude: 44.1, longitude: 3.07 });
    const row = q["parks"]?.[0].calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>;
    expect(row.latitude).toBe(44.1);
    expect(row.longitude).toBe(3.07);
  });

  it("out-of-range coordinates are refused", async () => {
    setup();
    await expect(updatePark("p1", { latitude: 999, longitude: 3.07 })).rejects.toThrow(/coordonn/i);
  });

  it("(0,0) is refused on update too", async () => {
    setup();
    await expect(updatePark("p1", { latitude: 0, longitude: 0 })).rejects.toThrow(/coordonn/i);
  });

  it("moving only one bound is refused (pair must move together)", async () => {
    setup();
    await expect(updatePark("p1", { latitude: 44.1 })).rejects.toThrow(/ensemble/i);
    await expect(updatePark("p1", { longitude: 3.07 })).rejects.toThrow(/ensemble/i);
  });

  it("an update that does not touch coordinates is unaffected", async () => {
    const q = setup();
    await updatePark("p1", { description: "nouvelle description" });
    const row = q["parks"]?.[0].calls.find((c) => c.method === "update")?.args[0] as Record<string, unknown>;
    expect("latitude" in row).toBe(false);
    expect("longitude" in row).toBe(false);
    expect(row.description).toBe("nouvelle description");
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
