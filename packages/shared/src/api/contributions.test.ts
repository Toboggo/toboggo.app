import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../supabaseClient";
import { listPendingParkEditsForOrg } from "./contributions";
import { makeFakeSupabase } from "../testUtils/fakeSupabase";

vi.mock("../supabaseClient", () => ({ getSupabase: vi.fn() }));

describe("listPendingParkEditsForOrg — dashboard \"infos à vérifier\" count (Lot 2)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it("keeps only pending edits whose park belongs to the organisation", async () => {
    const { client } = makeFakeSupabase({
      organization_parks: { data: [{ park_id: "park-1" }, { park_id: "park-2" }], error: null },
      park_edits: {
        data: [
          { id: "e1", park_id: "park-1", status: "pending" },
          { id: "e2", park_id: "park-3", status: "pending" }, // different org's park
          { id: "e3", park_id: null, status: "pending" }, // no park attribution
        ],
        error: null,
      },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await listPendingParkEditsForOrg("org-1");

    expect(result.map((e) => e.id)).toEqual(["e1"]);
  });

  it("does not query park_edits at all for an organisation with zero parks", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      organization_parks: { data: [], error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await listPendingParkEditsForOrg("org-empty");

    expect(result).toEqual([]);
    expect(queriesByTable["park_edits"]).toBeUndefined();
  });
});
