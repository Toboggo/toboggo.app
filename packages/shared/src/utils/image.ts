/**
 * Client-side image preparation for park photos.
 *
 * A park photo is downscaled to ≤ `MAX_EDGE` px on its longest side and
 * re-encoded as WebP before upload — the original file is never sent. This
 * keeps Storage + bandwidth reasonable while staying sharp on mobile.
 */

export const MAX_EDGE = 1600;
export const WEBP_QUALITY = 0.8;

/** Hard ceiling accepted from the file picker, before compression. The bucket
 * itself also enforces `file_size_limit` (8 MiB) on the *uploaded* object. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|avif)$/i;

/** Machine-readable reason — the caller maps it to a localized message. */
export type ImageErrorCode = "not_an_image" | "too_large";

export class ImageValidationError extends Error {
  readonly code: ImageErrorCode;
  constructor(code: ImageErrorCode) {
    // The `message` is a non-localized fallback for logs / non-UI contexts;
    // the UI renders `t("errors:image." + code)` from `code`.
    super(code === "too_large" ? "Image too large" : "Not an image");
    this.name = "ImageValidationError";
    this.code = code;
  }
}

/** Throws `ImageValidationError` (carrying a `code`) when the picked file is
 * obviously not a usable photo. */
export function validateImageFile(file: File): void {
  const looksImage = file.type.startsWith("image/") || ACCEPTED_IMAGE_EXT.test(file.name);
  if (!looksImage) {
    throw new ImageValidationError("not_an_image");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageValidationError("too_large");
  }
}

const HEIC_EXT = /\.hei[cf]$/i;

/** Cheap, sync pre-filter — true for anything that *looks* HEIC/HEIF by MIME
 * type or extension. Lets the caller reserve the async decode probe
 * (`canDecodeImage`) for the one format that's actually a problem, instead of
 * paying a decode round-trip for every ordinary JPEG/PNG/WebP pick. */
export function looksLikeHeic(file: File): boolean {
  return /hei[cf]/i.test(file.type) || HEIC_EXT.test(file.name);
}

/**
 * Whether this browser can actually decode `file` into pixels. Used to catch
 * an undecodable HEIC/HEIF *before* it reaches Storage — the `park-photos`
 * bucket's `allowed_mime_types` (migration 0027) is jpeg/png/webp only, so a
 * HEIC file that `compressImage` can't convert would otherwise fail only at
 * upload time, behind a generic error. Safari (iOS/macOS) decodes HEIC
 * natively via `createImageBitmap` and is unaffected; most Chromium engines
 * don't and are exactly what this catches.
 */
export async function canDecodeImage(file: File): Promise<boolean> {
  if (typeof createImageBitmap === "undefined") return true;
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close?.();
    return true;
  } catch {
    return false;
  }
}

/**
 * Downscale + re-encode to WebP. Falls back to the original file when the
 * current environment can't process it (no DOM, or a format the browser can't
 * decode such as HEIC on some engines) — the upload path stays functional and
 * the bucket's `allowed_mime_types` is the backstop.
 */
export async function compressImage(file: File): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_EDGE / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY);
    });
    if (!blob) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.webp`, { type: "image/webp" });
  } finally {
    bitmap.close?.();
  }
}
