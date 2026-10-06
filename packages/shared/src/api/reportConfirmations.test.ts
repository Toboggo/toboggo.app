import { describe, expect, it } from "vitest";
import { countConfirmations } from "./reportConfirmations";

describe("countConfirmations", () => {
  it("agrège par signalement et par réponse", () => {
    expect(
      countConfirmations([
        { report_id: "a", response: "still_present" },
        { report_id: "a", response: "still_present" },
        { report_id: "a", response: "resolved" },
        { report_id: "b", response: "resolved" },
        { report_id: "b", response: "inconnue" },
      ]),
    ).toEqual({ a: { still_present: 2, resolved: 1 }, b: { still_present: 0, resolved: 1 } });
  });
  it("vide → objet vide", () => {
    expect(countConfirmations([])).toEqual({});
  });
});
