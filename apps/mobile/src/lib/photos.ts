import type { Park } from "@toboggo/shared";

/**
 * Returns a real uploaded photo when the park has one, otherwise a stable
 * placeholder (picsum.photos, seeded by park id) so cards never show a blank
 * box — same fallback the prototype used, kept only as a placeholder for
 * parks nobody has photographed yet.
 */
export function parkPhotoUrl(park: Park, index = 0, w = 400, h = 400): string {
  const real = park.photos?.[index];
  if (real) return real;
  return `https://picsum.photos/seed/toboggo-${park.id}-${index}/${w}/${h}`;
}
