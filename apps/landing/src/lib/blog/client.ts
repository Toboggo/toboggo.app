/**
 * Clients Sanity du site. Exécutés UNIQUEMENT côté serveur / au build (frontmatter Astro, endpoints) :
 * rien ici n'est importé par un <script> navigateur, donc ni le jeton ni ces variables ne sont dans le bundle client.
 *
 * - Projet et dataset : identifiants publics (visibles dans toute requête vers cdn.sanity.io), valeurs par défaut en dur.
 * - SANITY_API_READ_TOKEN : jeton « Viewer » (lecture seule), SECRET, sans préfixe PUBLIC_. Optionnel pour le contenu
 *   publié si le dataset est public ; OBLIGATOIRE pour la prévisualisation des brouillons.
 */
import { createClient, type SanityClient } from "@sanity/client";

// process.env d'abord (Vercel : build et runtime), import.meta.env ensuite (.env.local en dev).
const readEnv = (name: string): string | undefined =>
  process.env[name] || (import.meta.env as Record<string, string | undefined> | undefined)?.[name] || undefined;

export const SANITY_PROJECT_ID = readEnv("SANITY_PROJECT_ID") ?? "1m1y03h0";
export const SANITY_DATASET = readEnv("SANITY_DATASET") ?? "production";
export const SANITY_API_VERSION = "2025-02-19";

export const sanityReadToken: string | undefined = readEnv("SANITY_API_READ_TOKEN");
const token = sanityReadToken;

const base = { projectId: SANITY_PROJECT_ID, dataset: SANITY_DATASET, apiVersion: SANITY_API_VERSION };

/** Contenu publié uniquement : les brouillons n'existent pas dans cette perspective. */
export const publishedClient: SanityClient = createClient({ ...base, useCdn: false, perspective: "published", token });

export const hasPreviewToken = Boolean(token);

/** Brouillons + publié (prévisualisation). Jamais de CDN, jamais mis en cache. */
export function previewClient(): SanityClient {
  if (!token) throw new Error("SANITY_API_READ_TOKEN manquant : prévisualisation indisponible.");
  return createClient({ ...base, useCdn: false, perspective: "drafts", token });
}
