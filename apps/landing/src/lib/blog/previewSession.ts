/**
 * Session de prévisualisation : cookie HttpOnly signé (HMAC-SHA256) avec le jeton de lecture Sanity comme clé,
 * donc infalsifiable sans le jeton, sans variable secrète supplémentaire. Valable 1 h, limité à /apercu/.
 * Il n'est posé qu'après validation, par le site, d'un secret créé dans le Studio par un éditeur authentifié.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { sanityReadToken } from "./client";

export const PREVIEW_COOKIE = "toboggo_preview";
export const PREVIEW_PATH = "/apercu/";
const TTL_SECONDS = 3600;

const sign = (expires: string, key: string) => createHmac("sha256", key).update(`preview:${expires}`).digest("hex");

export function createPreviewCookieValue(now = Date.now(), key = sanityReadToken): string {
  if (!key) throw new Error("SANITY_API_READ_TOKEN manquant.");
  const expires = String(Math.floor(now / 1000) + TTL_SECONDS);
  return `${expires}.${sign(expires, key)}`;
}

export function isValidPreviewCookie(value: string | undefined, now = Date.now(), key = sanityReadToken): boolean {
  if (!value || !key) return false;
  const [expires, mac] = value.split(".");
  if (!expires || !mac || !/^\d+$/.test(expires) || Number(expires) < Math.floor(now / 1000)) return false;
  const expected = Buffer.from(sign(expires, key));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const previewCookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: PREVIEW_PATH, maxAge: TTL_SECONDS } as const;

/** Seul un chemin interne /apercu/… est une destination de redirection acceptable. */
export function safePreviewRedirect(target: string | undefined): string {
  return target && /^\/apercu\/[a-z0-9-]+\/$/i.test(target) ? target : "/guides/";
}
