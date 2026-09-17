import { describe, expect, it } from "vitest";
import { classifySearchOutcome } from "./SearchOverlay";

// Logique pure d'aiguillage analytics de la recherche — testée isolément
// plutôt qu'en rendant tout l'écran (pas de mock react-query/i18n à
// maintenir juste pour vérifier cette décision).
describe("classifySearchOutcome", () => {
  it("is search_results_viewed with query_type 'park' when parks are found", () => {
    expect(classifySearchOutcome(3, 0)).toEqual({
      queryType: "park",
      resultsCount: 3,
      resultEvent: "search_results_viewed",
    });
  });

  it("is search_results_viewed with query_type 'place' when only places are found", () => {
    expect(classifySearchOutcome(0, 2)).toEqual({
      queryType: "place",
      resultsCount: 2,
      resultEvent: "search_results_viewed",
    });
  });

  it("prefers 'park' as query_type when both parks and places are found (parks shown first in the UI)", () => {
    expect(classifySearchOutcome(1, 5)).toMatchObject({ queryType: "park", resultsCount: 6 });
  });

  it("is zero_results, never search_results_viewed, when nothing is found", () => {
    const outcome = classifySearchOutcome(0, 0);
    expect(outcome.resultEvent).toBe("zero_results");
    expect(outcome.resultsCount).toBe(0);
  });

  it("search_results_viewed and zero_results are always mutually exclusive across the count space", () => {
    for (let parkCount = 0; parkCount <= 3; parkCount++) {
      for (let placeCount = 0; placeCount <= 3; placeCount++) {
        const { resultEvent, resultsCount } = classifySearchOutcome(parkCount, placeCount);
        if (resultsCount > 0) expect(resultEvent).toBe("search_results_viewed");
        else expect(resultEvent).toBe("zero_results");
      }
    }
  });
});
