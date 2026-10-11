import type { APIRoute } from "astro";
import { handleContact } from "../../lib/contactServer";

export const prerender = false;

/**
 * `POST /api/contact/` : envoie le message du formulaire via Resend.
 * Toute la logique (validation, anti-spam, Resend) est dans src/lib/contactServer.ts, testée sans envoi réel.
 * Variables d'environnement (serveur uniquement) : RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL.
 *
 * Route Astro (et non plus `api/contact.ts` à la racine) : avec l'adapter @astrojs/vercel, Vercel déploie uniquement
 * `.vercel/output` et ignore le dossier `api/`.
 */
export const POST: APIRoute = ({ request }) => handleContact(request, process.env);
