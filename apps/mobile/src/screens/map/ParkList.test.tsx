import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Park } from "@toboggo/shared";
import "../../i18n/testInit";
import { ParkList, resetZeroResultsDedupe } from "./ParkList";
import { trackEvent } from "../../lib/analytics";

const world = vi.hoisted(() => ({ childAges: [] as number[] }));

vi.mock("../../lib/children", () => ({ useChildAges: () => world.childAges, useChildren: () => ({ data: [] }) }));
vi.mock("../../lib/session", () => ({
  useSession: (sel?: (s: unknown) => unknown) => {
    const s = { userId: null, profile: { favorites: [] } };
    return sel ? sel(s) : s;
  },
}));
vi.mock("../../lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/analytics")>();
  return { ...actual, trackEvent: vi.fn() };
});

const park = (id: string, ageMin: number | null, ageMax: number | null) =>
  ({ id, name: id, photos: [], rating: 0, review_count: 0, age_min: ageMin, age_max: ageMax, distance_m: 100, created_at: "" }) as unknown as Park & { distance_m: number };

const zeroCalls = () => vi.mocked(trackEvent).mock.calls.filter(([n]) => n === "zero_results");

function mount(parks: ReturnType<typeof park>[], forChildren = true) {
  return render(
    <MemoryRouter>
      <ParkList parks={parks} onToggleFavorite={vi.fn()} forChildren={forChildren} setForChildren={vi.fn()} />
    </MemoryRouter>,
  );
}

// "Pour mes enfants" empties the list: ages 10 vs a park for 0–3.
const NO_MATCH = [park("a", 0, 3)];

beforeEach(() => {
  resetZeroResultsDedupe();
  vi.mocked(trackEvent).mockClear();
  world.childAges = [10];
});

describe("ParkList — zero_results / children_age_no_match", () => {
  it("fires once when the age filter empties the list", () => {
    mount(NO_MATCH);
    expect(zeroCalls()).toEqual([["zero_results", { reason: "children_age_no_match" }]]);
  });

  it("does not fire again when ParkList merely remounts (medium → top) with the same inputs", () => {
    mount(NO_MATCH).unmount();
    mount(NO_MATCH).unmount();
    mount(NO_MATCH);
    expect(zeroCalls()).toHaveLength(1);
  });

  it("fires again after a real change of search (different parks), still empty", () => {
    mount(NO_MATCH).unmount();
    mount([park("b", 0, 3), park("c", 0, 2)]);
    expect(zeroCalls()).toHaveLength(2);
  });

  it("fires again after a real filter change: non-empty, then empty again", () => {
    mount(NO_MATCH).unmount();
    mount(NO_MATCH, false).unmount(); // filter off → list not empty → marker cleared
    mount(NO_MATCH, true);
    expect(zeroCalls()).toHaveLength(2);
  });

  it("fires again when the children's ages change", () => {
    mount(NO_MATCH).unmount();
    world.childAges = [11];
    mount(NO_MATCH);
    expect(zeroCalls()).toHaveLength(2);
  });
});
