import { describe, expect, it } from "vitest";
import { deriveMapZeroResultReason } from "./MapExplore";

// Logique pure des 4 branches "0 résultat" — testée isolément (pas de rendu
// de l'écran carte, qui demanderait de mocker maplibre-gl, react-query, la
// géolocalisation, etc. juste pour vérifier cette décision).
describe("deriveMapZeroResultReason", () => {
  it("is null when there are results, regardless of any other state", () => {
    expect(deriveMapZeroResultReason(true, true, 3, "Lyon")).toBeNull();
  });

  it("prioritizes location_denied over every other reason", () => {
    expect(deriveMapZeroResultReason(false, true, 2, "Lyon")).toBe("location_denied");
  });

  it("is filters_active when filters are on and location isn't denied", () => {
    expect(deriveMapZeroResultReason(false, false, 1, null)).toBe("filters_active");
  });

  it("is place_not_found for a searched place with no filters and no denied permission", () => {
    expect(deriveMapZeroResultReason(false, false, 0, "Lyon")).toBe("place_not_found");
  });

  it("falls back to default_area when none of the other reasons apply", () => {
    expect(deriveMapZeroResultReason(false, false, 0, null)).toBe("default_area");
  });
});
