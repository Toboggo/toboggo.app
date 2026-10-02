import { getSupabase } from "../supabaseClient";
import type { Tables } from "../types/database.types";

export type AppFeedback = Tables<"app_feedback">;
export interface AppFeedbackInput {
  rating: number;
  title: string;
  body: string;
}

/** The signed-in user's own evaluation of the app, or null. RLS also enforces ownership. */
export async function getMyAppFeedback(userId: string): Promise<AppFeedback | null> {
  const { data, error } = await getSupabase().from("app_feedback").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** One evaluation per user: insert, or update the existing one. `userId` comes from the session — RLS rejects any other. */
export async function saveAppFeedback(userId: string, input: AppFeedbackInput): Promise<AppFeedback> {
  const { data, error } = await getSupabase()
    .from("app_feedback")
    .upsert(
      { user_id: userId, rating: input.rating, title: input.title.trim(), body: input.body.trim() },
      { onConflict: "user_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Admin back-office list (RLS: Toboggo admins read all evaluations). */
export async function listAppFeedback(): Promise<AppFeedback[]> {
  const { data, error } = await getSupabase().from("app_feedback").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
