import { getSupabase } from "../supabaseClient";
import { compressImage, validateImageFile } from "./image";

const BUCKETS = {
  parkPhotos: "park-photos",
  avatars: "avatars",
  reportPhotos: "report-photos",
} as const;

type BucketKey = keyof typeof BUCKETS;

/**
 * Upload a real photo to Storage and return its public URL.
 *
 * `ownerId` MUST be the authenticated user's id: Storage RLS (migration 0027)
 * requires the object path to start with `<auth.uid()>/…`, so a user can only
 * ever write into their own folder. Park photos are additionally downscaled and
 * re-encoded to WebP client-side (≤ 1600 px) — the original is never uploaded.
 */
export async function uploadPhoto(bucket: BucketKey, file: File, ownerId: string): Promise<string> {
  const supabase = getSupabase();

  let toUpload = file;
  if (bucket === "parkPhotos") {
    validateImageFile(file);
    toUpload = await compressImage(file);
  }

  const ext = (toUpload.type === "image/webp"
    ? "webp"
    : toUpload.name.split(".").pop() || "jpg"
  ).toLowerCase();
  const path = `${ownerId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKETS[bucket]).upload(path, toUpload, {
    upsert: false,
    contentType: toUpload.type || undefined,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKETS[bucket]).getPublicUrl(path);
  return data.publicUrl;
}

/** Bucket-relative object path from a public URL, or `null` when the URL does
 * not point at that bucket (e.g. a legacy external URL). */
export function storagePathFromPublicUrl(bucket: BucketKey, publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKETS[bucket]}/`;
  const i = publicUrl.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(publicUrl.slice(i + marker.length));
}

/**
 * Best-effort deletion of a park photo file. Never throws: the `park_media` row
 * is the source of truth, and Storage RLS may legitimately forbid the delete
 * (e.g. a commune manager who is not the original uploader). A leftover file is
 * harmless once its row is gone — it is no longer referenced anywhere.
 */
export async function deleteParkPhotoFile(publicUrl: string): Promise<void> {
  const path = storagePathFromPublicUrl("parkPhotos", publicUrl);
  if (!path) return;
  try {
    await getSupabase().storage.from(BUCKETS.parkPhotos).remove([path]);
  } catch {
    /* ignore — see doc comment */
  }
}
