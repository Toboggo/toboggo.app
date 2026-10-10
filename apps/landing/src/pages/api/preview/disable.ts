import type { APIRoute } from "astro";
import { PREVIEW_COOKIE, PREVIEW_PATH } from "../../../lib/blog/previewSession";

export const prerender = false;

export const GET: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(PREVIEW_COOKIE, { path: PREVIEW_PATH });
  return redirect("/guides/", 307);
};
