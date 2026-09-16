import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../supabaseClient";
import { listPendingParkEditsForOrg, reviewParkEdit } from "./contributions";
import { makeFakeSupabase } from "../testUtils/fakeSupabase";
import type { ParkEditReviewResult } from "../types";

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

describe("reviewParkEdit — seule voie applicative pour approuver/rejeter (Admin-3A-2)", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it("approve appelle review_park_edit avec p_edit_id/p_decision='approve'/p_note, sans reviewerId", async () => {
    const approved: ParkEditReviewResult = { outcome: "approved", status: "approved", items: [] };
    const { client, rpcCalls } = makeFakeSupabase({ "rpc:review_park_edit": { data: approved, error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await reviewParkEdit("edit-1", "approve", "Vérifié sur place");

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("review_park_edit");
    expect(rpcCalls[0].params).toEqual({ p_edit_id: "edit-1", p_decision: "approve", p_note: "Vérifié sur place" });
    // Aucune clé reviewer/reviewerId/reviewed_by envoyée par le client.
    expect(Object.keys(rpcCalls[0].params as object)).not.toContain("reviewerId");
    expect(Object.keys(rpcCalls[0].params as object)).not.toContain("p_reviewer_id");
  });

  it("reject appelle la même RPC avec p_decision='reject'", async () => {
    const rejected: ParkEditReviewResult = { outcome: "rejected", status: "rejected", items: [] };
    const { client, rpcCalls } = makeFakeSupabase({ "rpc:review_park_edit": { data: rejected, error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await reviewParkEdit("edit-2", "reject");

    expect(rpcCalls[0].fn).toBe("review_park_edit");
    expect(rpcCalls[0].params).toEqual({ p_edit_id: "edit-2", p_decision: "reject" });
    expect(result).toEqual(rejected);
  });

  it("omet p_note plutôt que d'envoyer null quand aucune note n'est fournie", async () => {
    const { client, rpcCalls } = makeFakeSupabase({
      "rpc:review_park_edit": { data: { outcome: "approved", status: "approved", items: [] }, error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await reviewParkEdit("edit-3", "approve");

    expect(rpcCalls[0].params).toEqual({ p_edit_id: "edit-3", p_decision: "approve" });
    expect(rpcCalls[0].params).not.toHaveProperty("p_note");
  });

  it("retourne 'approved' avec ses items tel quel (résultat typé, pas d'exception)", async () => {
    const approved: ParkEditReviewResult = {
      outcome: "approved",
      status: "approved",
      items: [{ field: "ages", label: "Tranche d'âge", result: "APPLICABLE", applied: true }],
    };
    const { client } = makeFakeSupabase({ "rpc:review_park_edit": { data: approved, error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const result = await reviewParkEdit("edit-4", "approve");

    expect(result).toEqual(approved);
  });

  it("retourne 'requires_manual_review' comme un résultat normal (pas une exception)", async () => {
    const manual: ParkEditReviewResult = {
      outcome: "requires_manual_review",
      status: "pending",
      items: [{ field: "location", label: "Localisation", result: "CONFLICT", applied: false }],
    };
    const { client } = makeFakeSupabase({ "rpc:review_park_edit": { data: manual, error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(reviewParkEdit("edit-5", "approve")).resolves.toEqual(manual);
  });

  it("retourne 'already_reviewed' comme un résultat normal (pas une exception)", async () => {
    const already: ParkEditReviewResult = {
      outcome: "already_reviewed",
      status: "approved",
      reviewed_by: "user-9",
      reviewed_at: "2026-09-16T10:00:00Z",
    };
    const { client } = makeFakeSupabase({ "rpc:review_park_edit": { data: already, error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(reviewParkEdit("edit-6", "approve")).resolves.toEqual(already);
  });

  it("rejected est correctement retourné", async () => {
    const rejected: ParkEditReviewResult = { outcome: "rejected", status: "rejected", items: [] };
    const { client } = makeFakeSupabase({ "rpc:review_park_edit": { data: rejected, error: null } });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(reviewParkEdit("edit-7", "reject", "Non pertinent")).resolves.toEqual(rejected);
  });

  it("propage une vraie erreur Supabase (insufficient_privilege, etc.) — throw, comme tous les wrappers de ce fichier", async () => {
    const pgError = { message: "review_park_edit: acteur non autorisé", code: "42501" };
    const { client } = makeFakeSupabase({ "rpc:review_park_edit": { data: null, error: pgError } });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(reviewParkEdit("edit-8", "approve")).rejects.toEqual(pgError);
  });
});
