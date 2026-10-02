import { describe, expect, it } from "vitest";
import type { Park, ParkEdit } from "@toboggo/shared";
import {
  NO_FILTERS,
  buildParkRows,
  filterParkRows,
  hasActiveFilters,
  normalizeText,
  paginate,
  sortParkRows,
  summarizeParks,
} from "./communeParks";

const park = (over: Partial<Park> = {}): Park =>
  ({
    id: "p",
    name: "Parc",
    status: "published",
    address_line: null,
    formatted_address: null,
    postal_code: null,
    city: null,
    min_age: null,
    max_age: null,
    description: null,
    cover_photo: null,
    photos: [],
    features: {},
    has_open_report: false,
    updated_at: "2026-09-30T10:00:00Z",
    ...over,
  }) as Park;

const edit = (park_id: string | null): ParkEdit => ({ id: `e-${Math.random()}`, park_id, status: "pending", changes: {} }) as ParkEdit;

const parks = [
  park({ id: "a", name: "Génin/Pont", min_age: 2, max_age: 8, has_open_report: true, updated_at: "2026-09-01T00:00:00Z" }),
  park({ id: "b", name: "Jardin des Abruzzes", city: "Lyon", status: "pending", updated_at: "2026-09-20T00:00:00Z" }),
  park({
    id: "c",
    name: "Square Lafont",
    address_line: "1 rue X",
    min_age: 0,
    max_age: 6,
    description: "d",
    photos: ["u"],
    cover_photo: "u",
    features: { slide: { status: "available", value: null, quantity: null, category: "play", verified_at: null } },
    updated_at: "2026-09-10T00:00:00Z",
  }),
];
const rows = buildParkRows(parks, [edit("b"), edit("b"), edit("zzz-other-org"), edit(null)]);

describe("buildParkRows / summarizeParks", () => {
  it("derives completeness, open report and per-park pending edits from real fields", () => {
    expect(rows.map((r) => r.completeness.filled)).toEqual([1, 0, 5]);
    expect(rows.map((r) => r.openReport)).toEqual([true, false, false]);
    expect(rows.map((r) => r.pendingEdits)).toEqual([0, 2, 0]);
  });

  it("summarises totals without inventing anything", () => {
    expect(summarizeParks(rows)).toEqual({
      total: 3,
      published: 2,
      withOpenReport: 1,
      incomplete: 2,
      missingTotal: 4 + 5,
      pendingEdits: 2,
      parksWithEdits: 1,
    });
  });

  it("0 parks → all zeros", () => {
    expect(summarizeParks([])).toMatchObject({ total: 0, published: 0, incomplete: 0, pendingEdits: 0 });
  });
});

describe("filterParkRows", () => {
  it("no filter keeps everything", () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(filterParkRows(rows, NO_FILTERS)).toHaveLength(3);
  });

  it("searches name, city and address, accent-insensitively", () => {
    expect(filterParkRows(rows, { ...NO_FILTERS, q: "genin" }).map((r) => r.park.id)).toEqual(["a"]);
    expect(filterParkRows(rows, { ...NO_FILTERS, q: "LYON" }).map((r) => r.park.id)).toEqual(["b"]);
    expect(filterParkRows(rows, { ...NO_FILTERS, q: "rue x" }).map((r) => r.park.id)).toEqual(["c"]);
    expect(normalizeText("Génin")).toBe("genin");
  });

  it("combines status and the three attention filters (AND)", () => {
    expect(filterParkRows(rows, { ...NO_FILTERS, status: "pending" }).map((r) => r.park.id)).toEqual(["b"]);
    expect(filterParkRows(rows, { ...NO_FILTERS, report: true }).map((r) => r.park.id)).toEqual(["a"]);
    expect(filterParkRows(rows, { ...NO_FILTERS, incomplete: true }).map((r) => r.park.id)).toEqual(["a", "b"]);
    expect(filterParkRows(rows, { ...NO_FILTERS, edits: true }).map((r) => r.park.id)).toEqual(["b"]);
    expect(filterParkRows(rows, { ...NO_FILTERS, incomplete: true, report: true }).map((r) => r.park.id)).toEqual(["a"]);
  });
});

describe("sortParkRows / paginate", () => {
  it("sorts by name (accent-aware) and by date, both directions, without mutating", () => {
    expect(sortParkRows(rows, "name", "asc").map((r) => r.park.id)).toEqual(["a", "b", "c"]);
    expect(sortParkRows(rows, "updated_at", "desc").map((r) => r.park.id)).toEqual(["b", "c", "a"]);
    expect(rows.map((r) => r.park.id)).toEqual(["a", "b", "c"]);
  });

  it("paginates and clamps the page", () => {
    const many = Array.from({ length: 60 }, (_, i) => i);
    expect(paginate(many, 1).items).toHaveLength(25);
    expect(paginate(many, 3)).toMatchObject({ page: 3, pageCount: 3 });
    expect(paginate(many, 99).page).toBe(3);
    expect(paginate([], 1)).toEqual({ items: [], page: 1, pageCount: 1 });
  });
});
