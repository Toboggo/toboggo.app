/**
 * Traitement SERVEUR du formulaire de contact (Vercel Function `api/contact.ts`).
 *
 * formulaire → POST /api/contact → validation serveur → anti-spam → Resend → boîte de réception
 *
 * - Aucun secret côté client : `RESEND_API_KEY` n'existe que dans l'environnement du serveur.
 * - Variables attendues (voir apps/landing/CONTACT.md) : RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL.
 *   Si l'une manque → 503 `not_configured` : rien n'est envoyé et le client peut basculer sur son secours.
 * - Fonction pure (env et fetch injectés) : testée sans aucun envoi réel.
 * - PAS de limitation de débit ici : sans stockage partagé (KV/Redis) elle ne fonctionnerait pas sur des
 *   fonctions sans état. À traiter via la règle « Rate limiting » du pare-feu Vercel (voir CONTACT.md).
 */
import { SITE_URL } from "../config/site.js";
import { MIN_FILL_MS, buildPayload, validateContact, type ContactInput } from "./contact.js";

export interface ContactEnv {
  RESEND_API_KEY?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
}

/** Taille maximale du corps (le message est déjà limité à 5000 caractères). */
export const MAX_BODY_CHARS = 20_000;

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function json(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

/** Même origine que la requête, ou domaine public du site. Un POST sans en-tête Origin est refusé. */
function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const host = new URL(origin).host;
    return host === new URL(request.url).host || host === new URL(SITE_URL).host;
  } catch {
    return false;
  }
}

const oneLine = (value: string, max: number) => value.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

function readInput(raw: unknown): (ContactInput & { elapsedMs: number }) | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");
  return {
    name: text("name"),
    email: text("email"),
    subject: text("subject"),
    organization: text("organization"),
    message: text("message"),
    website: text("website"),
    elapsedMs: typeof data.elapsedMs === "number" && Number.isFinite(data.elapsedMs) ? data.elapsedMs : -1,
  };
}

export async function handleContact(
  request: Request,
  env: ContactEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { Allow: "POST" });
  if (!isAllowedOrigin(request)) return json(403, { error: "forbidden_origin" });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json(415, { error: "unsupported_media_type" });
  }

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return json(413, { error: "payload_too_large" });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const input = readInput(parsed);
  if (!input) return json(400, { error: "invalid_body" });

  // Robot probable (champ piège rempli, ou envoi sans délai humain) : faux succès, rien n'est envoyé.
  if (input.website.trim() !== "" || input.elapsedMs < MIN_FILL_MS) return json(200, { ok: true });

  const invalid = validateContact(input);
  if (invalid) return json(422, { error: "invalid", field: invalid.field, message: invalid.message });

  const { RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL } = env;
  if (!RESEND_API_KEY || !CONTACT_TO_EMAIL || !CONTACT_FROM_EMAIL) return json(503, { error: "not_configured" });

  const payload = buildPayload(input);
  try {
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: CONTACT_FROM_EMAIL,
        to: [CONTACT_TO_EMAIL],
        reply_to: payload.email,
        subject: oneLine(`[Contact Toboggo] ${payload.subject} — ${payload.name}`, 200),
        // texte brut uniquement : aucun HTML construit à partir de la saisie de l'utilisateur
        text: `Nom : ${oneLine(payload.name, 100)}\nE-mail : ${payload.email}\nSujet : ${payload.subject}\n\n${payload.message}`,
      }),
    });
    if (!res.ok) {
      console.error(`contact: Resend a répondu HTTP ${res.status}`);
      return json(502, { error: "upstream" });
    }
  } catch {
    console.error("contact: échec réseau vers Resend");
    return json(502, { error: "upstream" });
  }
  return json(200, { ok: true });
}
