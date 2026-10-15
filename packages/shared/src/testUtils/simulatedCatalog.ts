/**
 * Simulateur PostgREST minimal pour tester les listes/exports à 10 000 / 100 000 / 500 000
 * parcs SANS base : applique `max_rows` (1000), une limite de longueur d'URL, `count: exact`,
 * `head`, `eq` / `in` / `gt` / `not is null` / `ilike` / `order` / `limit` / `range` / `or` keyset,
 * les jointures `scope_c` / `scope_o` (organization_parks) et `src_filter` (park_sources).
 * Compte les requêtes, les lignes max renvoyées et la concurrence maximale observée.
 * Pas un fichier de test (non collecté par vitest).
 */
export interface SimPark {
  id: string;
  name: string;
  country_code: string;
  moderation_status: "published" | "pending";
  status: "published" | "pending";
  verification_status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  formatted_address: string | null;
  photos: string[];
  sources: string[];
  orgs: string[];
}

export const MAX_ROWS = 1000;
export const MAX_URL_LENGTH = 8000;

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const iso = (n: number) => `2026-01-01T00:00:00.${pad(n % 1_000_000, 6)}+00:00`;

export interface CatalogOptions {
  size: number;
  /** { orgId: nombre de parcs } — les premiers parcs reçoivent ces rattachements. */
  orgs?: Record<string, number>;
}

export function buildCatalog({ size, orgs = {} }: CatalogOptions): SimPark[] {
  const rows: SimPark[] = new Array(size);
  const orgEntries = Object.entries(orgs);
  const orgOf = new Map<number, string>();
  let cursor = 0;
  for (const [org, n] of orgEntries) for (let i = 0; i < n && cursor < size; i++) orgOf.set(cursor++, org);
  for (let i = 0; i < size; i++) {
    const us = i % 4 !== 3; // 75 % US (pending), le reste FR/ES publié
    const country = us ? "US" : i % 8 === 3 ? "FR" : "ES";
    const status = us ? "pending" : "published";
    rows[i] = {
      id: `00000000-0000-4000-8000-${pad(i, 12)}`,
      name: `Playground ${i % 97}`,
      country_code: country,
      moderation_status: status,
      status,
      verification_status: "unverified",
      created_by: i % 500 === 0 ? `user-${(i / 500) % 40}` : null,
      // beaucoup d'égalités d'`updated_at` (import en masse) : le départage par id est indispensable
      created_at: iso(i >> 2),
      updated_at: iso(i >> 3),
      formatted_address: `${i} Main St`,
      photos: [],
      sources: i % 3 === 0 ? ["reverse_geocode", "osm"] : ["osm"],
      orgs: orgOf.has(i) ? [orgOf.get(i)!] : [],
    };
  }
  return rows;
}

export interface SimStats {
  requests: number;
  byTable: Record<string, number>;
  maxRowsReturned: number;
  maxInFlight: number;
  inFlight: number;
  maxOffset: number;
  urlTooLong: number;
}

type Call = { method: string; args: unknown[] };

export function makeSimulatedSupabase(catalog: SimPark[]) {
  const stats: SimStats = { requests: 0, byTable: {}, maxRowsReturned: 0, maxInFlight: 0, inFlight: 0, maxOffset: 0, urlTooLong: 0 };
  const sortCache = new Map<string, SimPark[]>();

  function sorted(orders: { col: string; asc: boolean }[]): SimPark[] {
    const key = orders.map((o) => `${o.col}:${o.asc}`).join(",");
    let hit = sortCache.get(key);
    if (!hit) {
      hit = [...catalog].sort((a, b) => {
        for (const { col, asc } of orders) {
          const av = (a as never)[col] as string;
          const bv = (b as never)[col] as string;
          if (av !== bv) return (av < bv ? -1 : 1) * (asc ? 1 : -1);
        }
        return 0;
      });
      sortCache.set(key, hit);
    }
    return hit;
  }

  class SimQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number }> {
    calls: Call[] = [];
    constructor(private table: string) {}
    private rec(method: string, args: unknown[]) {
      this.calls.push({ method, args });
      return this;
    }
    select(...a: unknown[]) { return this.rec("select", a); }
    eq(...a: unknown[]) { return this.rec("eq", a); }
    in(...a: unknown[]) { return this.rec("in", a); }
    gt(...a: unknown[]) { return this.rec("gt", a); }
    lt(...a: unknown[]) { return this.rec("lt", a); }
    not(...a: unknown[]) { return this.rec("not", a); }
    ilike(...a: unknown[]) { return this.rec("ilike", a); }
    or(...a: unknown[]) { return this.rec("or", a); }
    order(...a: unknown[]) { return this.rec("order", a); }
    limit(...a: unknown[]) { return this.rec("limit", a); }
    range(...a: unknown[]) { return this.rec("range", a); }

    private run(): { data: unknown; error: unknown; count?: number } {
      stats.requests++;
      stats.byTable[this.table] = (stats.byTable[this.table] ?? 0) + 1;
      const url = JSON.stringify(this.calls);
      if (url.length > MAX_URL_LENGTH) {
        stats.urlTooLong++;
        return { data: null, error: { message: "URI too long" } };
      }
      const get = (m: string) => this.calls.filter((c) => c.method === m).map((c) => c.args);
      const selectArgs = get("select")[0] ?? [];
      const opts = (selectArgs[1] ?? {}) as { count?: string; head?: boolean };

      if (this.table === "organization_parks") {
        const org = get("eq").find(([c]) => c === "organization_id")?.[1] as string;
        const last = get("gt").find(([c]) => c === "park_id")?.[1] as string | undefined;
        const ids = catalog.filter((p) => p.orgs.includes(org)).map((p) => p.id).sort();
        const out = ids.filter((id) => !last || id > last).slice(0, Math.min(MAX_ROWS, (get("limit")[0]?.[0] as number) ?? MAX_ROWS));
        stats.maxRowsReturned = Math.max(stats.maxRowsReturned, out.length);
        return { data: out.map((park_id) => ({ park_id })), error: null, count: ids.length };
      }
      if (this.table !== "park_public") return { data: [], error: null };

      const orders = get("order").map(([col, o]) => ({ col: col as string, asc: (o as { ascending?: boolean })?.ascending !== false }));
      let rows: SimPark[] = orders.length ? sorted(orders) : catalog;
      for (const [col, val] of get("eq")) {
        const v = val as string;
        if (col === "scope_c.organization_id" || col === "scope_o.organization_id") rows = rows.filter((p) => p.orgs.includes(v));
        else rows = rows.filter((p) => String((p as never)[col as string]) === v);
      }
      for (const [col, list] of get("in")) {
        const vals = list as string[];
        if (col === "src_filter.source_type") rows = rows.filter((p) => p.sources.some((s) => vals.includes(s) && s !== "reverse_geocode"));
        else rows = rows.filter((p) => vals.includes(String((p as never)[col as string])));
      }
      for (const [col, val] of get("gt")) rows = rows.filter((p) => String((p as never)[col as string]) > (val as string));
      for (const [col, op] of get("not")) if (op === "is") rows = rows.filter((p) => (p as never)[col as string] != null);
      for (const [, pat] of get("ilike")) {
        const needle = String(pat).replace(/^%|%$/g, "").replace(/\\([\\%_])/g, "$1").toLowerCase();
        const substring = String(pat).startsWith("%");
        rows = rows.filter((p) => (substring ? p.name.toLowerCase().includes(needle) : p.name.toLowerCase() === needle));
      }
      for (const [expr] of get("or")) {
        const m = /^(\w+)\.(gt|lt)\."(.*?)",and\(\w+\.eq\."(.*?)",id\.gt\."(.*?)"\)\)?$/.exec(String(expr));
        if (!m) throw new Error(`or() non géré par le simulateur : ${expr}`);
        const [, col, op, v, v2, lastId] = m;
        rows = rows.filter((p) => {
          const x = (p as never)[col] as string;
          return (op === "gt" ? x > v : x < v) || (x === v2 && p.id > lastId);
        });
      }
      const total = rows.length;
      if (opts.head) return { data: null, error: null, count: total };
      let from = 0;
      let to = rows.length - 1;
      const range = get("range")[0];
      if (range) { from = range[0] as number; to = range[1] as number; }
      stats.maxOffset = Math.max(stats.maxOffset, from);
      const lim = get("limit")[0]?.[0] as number | undefined;
      if (lim !== undefined) to = Math.min(to, from + lim - 1);
      to = Math.min(to, from + MAX_ROWS - 1); // max_rows PostgREST
      const slice = rows.slice(from, to + 1);
      stats.maxRowsReturned = Math.max(stats.maxRowsReturned, slice.length);
      const data = slice.map((p) => ({ ...p, park_sources: p.sources.map((source_type) => ({ source_type })) }));
      return { data, error: null, count: opts.count === "exact" ? total : undefined };
    }

    then<R1, R2 = never>(
      onfulfilled?: ((v: { data: unknown; error: unknown; count?: number }) => R1 | PromiseLike<R1>) | null,
      onrejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
    ): PromiseLike<R1 | R2> {
      stats.inFlight++;
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
      // asynchrone : deux requêtes lancées « en parallèle » se chevauchent réellement
      const p = new Promise<{ data: unknown; error: unknown; count?: number }>((resolve) => {
        setTimeout(() => {
          stats.inFlight--;
          resolve(this.run());
        }, 0);
      });
      return p.then(onfulfilled, onrejected);
    }
  }

  const client = { from: (table: string) => new SimQuery(table) };
  return { client, stats };
}
