/**
 * Fonction Vercel — `/park/:id` rewritée ici (voir vercel.json).
 *
 * Sert le shell de l'app (`dist/index.html`) avec des métadonnées Open Graph /
 * Twitter Card propres au parc, présentes dans le HTML initial : les robots
 * d'aperçu de lien (iMessage, WhatsApp, Slack…) n'exécutent pas JavaScript.
 * Le client React prend ensuite le relais et ouvre la fiche, sans connexion.
 *
 * Données : vue publique `park_public` via l'API REST Supabase avec la clé
 * `anon` (déjà publique, lecture seule) — uniquement les parcs publiés et leurs
 * photos validées (`park_media.status = 'approved'`). Aucun secret.
 * Texte : mêmes règles et mêmes catalogues FR/EN/ES que le partage in-app.
 * Langue : paramètre explicite `?lang=` du lien (FR par défaut). Le cache CDN
 * étant indexé sur l'URL complète, une langue n'est jamais servie à la place
 * d'une autre.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getParkDisplayName } from "../../../packages/shared/src/utils/parkName.js";
import { buildShareDescription } from "../src/lib/parkShare.js";

const LANGS = ["fr", "en", "es"] as const;
type Lang = (typeof LANGS)[number];
const INTL: Record<Lang, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES" };
const OG_LOCALE: Record<Lang, string> = { fr: "fr_FR", en: "en_GB", es: "es_ES" };
const DEFAULT_PUBLIC_APP_URL = "https://toboggo-app.vercel.app";
const SITE_NAME = "Toboggo";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

type Catalog = Record<string, unknown>;

function readCatalog(lang: Lang, ns: string): Catalog {
  const rel = join("src", "i18n", "locales", lang, `${ns}.json`);
  for (const base of [process.cwd(), join(process.cwd(), "apps", "mobile")]) {
    try {
      return JSON.parse(readFileSync(join(base, rel), "utf-8")) as Catalog;
    } catch {
      // essai suivant
    }
  }
  return {};
}

function lookup(catalog: Catalog, key: string): string | undefined {
  let cur: unknown = catalog;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Catalog)) cur = (cur as Catalog)[part];
    else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Traducteur minimal : namespaces common/contribute, interpolation `{{x}}`, pluriel `_one`/`_other`. */
function makeT(lang: Lang) {
  const catalogs: Record<string, Catalog> = { common: readCatalog(lang, "common"), contribute: readCatalog(lang, "contribute") };
  const plural = new Intl.PluralRules(INTL[lang]);
  return (key: string, options: Record<string, unknown> = {}): string => {
    const ns = typeof options.ns === "string" ? options.ns : "contribute";
    const catalog = catalogs[ns] ?? {};
    let template =
      typeof options.count === "number"
        ? lookup(catalog, `${key}_${plural.select(options.count)}`) ?? lookup(catalog, `${key}_other`)
        : undefined;
    template ??= lookup(catalog, key) ?? key;
    return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ""));
  };
}

/** Langue explicite du lien partagé (`?lang=en|es`) ; tout le reste → FR. Jamais d'en-tête : le rendu est déterministe par URL. */
function pickLang(param: string | null): Lang {
  const code = (param ?? "").trim().toLowerCase();
  return (LANGS as readonly string[]).includes(code) ? (code as Lang) : "fr";
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface ParkRow {
  id: string;
  name: string | null;
  address_line: string | null;
  city: string | null;
  rating: number | null;
  review_count: number | null;
  cover_photo: string | null;
  photos: string[] | null;
}

type Lookup = { kind: "found"; park: ParkRow } | { kind: "missing" } | { kind: "error" };

async function fetchPark(id: string): Promise<Lookup> {
  const base = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return { kind: "error" };
  try {
    const url = new URL("/rest/v1/park_public", base);
    url.searchParams.set("select", "id,name,address_line,city,rating,review_count,cover_photo,photos");
    url.searchParams.set("id", `eq.${id}`);
    url.searchParams.set("limit", "1");
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000) });
    if (res.status === 400) return { kind: "missing" }; // id mal formé pour la colonne uuid
    if (!res.ok) return { kind: "error" };
    const rows = (await res.json()) as ParkRow[];
    return rows[0] ? { kind: "found", park: rows[0] } : { kind: "missing" };
  } catch {
    return { kind: "error" };
  }
}

/** Photo principale publique et validée (vue `park_public`), en URL https absolue. */
function mainPhoto(park: ParkRow, supabaseBase: string | undefined): string | null {
  const raw = park.cover_photo || park.photos?.[0];
  if (!raw) return null;
  try {
    const url = new URL(raw, supabaseBase);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function loadShell(origin: string): Promise<string> {
  for (const base of [process.cwd(), join(process.cwd(), "apps", "mobile")]) {
    try {
      return readFileSync(join(base, "dist", "index.html"), "utf-8");
    } catch {
      // essai suivant
    }
  }
  const res = await fetch(new URL("/index.html", origin), { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`index.html ${res.status}`);
  return res.text();
}

function injectMeta(
  html: string,
  m: { lang: Lang; generic?: boolean; title: string; description: string; url: string; image: string; imageAlt: string; noindex: boolean },
): string {
  const tags = [
    m.noindex ? `<meta name="robots" content="noindex" />` : null,
    `<link rel="canonical" href="${esc(m.url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="${OG_LOCALE[m.lang]}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${esc(m.url)}" />`,
    `<meta property="og:image" content="${esc(m.image)}" />`,
    `<meta property="og:image:alt" content="${esc(m.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${esc(m.image)}" />`,
    `<meta name="twitter:image:alt" content="${esc(m.imageAlt)}" />`,
  ].filter(Boolean);
  return html
    .replace(/<html lang="[^"]*"/, `<html lang="${m.lang}"`)
    .replace(/<title>[\s\S]*?<\/title>/, m.generic ? `<title>${SITE_NAME}</title>` : `<title>${esc(m.title)} — ${SITE_NAME}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(m.description)}" />`)
    .replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
}

async function handle(request: Request, shellRef: { html?: string }): Promise<Response> {
  {
    const reqUrl = new URL(request.url);
    const rawId = reqUrl.searchParams.get("id") ?? reqUrl.pathname.split("/").filter(Boolean).pop() ?? "";
    const id = ID_RE.test(rawId) ? rawId : "";
    const lang = pickLang(reqUrl.searchParams.get("lang"));
    const t = makeT(lang);

    // Production : origine publique configurée ; Preview : l'hôte du déploiement,
    // pour que canonical et images restent cohérents et vérifiables.
    const publicOrigin = process.env.VITE_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL;
    const origin = process.env.VERCEL_ENV === "production" ? publicOrigin : reqUrl.origin;
    const canonicalUrl = new URL(`/park/${encodeURIComponent(id || rawId)}`, origin);
    if (lang !== "fr") canonicalUrl.searchParams.set("lang", lang);
    const fallbackImage = new URL("/og/park-fallback.png", origin).toString();

    const lookupResult = id ? await fetchPark(id) : ({ kind: "missing" } as Lookup);
    const found = lookupResult.kind === "found" ? lookupResult.park : null;

    let shell: string;
    try {
      shell = await loadShell(reqUrl.origin);
    } catch {
      return new Response("Service indisponible", { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    shellRef.html = shell;

    const supabaseBase = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const photo = found ? mainPhoto(found, supabaseBase) : null;
    const fmt = new Intl.NumberFormat(INTL[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const name = found ? getParkDisplayName({ ...found, name: found.name ?? "" }, t) : SITE_NAME;
    // Parc non trouvé OU base injoignable : métadonnées génériques, le shell est
    // toujours servi pour que la fiche reste accessible (le client retente).
    const description = found
      ? buildShareDescription(
          { name, address_line: found.address_line, city: found.city, rating: found.rating ?? 0, review_count: found.review_count ?? 0 },
          t,
          (n) => fmt.format(n),
        )
      : t("share.metaFallback");

    const html = injectMeta(shell, {
      lang,
      title: name,
      generic: !found,
      description,
      url: canonicalUrl.toString(),
      image: photo ?? fallbackImage,
      imageAlt: found && photo ? name : SITE_NAME,
      noindex: lookupResult.kind === "missing",
    });

    // Parc introuvable : l'app affiche son propre état « introuvable » ; 404 court
    // en cache. Erreur transitoire de la base : jamais mise en cache.
    const status = lookupResult.kind === "missing" ? 404 : 200;
    const cache =
      lookupResult.kind === "found"
        ? "public, max-age=0, s-maxage=300, stale-while-revalidate=3600"
        : lookupResult.kind === "missing"
          ? "public, max-age=0, s-maxage=60"
          : "no-store";
    return new Response(html, {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache },
    });
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const shellRef: { html?: string } = {};
    try {
      return await handle(request, shellRef);
    } catch {
      // Repli : toute erreur inattendue après lecture du shell → l'app seule
      // (métadonnées génériques d'index.html), jamais une page d'erreur.
      if (shellRef.html) {
        return new Response(shellRef.html, {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      return new Response("Service indisponible", { status: 502, headers: { "Cache-Control": "no-store" } });
    }
  },
};
