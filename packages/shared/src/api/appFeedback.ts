import { getSupabase } from "../supabaseClient";
import type { Tables } from "../types/database.types";

export type AppFeedback = Tables<"app_feedback">;
/** A submission of the history: the current review (`is_current`) or an archived one. */
export type AppFeedbackEntry = Omit<AppFeedback, "updated_at"> & { is_current: boolean };
export type AppFeedbackSummary = Tables<"app_feedback_summary">;

/** Titre supprimé de l'UI : les avis existants le conservent, les nouveaux n'en ont pas. */
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

/** Refus serveur : l'avis courant a été créé il y a moins de 30 jours. `nextAt` = date autorisée (si fournie par le serveur). */
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

type AppFeedbackAllRow = Tables<"app_feedback_all">;

/** Normalises a row of the `app_feedback_all` view (every column is nullable there). */
function fromCurrent(r: AppFeedback): AppFeedbackEntry {
  const { updated_at: _u, ...rest } = r;
  return { ...rest, is_current: true };
}

function fromAll(r: AppFeedbackAllRow): AppFeedbackEntry {
  return {
    id: r.id!,
    user_id: r.user_id!,
    rating: r.rating!,
    title: r.title,
    body: r.body,
    created_at: r.created_at!,
    edited_at: r.edited_at,
    is_current: !!r.is_current,
  };
}

/** The signed-in user's own history (current review first, then the archived ones), newest first. RLS also enforces ownership. */
export async function listMyAppFeedback(userId: string): Promise<AppFeedbackEntry[]> {
  const { data, error } = await getSupabase()
    .from("app_feedback_all")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(fromAll);
}

/**
 * First review, or a NEW review that archives the current one (RPC `give_app_feedback`, transactional, locked per user).
 * The server refuses it < 30 days after the current review was created, even under concurrency.
 */
export async function createAppFeedback(_userId: string, input: AppFeedbackInput): Promise<AppFeedbackEntry> {
  const { data, error } = await getSupabase().rpc("give_app_feedback", {
    p_rating: input.rating,
    p_body: clean(input.body) ?? undefined,
  });
  if (error) {
    if (error.message === "app_feedback_too_soon") {
      const hint = error.hint ? new Date(error.hint) : null;
      throw new AppFeedbackTooSoonError(hint && !Number.isNaN(hint.getTime()) ? hint : null);
    }
    throw error;
  }
  return fromCurrent(data);
}

/** Edits the CURRENT review in place (RLS: the author's row only; archived reviews are not writable). Keeps `created_at`, sets `edited_at`. */
export async function updateAppFeedback(userId: string, id: string, input: AppFeedbackInput): Promise<AppFeedbackEntry> {
  const { data, error } = await getSupabase()
    .from("app_feedback")
    .update({ rating: input.rating, body: clean(input.body) })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppFeedbackNotEditableError();
  return fromCurrent(data);
}

/** Admin back-office: every submission (current + archived, `is_current`), newest first (RLS: Toboggo admins read all). */
export async function listAppFeedback(): Promise<AppFeedbackEntry[]> {
  const { data, error } = await getSupabase().from("app_feedback_all").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(fromAll);
}

/** Admin back-office: overall rating = each user's LATEST evaluation only (view `app_feedback_summary`). */
export async function getAppFeedbackSummary(): Promise<AppFeedbackSummary> {
  const { data, error } = await getSupabase().from("app_feedback_summary").select("*").single();
  if (error) throw error;
  return data;
}
