import { describe, expect, it } from "vitest";
import { APP_URL, STORE_LINKS } from "../config/site";
import { listStores } from "./stores";

describe("store buttons", () => {
  it("shows nothing without a real URL (no dead or invented button)", () => {
    expect(listStores({ appStore: null, googlePlay: null })).toEqual([]);
    expect(listStores({ appStore: "", googlePlay: "   " })).toEqual([]);
  });

  it("shows each store only for a valid https URL on the right host", () => {
    const stores = listStores({ appStore: "https://apps.apple.com/fr/app/toboggo/id1234567890", googlePlay: "https://play.google.com/store/apps/details?id=app.toboggo" });
    expect(stores.map((s) => s.id)).toEqual(["appStore", "googlePlay"]);
    expect(listStores({ appStore: "https://apps.apple.com/fr/app/x/id1", googlePlay: null }).map((s) => s.id)).toEqual(["appStore"]);
    expect(listStores({ appStore: "https://testflight.apple.com/join/abc", googlePlay: null })).toHaveLength(1);
  });

  it("rejects placeholders, wrong hosts and non-https links", () => {
    expect(listStores({ appStore: "http://apps.apple.com/x", googlePlay: "https://example.com/toboggo" })).toEqual([]);
    expect(listStores({ appStore: "#", googlePlay: "pas une url" })).toEqual([]);
    expect(listStores({ appStore: "https://play.google.com/x", googlePlay: "https://apps.apple.com/x" })).toEqual([]);
  });

  it("points the main CTA to the production web app", () => {
    expect(APP_URL).toBe("https://toboggo-app.vercel.app");
  });

  it("the committed config is valid (null, or a valid store URL — never a placeholder)", () => {
    for (const value of Object.values(STORE_LINKS)) {
      if (value !== null) expect(listStores({ appStore: value, googlePlay: value }).length).toBeGreaterThan(0);
    }
  });
});
