import { describe, expect, it } from "vitest";
import type { Park } from "@toboggo/shared";
import { computeCompleteness } from "./parkCompleteness";

const empty = {
  address_line: null,
  formatted_address: null,
  min_age: null,
  max_age: null,
  description: null,
  cover_photo: null,
  photos: [],
  features: {},
} as unknown as Pick<
  Park,
  "address_line" | "formatted_address" | "min_age" | "max_age" | "description" | "cover_photo" | "photos" | "features"
>;

describe("computeCompleteness", () => {
  it("nothing recorded → 0/5, everything to complete", () => {
    const c = computeCompleteness(empty);
    expect(c.filled).toBe(0);
    expect(c.total).toBe(5);
    expect(c.missing).toEqual(["address", "ages", "description", "photo", "features"]);
  });

  it("everything recorded → 5/5, nothing missing", () => {
    const c = computeCompleteness({
      address_line: "12 rue des Lilas",
      formatted_address: "12 rue des Lilas",
      min_age: 2,
      max_age: 10,
      description: "Aire de jeux ombragée",
      cover_photo: "https://x/y.jpg",
      photos: ["https://x/y.jpg"],
      features: { slide: { status: "available", value: null, quantity: null, category: "play", verified_at: null } },
    });
    expect(c.filled).toBe(5);
    expect(c.missing).toEqual([]);
  });

  it("whitespace-only text does not count", () => {
    const c = computeCompleteness({ ...empty, address_line: "   ", description: "\n" });
    expect(c.missing).toContain("address");
    expect(c.missing).toContain("description");
  });

  it("an age of 0 is a real value; a single bound is enough", () => {
    expect(computeCompleteness({ ...empty, min_age: 0 }).missing).not.toContain("ages");
    expect(computeCompleteness({ ...empty, max_age: 12 }).missing).not.toContain("ages");
  });

  it("a photo counts via the approved list or the cover", () => {
    expect(computeCompleteness({ ...empty, photos: ["a"] }).missing).not.toContain("photo");
    expect(computeCompleteness({ ...empty, cover_photo: "a" }).missing).not.toContain("photo");
  });

  it("an 'unknown' feature is not a recorded characteristic; 'unavailable' is", () => {
    const unknown = { status: "unknown", value: null, quantity: null, category: "play", verified_at: null } as const;
    const absent = { ...unknown, status: "unavailable" } as const;
    expect(computeCompleteness({ ...empty, features: { slide: unknown } }).missing).toContain("features");
    expect(computeCompleteness({ ...empty, features: { slide: absent } }).missing).not.toContain("features");
  });

  it("a value-type feature counts only with a real value", () => {
    const base = { status: "unknown", quantity: null, category: "environment", verified_at: null } as const;
    expect(computeCompleteness({ ...empty, features: { fence_status: { ...base, value: "unknown" } } }).missing).toContain("features");
    expect(computeCompleteness({ ...empty, features: { fence_status: { ...base, value: "fully_fenced" } } }).missing).not.toContain("features");
  });

  it("the real Lyon shape (OSM import: only ages) is 1/5", () => {
    const c = computeCompleteness({ ...empty, min_age: 1, max_age: 12 });
    expect(c.filled).toBe(1);
    expect(c.missing).toHaveLength(4);
  });
});
