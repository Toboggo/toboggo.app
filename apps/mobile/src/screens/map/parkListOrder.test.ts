import { describe, expect, it } from "vitest";
import { pushShownToEnd } from "./parkListOrder";

describe("pushShownToEnd", () => {
  it("moves already-shown rows after the rest, keeping the relative order within each group", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(pushShownToEnd(rows, ["a", "c"]).map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("never drops a row — the total count is unchanged", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(pushShownToEnd(rows, ["a", "b", "c"])).toHaveLength(3);
  });

  it("is a no-op with no shown ids", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(pushShownToEnd(rows, [])).toEqual(rows);
  });

  it("ignores shown ids that aren't in the list", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(pushShownToEnd(rows, ["nope"]).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
