// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DISTANCE_UNIT_STORAGE_KEY,
  detectDistanceUnit,
  resolveDistanceUnit,
  useDistanceUnitStore,
} from "./distanceUnit";

describe("detectDistanceUnit — follows the device region, not the app language", () => {
  it("uses miles for US / GB / LR / MM regions and US territories", () => {
    for (const tag of ["en-US", "en-GB", "es-US", "fr-US", "en-LR", "my-MM", "es-PR"]) {
      expect(detectDistanceUnit([tag]), tag).toBe("mi");
    }
  });

  it("uses kilometers for every other region", () => {
    for (const tag of ["fr-FR", "es-ES", "en-CA", "en-IE", "en-AU", "fr-CA", "es-MX"]) {
      expect(detectDistanceUnit([tag]), tag).toBe("km");
    }
  });

  it("falls back to kilometers when the region is unknown — a bare language never implies a region", () => {
    expect(detectDistanceUnit(["en"])).toBe("km");
    expect(detectDistanceUnit(["es"])).toBe("km");
    expect(detectDistanceUnit([])).toBe("km");
    expect(detectDistanceUnit(["not a tag"])).toBe("km");
  });

  it("takes the first entry that carries a region", () => {
    expect(detectDistanceUnit(["en", "en-GB", "fr-FR"])).toBe("mi");
  });
});

describe("resolveDistanceUnit", () => {
  it("manual choices ignore the region", () => {
    expect(resolveDistanceUnit("km", ["en-US"])).toBe("km");
    expect(resolveDistanceUnit("mi", ["fr-FR"])).toBe("mi");
  });
  it("auto defers to the region", () => {
    expect(resolveDistanceUnit("auto", ["en-US"])).toBe("mi");
    expect(resolveDistanceUnit("auto", ["fr-FR"])).toBe("km");
  });
});

describe("preference store", () => {
  beforeEach(() => {
    localStorage.clear();
    useDistanceUnitStore.setState({ preference: "auto" });
  });

  it("persists a manual choice and removes the key on automatic", () => {
    useDistanceUnitStore.getState().setPreference("mi");
    expect(localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY)).toBe("mi");
    expect(useDistanceUnitStore.getState().preference).toBe("mi");
    useDistanceUnitStore.getState().setPreference("auto");
    expect(localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY)).toBeNull();
  });
});
