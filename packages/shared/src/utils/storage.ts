import { getSupabase } from "../supabaseClient";

const BUCKETS = {
  parkPhotos: "park-photos",
  avatars: "avatars",
  reportPhotos: "report-photos",
} as const;

export async function uploadPhoto(bucket: keyof typeof BUCKETS, file: File, pathPrefix: string): Promise<string> {
  const supabase = getSupabase();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKETS[bucket]).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKETS[bucket]).getPublicUrl(path);
  return data.publicUrl;
}
