import { getSupabase } from "../supabaseClient";

export async function sendContactMessage(input: { name: string; email: string; subject: string; message: string }) {
  const supabase = getSupabase();
  const { error } = await supabase.from("contact_messages").insert(input);
  if (error) throw error;
}
