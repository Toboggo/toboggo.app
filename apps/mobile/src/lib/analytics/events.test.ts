import { describe, expect, it } from "vitest";
import { distanceBucket } from "./events";

describe("distanceBucket", () => {
  it("categorizes distances into the taxonomy's buckets, never a raw number", () => {
    expect(distanceBucket(0)).toBe("<1km");
    expect(distanceBucket(999)).toBe("<1km");
    expect(distanceBucket(1000)).toBe("1-3km");
    expect(distanceBucket(2999)).toBe("1-3km");
    expect(distanceBucket(3000)).toBe("3-10km");
    expect(distanceBucket(9999)).toBe("3-10km");
    expect(distanceBucket(10000)).toBe("10-20km");
    expect(distanceBucket(19999)).toBe("10-20km");
    expect(distanceBucket(20000)).toBe(">20km");
    expect(distanceBucket(1_000_000)).toBe(">20km");
  });
});
