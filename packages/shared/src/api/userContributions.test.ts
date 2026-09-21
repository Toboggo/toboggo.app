import { beforeEach, describe, expect, it, vi } from "vitest";
import { listMyParks } from "./parks";
import { listMyReviews } from "./reviews";
import { listMyReports } from "./reports";
import { listMyParkEdits } from "./contributions";
import { listMyMedia } from "./parkDetails";
import { computeImpactStats, listMyContributions } from "./userContributions";

vi.mock("./parks", () => ({ listMyParks: vi.fn() }));
vi.mock("./reviews", () => ({ listMyReviews: vi.fn() }));
vi.mock("./reports", () => ({ listMyReports: vi.fn() }));
vi.mock("./contributions", () => ({ listMyParkEdits: vi.fn() }));
vi.mock("./parkDetails", () => ({ listMyMedia: vi.fn() }));

function reset() {
  vi.mocked(listMyParks).mockReset().mockResolvedValue([]);
  vi.mocked(listMyReviews).mockReset().mockResolvedValue([]);
  vi.mocked(listMyReports).mockReset().mockResolvedValue([]);
  vi.mocked(listMyParkEdits).mockReset().mockResolvedValue([]);
  vi.mocked(listMyMedia).mockReset().mockResolvedValue([]);
}

describe("listMyContributions", () => {
  beforeEach(reset);

  it("merges all five sources and sorts newest first", async () => {
    vi.mocked(listMyParks).mockResolvedValue([
      { id: "p1", name: "Parc A", city: "Lyon", created_at: "2026-09-01T00:00:00Z", moderation_status: "published", cover_photo: null } as never,
    ]);
    vi.mocked(listMyReviews).mockResolvedValue([
      { id: "r1", park_id: "p1", created_at: "2026-09-03T00:00:00Z", status: "published", rating: 5, parks: { name: "Parc A", city: "Lyon" } } as never,
    ]);
    vi.mocked(listMyReports).mockResolvedValue([
      { id: "rep1", park_id: "p1", created_at: "2026-09-02T00:00:00Z", status: "open", category: "broken_equipment", photo: null, parks: { name: "Parc A", city: "Lyon" } } as never,
    ]);

    const items = await listMyContributions("u1");

    expect(items.map((i) => i.id)).toEqual(["review:r1", "report:rep1", "park:p1"]);
    expect(items[0].type).toBe("review");
    expect(items[0].rating).toBe(5);
    expect(items[1].reportCategory).toBe("broken_equipment");
  });

  it("calls each source exactly once (no N+1) and scopes every call to the given user", async () => {
    await listMyContributions("u42");
    expect(listMyParks).toHaveBeenCalledTimes(1);
    expect(listMyParks).toHaveBeenCalledWith("u42");
    expect(listMyReviews).toHaveBeenCalledWith("u42");
    expect(listMyReports).toHaveBeenCalledWith("u42");
    expect(listMyParkEdits).toHaveBeenCalledWith("u42");
    expect(listMyMedia).toHaveBeenCalledWith("u42");
  });

  it("groups photos submitted in the same batch (identical park_id + created_at) into one entry", async () => {
    const sameTimestamp = "2026-09-05T12:00:00.000Z";
    vi.mocked(listMyMedia).mockResolvedValue([
      { id: "m1", park_id: "p1", url: "https://x/1.jpg", status: "pending", created_at: sameTimestamp, parks: { name: "Parc A", city: "Lyon" } } as never,
      { id: "m2", park_id: "p1", url: "https://x/2.jpg", status: "pending", created_at: sameTimestamp, parks: { name: "Parc A", city: "Lyon" } } as never,
      { id: "m3", park_id: "p1", url: "https://x/3.jpg", status: "pending", created_at: "2026-08-01T00:00:00.000Z", parks: { name: "Parc A", city: "Lyon" } } as never,
    ]);

    const items = await listMyContributions("u1");

    expect(items).toHaveLength(2);
    const batch = items.find((i) => i.id === "media:m1")!;
    expect(batch.photoCount).toBe(2);
    expect(batch.thumbnail).toBe("https://x/1.jpg");
    const single = items.find((i) => i.id === "media:m3")!;
    expect(single.photoCount).toBe(1);
  });

  it("reads the correction target out of park_edits.changes without inventing a field", async () => {
    vi.mocked(listMyParkEdits).mockResolvedValue([
      {
        id: "e1",
        park_id: "p1",
        created_at: "2026-09-01T00:00:00Z",
        status: "pending",
        changes: { kind: "correction", target: "play" },
        parks: { name: "Parc A", city: "Lyon" },
      } as never,
    ]);

    const [item] = await listMyContributions("u1");
    expect(item.editTarget).toBe("play");
  });
});

describe("computeImpactStats", () => {
  it("counts only contributions in a completed state for their type, never a raw count", () => {
    const stats = computeImpactStats([
      { id: "1", sourceId: "1", type: "park", parkId: "p1", parkName: null, city: null, createdAt: "", status: "published", thumbnail: null },
      { id: "2", sourceId: "2", type: "edit", parkId: "p1", parkName: null, city: null, createdAt: "", status: "pending", thumbnail: null }, // not counted
      { id: "3", sourceId: "3", type: "media", parkId: "p2", parkName: null, city: null, createdAt: "", status: "approved", thumbnail: null },
      { id: "4", sourceId: "4", type: "report", parkId: "p2", parkName: null, city: null, createdAt: "", status: "resolved", thumbnail: null },
      { id: "5", sourceId: "5", type: "review", parkId: "p3", parkName: null, city: null, createdAt: "", status: "flagged", thumbnail: null }, // not counted
    ]);

    expect(stats.publishedCount).toBe(3); // park, media, report — not the pending edit or the flagged review
    expect(stats.parksImprovedCount).toBe(2); // distinct parkId among those 3: p1, p2
  });

  it("returns zeros, not a crash, for an empty history", () => {
    expect(computeImpactStats([])).toEqual({ publishedCount: 0, parksImprovedCount: 0 });
  });
});
