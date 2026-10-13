import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../supabaseClient";
import {
  countParksByCreator,
  EXPORT_MAX_ROWS,
  ExportTooLargeError,
  FETCH_BATCH_SIZE,
  getParkCountryDistribution,
  getParkStatusCounts,
  LIST_PARKS_HARD_CAP,
  ListTruncatedError,
  listAllParksForExport,
  listOrgParkIds,
  listParks,
  listParksCapped,
  listParksPage,
  MAX_DEEP_OFFSET,
  parkExistsWithNameAndAddress,
  pickPrimarySource,
} from "./parks";
import { buildCatalog, makeSimulatedSupabase, MAX_ROWS, type SimPark } from "../testUtils/simulatedCatalog";

vi.mock("../supabaseClient", () => ({ getSupabase: vi.fn() }));

// Lot A — comportement à 10 000 / 100 000 / 500 000 parcs SIMULÉS : max_rows (1000) appliqué,
// URL bornée, lots séquentiels, aucun chargement illimité. Aucune base, aucun réseau.
const BIG_ORG = "org-big"; // > 1000 parcs : l'ancien chemin (liste d'ids) cassait ici
const SMALL_ORG = "org-small";

describe.each([10_000, 100_000, 500_000])("listes admin / collectivités — %i parcs simulés", (size) => {
  let catalog: SimPark[];
  let sim: ReturnType<typeof makeSimulatedSupabase>;
  const bigOrgSize = size === 10_000 ? 1_500 : 12_000;

  beforeAll(() => {
    catalog = buildCatalog({ size, orgs: { [BIG_ORG]: bigOrgSize, [SMALL_ORG]: 40 } });
  });
  beforeEach(() => {
    sim = makeSimulatedSupabase(catalog);
    vi.mocked(getSupabase).mockReturnValue(sim.client as never);
  });

  it("page 1 : 25 lignes max, total exact, une seule requête", async () => {
    const res = await listParksPage({ status: ["pending"] });
    const pending = catalog.filter((p) => p.moderation_status === "pending").length;
    expect(res.rows).toHaveLength(25);
    expect(res.total).toBe(pending);
    expect(sim.stats.requests).toBe(1);
    expect(sim.stats.maxRowsReturned).toBeLessThanOrEqual(25);
  });

  it("pages consécutives : aucun doublon ni trou malgré des milliers d'updated_at identiques", async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 6; page++) {
      const res = await listParksPage({ page, pageSize: 25 });
      seen.push(...res.rows.map((r) => r.id));
    }
    expect(seen).toHaveLength(150);
    expect(new Set(seen).size).toBe(150);
    // identique à l'ordre (updated_at desc, id asc) complet
    const expected = [...catalog]
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : a.id < b.id ? -1 : 1))
      .slice(0, 150)
      .map((p) => p.id);
    expect(seen).toEqual(expected);
  });

  it("pages profondes : l'OFFSET ne dépasse jamais MAX_DEEP_OFFSET, la page demandée est ramenée dans la plage", async () => {
    const res = await listParksPage({ page: 999_999 });
    expect(sim.stats.maxOffset).toBeLessThan(MAX_DEEP_OFFSET);
    expect(res.page).toBe(Math.floor(MAX_DEEP_OFFSET / 25));
    expect(res.pageCount).toBeLessThanOrEqual(Math.floor(MAX_DEEP_OFFSET / 25));
    expect(res.truncatedDepth).toBe(res.total > MAX_DEEP_OFFSET);
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it("répartition par pays : exacte, stable, ~2 requêtes par pays (jamais total/1000)", async () => {
    const dist = await getParkCountryDistribution();
    const expected = new Map<string, number>();
    for (const p of catalog) expected.set(p.country_code, (expected.get(p.country_code) ?? 0) + 1);
    expect(dist).toEqual(
      [...expected.entries()]
        .map(([country_code, count]) => ({ country_code, count }))
        .sort((a, b) => b.count - a.count || (a.country_code < b.country_code ? -1 : 1)),
    );
    expect(sim.stats.requests).toBeLessThanOrEqual(2 * expected.size + 1);
    expect(sim.stats.maxRowsReturned).toBeLessThanOrEqual(1);
    expect(sim.stats.maxInFlight).toBeLessThanOrEqual(4);
    expect(await getParkCountryDistribution()).toEqual(dist); // idempotent
  });

  it("compteurs par statut : exacts au-delà de max_rows", async () => {
    const counts = await getParkStatusCounts(["published", "pending"]);
    expect(counts.published! + counts.pending!).toBe(size);
    expect(counts.pending).toBeGreaterThan(MAX_ROWS);
    expect(sim.stats.maxRowsReturned).toBe(0);
  });

  it("collectivité > 1000 parcs : tout est lu par jointure serveur, jamais d'URL id=in(...)", async () => {
    const res = await listParksCapped({ communeId: BIG_ORG });
    expect(res.rows).toHaveLength(Math.min(bigOrgSize, LIST_PARKS_HARD_CAP));
    expect(res.truncated).toBe(bigOrgSize > LIST_PARKS_HARD_CAP);
    expect(new Set(res.rows.map((r) => r.id)).size).toBe(res.rows.length);
    expect(res.rows.every((r) => !("scope_c" in r))).toBe(true); // clés de jointure retirées
    expect(sim.stats.urlTooLong).toBe(0);
    expect(sim.stats.maxRowsReturned).toBeLessThanOrEqual(FETCH_BATCH_SIZE);
    expect(sim.stats.maxInFlight).toBe(1); // séquentiel
    expect(sim.stats.requests).toBeLessThanOrEqual(Math.ceil(Math.min(bigOrgSize, LIST_PARKS_HARD_CAP) / FETCH_BATCH_SIZE) + 1);
  });

  it("plafond dur : une organisation de 12 000 parcs est tronquée ET signalée, pas chargée en entier", async () => {
    if (bigOrgSize <= LIST_PARKS_HARD_CAP) return;
    const res = await listParksCapped({ communeId: BIG_ORG });
    expect(res.rows).toHaveLength(LIST_PARKS_HARD_CAP);
    expect(res.truncated).toBe(true);
  });

  it("listParks : liste complète ou erreur explicite — jamais une liste tronquée présentée comme complète", async () => {
    const rows = await listParks({ communeId: SMALL_ORG });
    expect(rows).toHaveLength(40);
    if (bigOrgSize > LIST_PARKS_HARD_CAP) {
      await expect(listParks({ communeId: BIG_ORG })).rejects.toBeInstanceOf(ListTruncatedError);
    } else {
      expect(await listParks({ communeId: BIG_ORG })).toHaveLength(bigOrgSize);
    }
  });

  it("listOrgParkIds : paginé (keyset), complet au-delà de 1000", async () => {
    const ids = await listOrgParkIds(BIG_ORG);
    expect(ids).toHaveLength(bigOrgSize);
    expect(new Set(ids).size).toBe(bigOrgSize);
    expect(sim.stats.maxRowsReturned).toBeLessThanOrEqual(FETCH_BATCH_SIZE);
  });

  it("export : lots keyset séquentiels, sans doublon, dans l'ordre demandé", async () => {
    const rows = await listAllParksForExport({ communeId: BIG_ORG, sort: "name", order: "asc" });
    const expectedCount = Math.min(bigOrgSize, bigOrgSize); // < EXPORT_MAX_ROWS dans tous les cas
    expect(rows).toHaveLength(expectedCount);
    expect(new Set(rows.map((r) => r.id)).size).toBe(expectedCount);
    expect(sim.stats.maxInFlight).toBe(1);
    expect(sim.stats.maxRowsReturned).toBeLessThanOrEqual(FETCH_BATCH_SIZE);
    expect(sim.stats.maxOffset).toBe(0); // keyset : jamais d'OFFSET
    expect(sim.stats.requests).toBe(Math.ceil(expectedCount / FETCH_BATCH_SIZE));
    const cmp = (a: { name: string; id: string }, b: { name: string; id: string }) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    expect(rows.map((r) => r.id)).toEqual([...rows].sort(cmp).map((r) => r.id));
  });

  it("export trop volumineux : refusé dès le 1er lot, sans charger le reste", async () => {
    if (size <= EXPORT_MAX_ROWS) {
      const all = await listAllParksForExport({ countryCode: "FR" });
      expect(all.length).toBeGreaterThan(0);
      return;
    }
    await expect(listAllParksForExport({})).rejects.toBeInstanceOf(ExportTooLargeError);
    expect(sim.stats.requests).toBe(1);
  });

  it("compteurs par créateur : lots bornés, colonnes minimales", async () => {
    const { counts, complete } = await countParksByCreator();
    const expectedTotal = catalog.filter((p) => p.created_by).length;
    if (complete) {
      let sum = 0;
      for (const n of counts.values()) sum += n;
      expect(sum).toBe(expectedTotal);
    } else {
      expect(expectedTotal).toBeGreaterThanOrEqual(LIST_PARKS_HARD_CAP);
    }
    expect(sim.stats.maxRowsReturned).toBeLessThanOrEqual(FETCH_BATCH_SIZE);
  });

  it("détection de doublon à l'import : exact / homonyme / autre adresse, une requête, même avec des milliers d'homonymes", async () => {
    const target = catalog.find((p) => p.orgs.includes(SMALL_ORG))!;
    expect(await parkExistsWithNameAndAddress(target.name, target.formatted_address!, { communeId: SMALL_ORG })).toBe(true); // doublon exact
    expect(await parkExistsWithNameAndAddress(target.name, "adresse inconnue", { communeId: SMALL_ORG })).toBe(false); // homonyme, autre adresse
    expect(await parkExistsWithNameAndAddress(target.name.toUpperCase(), target.formatted_address!, { communeId: SMALL_ORG })).toBe(false); // casse différente = pas un doublon strict
    expect(sim.stats.maxRowsReturned).toBeLessThanOrEqual(FETCH_BATCH_SIZE);
    expect(sim.stats.urlTooLong).toBe(0);
    // Admin (sans périmètre) : ~size/97 homonymes « Playground N » — la dernière ligne du catalogue est trouvée
    const last = catalog[catalog.length - 1];
    sim.stats.requests = 0;
    expect(await parkExistsWithNameAndAddress(last.name, last.formatted_address!)).toBe(true);
    expect(sim.stats.requests).toBe(1);
  });
});

describe("pickPrimarySource — source d'origine déterministe", () => {
  it("OSM reste l'origine d'un parc enrichi par reverse_geocode, quel que soit l'ordre", () => {
    for (const types of [["reverse_geocode", "osm"], ["osm", "reverse_geocode"]]) {
      expect(pickPrimarySource(types)).toEqual({ source: "osm", enrichments: ["reverse_geocode"] });
    }
  });
  it("priorité d'origine : toboggo > municipality > open_data > partner > osm > user > other", () => {
    expect(pickPrimarySource(["osm", "municipality", "user"]).source).toBe("municipality");
    expect(pickPrimarySource(["other", "user"]).source).toBe("user");
    expect(pickPrimarySource(["osm", "toboggo"]).source).toBe("toboggo");
  });
  it("enrichissement seul : pas d'origine inventée", () => {
    expect(pickPrimarySource(["reverse_geocode"])).toEqual({ source: null, enrichments: ["reverse_geocode"] });
    expect(pickPrimarySource([])).toEqual({ source: null, enrichments: [] });
  });
});
