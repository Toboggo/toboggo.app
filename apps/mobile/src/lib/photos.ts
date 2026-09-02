import type { Park } from "@toboggo/shared";

/**
 * Real park photos only.
 *
 * `park.photos` is built by the `park_public` view from **approved `park_media`
 * rows** — i.e. photos with an identifiable origin (contributor, collectivité,
 * reusable open source). The OSM import never creates a photo.
 *
 * This helper returns `null` when the park has no real photo at that index. It
 * NEVER fabricates a generic / illustrative / stock image. The empty state is a
 * UI concern — render <ParkPhoto>, which shows the Toboggo placeholder.
 */
export function parkPhotoUrl(park: Pick<Park, "photos">, index = 0): string | null {
  return park.photos?.[index] ?? null;
}

export function parkHasPhotos(park: Pick<Park, "photos">): boolean {
  return (park.photos?.length ?? 0) > 0;
}
