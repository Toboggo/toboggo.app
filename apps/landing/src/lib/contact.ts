/**
 * Logique du formulaire /contact, hors DOM pour être testée.
 * Envoi : d'abord le endpoint serveur `/api/contact` (validation serveur, anti-spam, Resend — voir
 * contactServer.ts). Tant qu'il n'est pas disponible/configuré, secours historique : un INSERT anonyme
 * dans `contact_messages` (RLS : insertion publique, lecture réservée au staff). Le schéma n'a que
 * name / email / subject / message : la collectivité est donc ajoutée en tête du message.
 */

export const SUBJECTS = ["Question générale", "Problème technique", "Partenariat", "Presse"] as const;
export type Subject = (typeof SUBJECTS)[number];

export const PARTNERSHIP: Subject = "Partenariat";

export const LIMITS = { name: 100, email: 254, organization: 150, message: 5000, messageMin: 10 } as const;

/** Délai minimal entre l'affichage du formulaire et l'envoi (les robots envoient instantanément). */
export const MIN_FILL_MS = 3000;

const SUBJECT_BY_PARAM: Record<string, Subject> = {
  general: "Question générale",
  technique: "Problème technique",
  partenariat: "Partenariat",
  presse: "Presse",
};

/** `?sujet=partenariat` → sujet connu ; toute autre valeur est ignorée (jamais de valeur libre). */
export function subjectFromParam(value: string | null | undefined): Subject | null {
  return SUBJECT_BY_PARAM[(value ?? "").trim().toLowerCase()] ?? null;
}

export interface ContactInput {
  name: string;
  email: string;
  subject: string;
  organization: string;
  message: string;
  /** Champ piège : doit rester vide. */
  website: string;
}

export interface ContactPayload {
  name: string;
  email: string;
  subject: Subject;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ContactErrorField = "name" | "email" | "message" | "subject";
export interface ContactError {
  field: ContactErrorField;
  message: string;
}

export function validateContact(input: ContactInput): ContactError | null {
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();
  if (!name) return { field: "name", message: "Indiquez votre nom." };
  if (name.length > LIMITS.name) return { field: "name", message: `Votre nom ne doit pas dépasser ${LIMITS.name} caractères.` };
  if (!EMAIL_RE.test(email) || email.length > LIMITS.email) return { field: "email", message: "Indiquez une adresse e-mail valide." };
  if (!(SUBJECTS as readonly string[]).includes(input.subject)) return { field: "subject", message: "Choisissez un sujet." };
  if (message.length < LIMITS.messageMin) return { field: "message", message: `Votre message est trop court (${LIMITS.messageMin} caractères minimum).` };
  if (message.length > LIMITS.message) return { field: "message", message: `Votre message ne doit pas dépasser ${LIMITS.message} caractères.` };
  return null;
}

/** Robot probable : champ piège rempli, ou envoi trop rapide après l'affichage. */
export function looksLikeBot(input: Pick<ContactInput, "website">, elapsedMs: number): boolean {
  return input.website.trim() !== "" || elapsedMs < MIN_FILL_MS;
}

export function buildPayload(input: ContactInput): ContactPayload {
  const organization = input.organization.trim().slice(0, LIMITS.organization);
  const message = input.message.trim();
  const isPartnership = input.subject === PARTNERSHIP;
  return {
    name: input.name.trim(),
    email: input.email.trim(),
    subject: input.subject as Subject,
    message: isPartnership && organization ? `Collectivité : ${organization}\n\n${message}` : message,
  };
}

export class ContactSendError extends Error {
  constructor(public readonly status: number) {
    super(`contact insert failed: HTTP ${status}`);
  }
}

/** INSERT anonyme (POST sur la table, Prefer: return=minimal — la lecture est interdite à `anon`). */
export async function sendContact(
  endpoint: string,
  anonKey: string,
  payload: ContactPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new ContactSendError(res.status);
}

/** Statuts qui signifient « le endpoint serveur n'est pas en service » (non déployé, non configuré, Resend en panne). */
const API_UNAVAILABLE = new Set([404, 405, 502, 503]);

/**
 * Envoi via le endpoint serveur. `"sent"` = accepté ; `"unavailable"` = service absent/non configuré
 * (l'appelant peut utiliser le secours) ; toute autre réponse d'erreur lève `ContactSendError`.
 */
export async function sendContactApi(
  input: ContactInput,
  elapsedMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<"sent" | "unavailable"> {
  let res: Response;
  try {
    res = await fetchImpl("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, elapsedMs }),
    });
  } catch {
    return "unavailable";
  }
  if (res.ok) return "sent";
  if (API_UNAVAILABLE.has(res.status)) return "unavailable";
  throw new ContactSendError(res.status);
}
