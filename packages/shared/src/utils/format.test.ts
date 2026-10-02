import { describe, expect, it } from "vitest";
import { formatMeters } from "./format";

describe("formatMeters", () => {
  it("keeps the historical metric output by default", () => {
    expect(formatMeters(420, "fr-FR")).toBe("420 m");
    expect(formatMeters(1240, "fr-FR")).toBe("1,2 km");
    expect(formatMeters(1240, "en-GB")).toBe("1.2 km");
    expect(formatMeters(2000, "fr-FR", "km")).toBe("2 km");
  });

  it("converts to miles with one decimal", () => {
    expect(formatMeters(1609.344, "en-US", "mi")).toBe("1 mi");
    expect(formatMeters(2000, "en-US", "mi")).toBe("1.2 mi");
    expect(formatMeters(5000, "en-US", "mi")).toBe("3.1 mi");
    expect(formatMeters(10000, "fr-FR", "mi")).toBe("6,2 mi");
  });

  it("switches to feet below 0.1 mi, rounded to 10 ft", () => {
    expect(formatMeters(100, "en-US", "mi")).toBe("330 ft");
    expect(formatMeters(0, "en-US", "mi")).toBe("0 ft");
  });

  it("rejects invalid input", () => {
    expect(formatMeters(-1, "en-US", "mi")).toBe("");
    expect(formatMeters(NaN, "en-US")).toBe("");
  });
});
