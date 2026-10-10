/**
 * Vercel Function `POST /api/contact` : envoie le message du formulaire via Resend.
 * Toute la logique (validation, anti-spam, Resend) est dans src/lib/contactServer.ts, testée sans envoi réel.
 * Variables d'environnement (serveur uniquement) : RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL.
 */
import { handleContact } from "../src/lib/contactServer.js";

declare const process: { env: Record<string, string | undefined> };

export function POST(request: Request): Promise<Response> {
  return handleContact(request, process.env);
}
