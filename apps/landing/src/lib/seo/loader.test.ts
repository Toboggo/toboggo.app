import { describe, expect, it, vi } from "vitest";
import { fetchAllRows, fetchSnapshot, mapRow, parseContentRange, PARKS_PATH, SeoLoadError } from "./loader";

const config = { url: "https://x.supabase.co", anonKey: "k" };

/** Simule PostgREST : respecte Range, plafonne les pages (max-rows) et renvoie content-range. */
function postgrest(rows: unknown[], options: { cap?: number; omitRange?: boolean; lieTotal?: number; truncateBy?: number; shiftStart?: boolean; status?: number; changeTotalAfter?: number } = {}) {
  let call = 0;
  const mock = vi.fn(async (_url: string, init?: RequestInit) => {
    call += 1;
    if (options.status) return new Response("{}", { status: options.status });
    const range = String((init?.headers as Record<string, string>).Range);
    const [from, to] = range.split("-").map(Number);
    const cap = options.cap ?? Infinity;
    const end = Math.min(to, from + cap - 1, rows.length - 1);
    const slice = from > end ? [] : rows.slice(from, end + 1);
    const total = options.changeTotalAfter !== undefined && call > options.changeTotalAfter ? rows.length + 1 : options.lieTotal ?? rows.length;
    const cr = rows.length === 0 ? `*/${total}` : `${options.shiftStart ? from + 1 : from}-${end}/${total}`;
    const body = options.truncateBy ? slice.slice(0, Math.max(slice.length - options.truncateBy, 0)) : slice;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (!options.omitRange) headers["content-range"] = cr;
    return new Response(JSON.stringify(body), { status: 206, headers });
  });
  return mock as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));
const PATH = "t?select=id&order=id.asc";

describe("parseContentRange", () => {
  it("parses ranges, empty results and rejects garbage", () => {
    expect(parseContentRange("0-999/2202")).toEqual({ start: 0, end: 999, total: 2202 });
    expect(parseContentRange("*/0")).toEqual({ start: 0, end: -1, total: 0 });
    expect(parseContentRange("0-9/*")).toBeNull();
    expect(parseContentRange(null)).toBeNull();
    expect(parseContentRange("n'importe quoi")).toBeNull();
  });
});

describe("fetchAllRows — pagination", () => {
  it("walks every page with Range and returns all rows (2 202 rows, 1 000 per page)", async () => {
    const f = postgrest(rowsOf(2202));
    const r = await fetchAllRows<{ id: string }>(config, PATH, { label: "t", fetchImpl: f });
    expect(r.rows).toHaveLength(2202);
    expect(r.requests).toBe(3);
    expect(r.rows[2201].id).toBe("2201");
    const ranges = f.mock.calls.map((c: unknown[]) => (c[1] as RequestInit).headers as Record<string, string>).map((h: Record<string, string>) => h.Range);
    expect(ranges).toEqual(["0-999", "1000-1999", "2000-2999"]);
  });

  it("follows a server-side cap smaller than the page size", async () => {
    const r = await fetchAllRows<{ id: string }>(config, PATH, { label: "t", fetchImpl: postgrest(rowsOf(25), { cap: 10 }), pageSize: 1000 });
    expect(r.rows).toHaveLength(25);
    expect(r.requests).toBe(3);
  });

  it("only issues GET requests with count=exact and the anon key", async () => {
    const f = postgrest(rowsOf(3));
    await fetchAllRows(config, PATH, { label: "t", fetchImpl: f });
    for (const call of f.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.method).toBe("GET");
      expect((init.headers as Record<string, string>).Prefer).toBe("count=exact");
      expect(init.body).toBeUndefined();
    }
  });

  it("accepts an empty result when no minimum is required", async () => {
    const r = await fetchAllRows(config, PATH, { label: "t", fetchImpl: postgrest([]) });
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(0);
  });
});

describe("fetchAllRows — the build must fail on suspicious data", () => {
  const fail = (f: typeof fetch, extra = {}) => fetchAllRows(config, PATH, { label: "t", fetchImpl: f, ...extra });

  it("fails without a stable order=", async () => {
    await expect(fetchAllRows(config, "t?select=id", { label: "t", fetchImpl: postgrest(rowsOf(3)) })).rejects.toThrow(/order=/);
  });

  it("fails on an HTTP error", async () => {
    await expect(fail(postgrest(rowsOf(3), { status: 500 }))).rejects.toThrow(/HTTP 500/);
  });

  it("fails when content-range is missing (cannot prove completeness)", async () => {
    await expect(fail(postgrest(rowsOf(3), { omitRange: true }))).rejects.toThrow(/content-range/);
  });

  it("fails on a truncated page", async () => {
    await expect(fail(postgrest(rowsOf(10), { truncateBy: 2 }))).rejects.toThrow(/tronquée/);
  });

  it("fails when the total changes during pagination", async () => {
    await expect(fail(postgrest(rowsOf(25), { cap: 10, changeTotalAfter: 1 }))).rejects.toThrow(/total a changé/);
  });

  it("fails on a shifted page", async () => {
    await expect(fail(postgrest(rowsOf(10), { shiftStart: true }))).rejects.toThrow(/décalée/);
  });

  it("fails when the announced total is larger than the rows returned", async () => {
    await expect(fail(postgrest(rowsOf(10), { lieTotal: 50 }))).rejects.toBeInstanceOf(SeoLoadError);
  });

  it("fails below the minimum expected row count (empty API / broken RLS)", async () => {
    await expect(fail(postgrest(rowsOf(5)), { minRows: 100 })).rejects.toThrow(/minimum attendu/);
    await expect(fail(postgrest([]), { minRows: 1 })).rejects.toThrow(/minimum attendu/);
  });

  it("fails above the maximum plausible row count", async () => {
    await expect(fail(postgrest(rowsOf(20)), { maxRows: 10 })).rejects.toThrow(/maximum plausible/);
  });

  it("fails on an invalid JSON body (e.g. an HTML 502 page)", async () => {
    const f = vi.fn(async () => new Response("<html>502 Bad Gateway</html>", { status: 206, headers: { "content-range": "0-9/10" } })) as unknown as typeof fetch;
    await expect(fail(f)).rejects.toBeInstanceOf(SeoLoadError);
    await expect(fail(f)).rejects.toThrow(/JSON invalide/);
  });

  it("fails when the body is valid JSON but not an array", async () => {
    const f = vi.fn(async () => new Response('{"message":"boom"}', { status: 206, headers: { "content-range": "0-9/10" } })) as unknown as typeof fetch;
    await expect(fail(f)).rejects.toThrow(/tableau attendu/);
  });

  it("fails when the server ignores Range and keeps returning the first page", async () => {
    // 25 lignes, pages de 10 : un serveur qui ignore Range renvoie toujours 0-9/25.
    const rows = rowsOf(25);
    const ignoringRange = vi.fn(async () => new Response(JSON.stringify(rows.slice(0, 10)), { status: 206, headers: { "content-range": "0-9/25" } })) as unknown as typeof fetch;
    await expect(fail(ignoringRange, { pageSize: 10 })).rejects.toThrow(/décalée \(attendu 10, reçu 0\)/);
  });

  it("fails — with an explicit message — when the API is unreachable or too slow", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(fail(down)).rejects.toBeInstanceOf(SeoLoadError);
    await expect(fail(down)).rejects.toThrow(/API injoignable ou trop lente \(fetch failed\)/);
    const timeout = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as unknown as typeof fetch;
    await expect(fail(timeout)).rejects.toThrow(/injoignable ou trop lente/);
  });

  it("never returns partial rows: a failure on a later page rejects the whole load", async () => {
    let call = 0;
    const flaky = vi.fn(async (_u: string, init?: RequestInit) => {
      call += 1;
      if (call === 2) return new Response("{}", { status: 503 });
      const [from, to] = String((init?.headers as Record<string, string>).Range).split("-").map(Number);
      const slice = rowsOf(25).slice(from, to + 1);
      return new Response(JSON.stringify(slice), { status: 206, headers: { "content-range": `${from}-${from + slice.length - 1}/25` } });
    }) as unknown as typeof fetch;
    await expect(fail(flaky, { pageSize: 10 })).rejects.toThrow(/HTTP 503/);
  });
});

describe("fetchSnapshot", () => {
  function router(parks: unknown[], links: unknown[], orgs: unknown[]) {
    const tables: Record<string, unknown[]> = { park_public: parks, organization_parks: links, organizations: orgs };
    return vi.fn(async (url: string, init?: RequestInit) => {
      const table = new URL(url).pathname.split("/").pop() as string;
      const rows = tables[table];
      const [from, to] = String((init?.headers as Record<string, string>).Range).split("-").map(Number);
      const slice = rows.slice(from, to + 1);
      return new Response(JSON.stringify(slice), { status: 206, headers: { "content-range": rows.length ? `${from}-${from + slice.length - 1}/${rows.length}` : "*/0" } });
    }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  }
  const row = (id: string) => ({ id, name: "P", slug: null, city: "Millau", admin_area_2: "Aveyron", postal_code: "12100", address_line: "x", latitude: "44.1", longitude: 3.07, min_age: 1, max_age: 12, features: null, verification_status: "unverified", last_verified_at: null });

  it("flags only parks linked to a verified municipality, never loads photos", async () => {
    const f = router([row("a"), row("b")], [{ park_id: "a", organization_id: "o1" }, { park_id: "b", organization_id: "o2" }], [{ id: "o1" }]);
    const snap = await fetchSnapshot(config, { fetchImpl: f, minParks: 1 });
    expect(snap.parks.find((p) => p.id === "a")?.collectivityVerified).toBe(true);
    expect(snap.parks.find((p) => p.id === "b")?.collectivityVerified).toBe(false);
    expect(snap.parks.every((p) => p.photos.length === 0)).toBe(true);
    expect(snap.parks[0].latitude).toBe(44.1);
    expect(snap.stats).toMatchObject({ parkRows: 2, verifiedLinks: 2, verifiedOrgs: 1, requests: 3 });
    for (const call of f.mock.calls) expect((call[1] as RequestInit).method).toBe("GET");
  });

  it("fails on duplicate park ids", async () => {
    await expect(fetchSnapshot(config, { fetchImpl: router([row("a"), row("a")], [], []), minParks: 1 })).rejects.toThrow(/double/);
  });

  it("requests only published, active French parks in a stable order", () => {
    const q = new URLSearchParams(PARKS_PATH.split("?")[1]);
    expect(q.get("moderation_status")).toBe("eq.published");
    expect(q.get("operational_status")).toBe("eq.active");
    expect(q.get("country_code")).toBe("eq.FR");
    expect(q.get("order")).toBe("id.asc");
  });

  it("mapRow tolerates missing values", () => {
    expect(mapRow({ ...row("z"), latitude: null, longitude: "abc" })).toMatchObject({ latitude: null, longitude: null, features: {} });
  });
});
