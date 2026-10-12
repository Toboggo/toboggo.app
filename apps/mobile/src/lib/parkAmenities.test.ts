import { describe, expect, it } from "vitest";
import { amenityEntries, playEntries, serviceEntry } from "./parkAmenities";

const view = (status: string, extra: Record<string, unknown> = {}) =>
  ({ status, value: null, quantity: null, category: "service", verified_at: null, ...extra }) as never;

describe("serviceEntry — null ≠ false", () => {
  it("availability flags: true → present, null/undefined → unknown, a bare false is NOT proof of absence", () => {
    expect(serviceEntry({ wc: true }, "wc").state).toBe("present");
    expect(serviceEntry({ wc: null }, "wc").state).toBe("unknown");
    expect(serviceEntry({}, "wc").state).toBe("unknown");
    // park_public: fstatus(...) = 'available' is false for unknown AND unavailable rows.
    expect(serviceEntry({ wc: false }, "wc").state).toBe("unknown");
  });

  it("availability flags: the features map tells unavailable / unknown apart", () => {
    expect(serviceEntry({ wc: false, features: { toilets: view("unavailable") } }, "wc").state).toBe("absent");
    expect(serviceEntry({ wc: false, features: { toilets: view("unknown") } }, "wc").state).toBe("unknown");
    expect(serviceEntry({ wc: false, features: { toilets: view("temporarily_unavailable") } }, "wc").state).toBe("unknown");
    expect(serviceEntry({ features: { toilets: view("available") } }, "wc").state).toBe("present");
  });

  it("value-based flags (fenced, shade): false = recorded not fenced, null = nothing recorded", () => {
    expect(serviceEntry({ fenced: true }, "fenced").state).toBe("present");
    expect(serviceEntry({ fenced: false }, "fenced").state).toBe("absent");
    expect(serviceEntry({ fenced: null }, "fenced").state).toBe("unknown");
    expect(serviceEntry({ fenced: null, features: { fence_status: view("unavailable") } }, "fenced").state).toBe("absent");
    expect(serviceEntry({ shade: null, features: { shade_level: view("unknown") } }, "shade").state).toBe("unknown");
  });

  it("verified only with a verified_at, never from a plain false", () => {
    expect(serviceEntry({ fenced: false }, "fenced").verified).toBe(false);
    expect(serviceEntry({ wc: false, features: { toilets: view("unavailable", { verified_at: "2026-09-01" }) } }, "wc").verified).toBe(true);
    expect(serviceEntry({ features: { toilets: view("unknown", { verified_at: "2026-09-01" }) } }, "wc").verified).toBe(false);
  });
});

describe("playEntries", () => {
  it("lists only games present in the data, with their state", () => {
    const entries = playEntries({
      features: {
        slide: view("available", { category: "play" }),
        swing: view("unavailable", { category: "play" }),
        sandbox: view("unknown", { category: "play" }),
        toilets: view("available"),
      },
      play_equipment: ["toboggan", "springs"],
    });
    const byCode = Object.fromEntries(entries.map((e) => [e.code, e.state]));
    expect(byCode).toEqual({ slide: "present", swing: "absent", sandbox: "unknown", springer: "present" });
  });

  it("does not enumerate the catalogue as unknown", () => {
    expect(playEntries({})).toEqual([]);
    expect(amenityEntries({}).every((e) => e.kind === "service" && e.state === "unknown")).toBe(true);
  });
});
