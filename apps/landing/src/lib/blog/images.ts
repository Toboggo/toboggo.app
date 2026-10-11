/** URLs d'images Sanity (CDN cdn.sanity.io) : redimensionnement et format modernes côté CDN. */
export function sanityImage(url: string, opts: { w: number; h?: number }): string {
  const u = new URL(url);
  u.searchParams.set("w", String(opts.w));
  if (opts.h) {
    u.searchParams.set("h", String(opts.h));
    u.searchParams.set("fit", "crop");
  } else {
    u.searchParams.set("fit", "max");
  }
  u.searchParams.set("auto", "format");
  u.searchParams.set("q", "80");
  return u.toString();
}

export function sanitySrcset(url: string, widths: number[], ratio?: number): string {
  return widths.map((w) => `${sanityImage(url, { w, h: ratio ? Math.round(w / ratio) : undefined })} ${w}w`).join(", ");
}
