import type { APIRoute } from "astro";
import { validatePreviewUrl } from "@sanity/preview-url-secret";
import { hasPreviewToken, previewClient } from "../../../lib/blog/client";
import { createPreviewCookieValue, PREVIEW_COOKIE, previewCookieOptions, safePreviewRedirect } from "../../../lib/blog/previewSession";

export const prerender = false;

/** Active la prévisualisation : valide le secret généré par le Studio, pose le cookie, redirige vers /apercu/<slug>/. */
export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  if (!hasPreviewToken) return new Response("Prévisualisation non configurée.", { status: 501, headers: { "Cache-Control": "no-store" } });
  const { isValid, redirectTo } = await validatePreviewUrl(previewClient(), request.url);
  if (!isValid) return new Response("Lien de prévisualisation invalide ou expiré.", { status: 401, headers: { "Cache-Control": "no-store" } });
  cookies.set(PREVIEW_COOKIE, createPreviewCookieValue(), previewCookieOptions);
  return redirect(safePreviewRedirect(redirectTo), 307);
};
