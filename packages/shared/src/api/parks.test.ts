import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../supabaseClient";
import { createPark, isValidCoordinate, listOrgParkIds, listParks } from "./parks";
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
