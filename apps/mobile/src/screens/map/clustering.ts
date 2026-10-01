import Supercluster from "supercluster";
import type { Park } from "@toboggo/shared";

/**
 * Client-side marker density control for the explore map. Parks keep coming
 * from `useNearbyParks` unfiltered (20 km, no limit — "Autour de vous" still
 * gets the full list); this module only decides which of them get an
 * individual pin vs. a cluster pin *on the map*, based on the current
 * viewport and zoom. Wraps supercluster (kd-tree clustering), MapLibre's own
 * clustering engine — no bespoke algorithm.
 *
 * Values below were tuned visually against Millau (~60 parks/20km) and
 * Toulouse (~700 parks/20km, staging) at zoom 8→17 — not picked in the
 * abstract. See MapCanvas.tsx for how they're wired to the marker sync loop.
 */

export type ParkPoint = Park & { distance_m?: number };

/** Cluster bucket size in screen px — how close two pins must be to merge. */
export const CLUSTER_RADIUS = 56;
/** Above this zoom, points never cluster (== "zoom proche" from the brief). */
export const CLUSTER_MAX_ZOOM = 16;
/** Below 3 nearby points, supercluster already returns them individually. */
export const CLUSTER_MIN_POINTS = 3;
/** Rating capsule only appears once the user is zoomed in this close. */
export const RATING_VISIBLE_MIN_ZOOM = 15;

type IndexProps = { parkId: string };
type IndexPoint = GeoJSON.Feature<GeoJSON.Point, IndexProps>;

export type ClusterFeature = { kind: "cluster"; clusterId: number; lng: number; lat: number; count: number };
export type ParkFeature = { kind: "park"; park: ParkPoint; lng: number; lat: number };
export type DisplayFeature = ClusterFeature | ParkFeature;

export type ClusterIndex = {
  index: Supercluster<IndexProps>;
  byId: Map<string, ParkPoint>;
};

/** Builds a fresh index — cheap (~2ms for 2000+ points, measured) but still
 * only meant to run when the input point set changes, never per pan/zoom
 * frame (see the `useMemo` in MapCanvas.tsx). */
export function buildClusterIndex(points: { park: ParkPoint; lngLat: [number, number] }[]): ClusterIndex {
  const byId = new Map<string, ParkPoint>();
  const features: IndexPoint[] = points.map(({ park, lngLat }) => {
    byId.set(park.id, park);
    return { type: "Feature", properties: { parkId: park.id }, geometry: { type: "Point", coordinates: lngLat } };
  });
  const index = new Supercluster<IndexProps>({
    radius: CLUSTER_RADIUS,
    maxZoom: CLUSTER_MAX_ZOOM,
    minPoints: CLUSTER_MIN_POINTS,
  });
  index.load(features);
  return { index, byId };
}

/** What to actually draw for the current viewport/zoom — clusters and/or
 * individual park points, viewport-culled by supercluster itself. */
export function queryDisplayFeatures(
  { index, byId }: ClusterIndex,
  bbox: [number, number, number, number],
  zoom: number,
): DisplayFeature[] {
  const raw = index.getClusters(bbox, Math.floor(zoom));
  const out: DisplayFeature[] = [];
  for (const f of raw) {
    const [lng, lat] = f.geometry.coordinates;
    const props = f.properties;
    if ("cluster" in props && props.cluster) {
      out.push({ kind: "cluster", clusterId: props.cluster_id, lng, lat, count: props.point_count });
    } else {
      const park = byId.get((props as IndexProps).parkId);
      if (park) out.push({ kind: "park", park, lng, lat });
    }
  }
  return out;
}

/** Zoom to ease the camera to when a cluster pin is tapped — MapLibre's own
 * "next zoom where this cluster starts splitting", clamped to the max zoom
 * we ever cluster at so the camera doesn't overshoot past it. */
export function clusterExpansionZoom({ index }: ClusterIndex, clusterId: number): number {
  return Math.min(index.getClusterExpansionZoom(clusterId), CLUSTER_MAX_ZOOM + 1);
}
