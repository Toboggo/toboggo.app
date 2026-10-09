import type { Park } from "@toboggo/shared";
import { parkPhotoUrl } from "./photos";

/**
 * Illustrated covers for parks without an approved public photo.
 *
 * Collection v1 is FIXED: its order and size decide which illustration a park
 * gets (index = hash(park.id) % length). Reordering or resizing it silently
 * re-assigns every park. A different set must ship as a new `v2` manifest.
 *
 * Illustrations are static assets — not `park_media`, not gallery items, and
 * they never count as photos.
 */
const V1_DIR = "/images/park-placeholders/v1";

export const PARK_COVER_MANIFEST_V1: readonly string[] = Object.freeze(
  Array.from({ length: 12 }, (_, i) => `${V1_DIR}/playground-${String(i + 1).padStart(2, "0")}.webp`),
);

/** FNV-1a 32-bit — tiny, dependency-free, identical on every device. */
export function hashParkId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function parkIllustrationSrc(parkId: string, manifest: readonly string[] = PARK_COVER_MANIFEST_V1): string {
  return manifest[hashParkId(parkId) % manifest.length]!;
}

export type ParkCoverSource =
  | { kind: "photo"; url: string; illustration: string }
  | { kind: "illustration"; illustration: string };

/**
 * Approved public photo first (`park.photos` only holds approved `park_media`),
 * otherwise the deterministic illustration. Pure: same park → same result.
 */
export function getParkCover(park: Pick<Park, "id" | "photos">, index = 0): ParkCoverSource {
  const illustration = parkIllustrationSrc(park.id);
  const url = parkPhotoUrl(park, index);
  return url ? { kind: "photo", url, illustration } : { kind: "illustration", illustration };
}
