import { describe, expect, it } from "vitest";
import { buildClusterIndex, queryDisplayFeatures, clusterExpansionZoom, CLUSTER_MAX_ZOOM, type ParkPoint } from "./clustering";

function park(id: string, lng: number, lat: number): ParkPoint {
  return { id, longitude: lng, latitude: lat } as ParkPoint;
}

// A tight trio (a real dense-zone shape) plus one far-away lone park.
const TIGHT_LNG = 1.4442;
const TIGHT_LAT = 43.6047;
const points = [
  { park: park("a", TIGHT_LNG, TIGHT_LAT), lngLat: [TIGHT_LNG, TIGHT_LAT] as [number, number] },
  { park: park("b", TIGHT_LNG + 0.0003, TIGHT_LAT), lngLat: [TIGHT_LNG + 0.0003, TIGHT_LAT] as [number, number] },
  { park: park("c", TIGHT_LNG - 0.0003, TIGHT_LAT + 0.0003), lngLat: [TIGHT_LNG - 0.0003, TIGHT_LAT + 0.0003] as [number, number] },
  { park: park("far", TIGHT_LNG + 2, TIGHT_LAT + 2), lngLat: [TIGHT_LNG + 2, TIGHT_LAT + 2] as [number, number] },
];
const WORLD_BBOX: [number, number, number, number] = [-180, -85, 180, 85];

describe("clustering", () => {
  it("groups nearby parks into one cluster at a wide zoom, keeps a distant one standalone", () => {
    const index = buildClusterIndex(points);
    const features = queryDisplayFeatures(index, WORLD_BBOX, 8);
    const clusters = features.filter((f) => f.kind === "cluster");
    const standalone = features.filter((f) => f.kind === "park");

    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(3);
    expect(standalone.map((f) => f.park.id)).toEqual(["far"]);
  });

  it("renders every park individually once zoomed past the cluster max zoom", () => {
    const index = buildClusterIndex(points);
    const features = queryDisplayFeatures(index, WORLD_BBOX, CLUSTER_MAX_ZOOM + 1);
    expect(features.every((f) => f.kind === "park")).toBe(true);
    expect(features).toHaveLength(4);
  });

  it("gives a cluster an expansion zoom strictly greater than the query zoom", () => {
    const index = buildClusterIndex(points);
    const features = queryDisplayFeatures(index, WORLD_BBOX, 8);
    const cluster = features.find((f) => f.kind === "cluster");
    expect(cluster).toBeDefined();
    const zoom = clusterExpansionZoom(index, (cluster as { clusterId: number }).clusterId);
    expect(zoom).toBeGreaterThan(8);
  });

  it("never counts the selected park inside a cluster — callers exclude it before indexing", () => {
    // Same trio as above, but "a" (the stand-in for a selected park) is
    // excluded from the index, as MapCanvas.tsx does for the real selection.
    // With "a" gone, "b" + "c" alone fall under CLUSTER_MIN_POINTS and render
    // as two standalone pins instead of a 3-park cluster — proving a
    // selected park is never folded into (or inflates) a cluster's count.
    const withoutSelected = points.filter((p) => p.park.id !== "a");
    const index = buildClusterIndex(withoutSelected);
    const features = queryDisplayFeatures(index, WORLD_BBOX, 8);
    expect(features.some((f) => f.kind === "cluster")).toBe(false);
    expect(features.filter((f) => f.kind === "park").map((f) => f.park.id).sort()).toEqual(["b", "c", "far"]);
  });
});
