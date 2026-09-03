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

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

/** Throws `ImageValidationError` with a user-facing French message when the
 * picked file is obviously not a usable photo. */
export function validateImageFile(file: File): void {
  const looksImage = file.type.startsWith("image/") || ACCEPTED_IMAGE_EXT.test(file.name);
  if (!looksImage) {
    throw new ImageValidationError("Ce fichier n'est pas une image.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageValidationError("Cette image est trop lourde (25 Mo maximum).");
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
