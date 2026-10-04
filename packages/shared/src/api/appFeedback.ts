import { getSupabase } from "../supabaseClient";
import type { Tables } from "../types/database.types";

export type AppFeedback = Tables<"app_feedback">;
export type AppFeedbackSummary = Tables<"app_feedback_summary">;

/** Titre supprimé de l'UI (0044) : les avis existants le conservent, les nouveaux n'en ont pas. */
export interface AppFeedbackInput {
  rating: number;
  /** Commentaire facultatif — vide ⇒ stocké à null. */
  body?: string;
}

/** Délai minimal entre la création de deux avis (appliqué côté serveur, 0044). */
export const APP_FEEDBACK_COOLDOWN_DAYS = 30;

/** Date à partir de laquelle un nouvel avis est permis (créé + 30 j), ou null si aucun avis. */
export function nextAppFeedbackAt(latest: Pick<AppFeedback, "created_at"> | null | undefined): Date | null {
  if (!latest) return null;
  return new Date(new Date(latest.created_at).getTime() + APP_FEEDBACK_COOLDOWN_DAYS * 86_400_000);
}

/** Refus serveur : un avis a déjà été créé il y a moins de 30 jours. `nextAt` = date autorisée (si fournie par le serveur). */
export class AppFeedbackTooSoonError extends Error {
  constructor(public readonly nextAt: Date | null) {
    super("app_feedback_too_soon");
    this.name = "AppFeedbackTooSoonError";
  }
}

/** Le dernier avis n'est plus modifiable (un avis plus récent existe, ou il n'est pas à l'utilisateur). */
export class AppFeedbackNotEditableError extends Error {
  constructor() {
    super("app_feedback_not_editable");
    this.name = "AppFeedbackNotEditableError";
  }
}

function clean(body: string | undefined): string | null {
  const t = body?.trim();
  return t ? t : null;
}

/** The signed-in user's own history, newest first. RLS also enforces ownership. */
export async function listMyAppFeedback(userId: string): Promise<AppFeedback[]> {
  const { data, error } = await getSupabase()
    .from("app_feedback")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return data;
}

/** Creates a NEW evaluation (history is kept). The server refuses it < 30 days after the previous one, even under concurrency. */
export async function createAppFeedback(userId: string, input: AppFeedbackInput): Promise<AppFeedback> {
  const { data, error } = await getSupabase()
    .from("app_feedback")
    .insert({ user_id: userId, rating: input.rating, body: clean(input.body) })
    .select()
    .single();
  if (error) {
    if (error.message === "app_feedback_too_soon") {
      const hint = error.hint ? new Date(error.hint) : null;
      throw new AppFeedbackTooSoonError(hint && !Number.isNaN(hint.getTime()) ? hint : null);
    }
    throw error;
  }
  return data;
}

/** Edits an evaluation in place — only the user's latest one is allowed by RLS (0 row otherwise). Keeps `created_at`, sets `edited_at`. */
export async function updateAppFeedback(userId: string, id: string, input: AppFeedbackInput): Promise<AppFeedback> {
  const { data, error } = await getSupabase()
    .from("app_feedback")
    .update({ rating: input.rating, body: clean(input.body) })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppFeedbackNotEditableError();
  return data;
}

/** Admin back-office: every submission, newest first (RLS: Toboggo admins read all). */
export async function listAppFeedback(): Promise<AppFeedback[]> {
  const { data, error } = await getSupabase().from("app_feedback").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Admin back-office: overall rating = each user's LATEST evaluation only (view `app_feedback_summary`). */
export async function getAppFeedbackSummary(): Promise<AppFeedbackSummary> {
  const { data, error } = await getSupabase().from("app_feedback_summary").select("*").single();
  if (error) throw error;
  return data;
}
