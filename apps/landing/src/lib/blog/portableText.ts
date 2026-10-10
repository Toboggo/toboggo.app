/**
 * Contenu riche → HTML statique (donc présent dans la page livrée, indexable). Tout texte est échappé par
 * @portabletext/to-html ; les liens sont filtrés (http/https/mailto/relatif) et les images passent par le CDN Sanity.
 */
import { escapeHTML, toHTML, uriLooksSafe, type PortableTextComponents } from "@portabletext/to-html";
import { sanityImage, sanitySrcset } from "./images";

interface ImageValue {
  url?: string;
  width?: number;
  height?: number;
  alt?: string;
  caption?: string;
}

const components: PortableTextComponents = {
  types: {
    image: ({ value }) => {
      const img = value as ImageValue;
      if (!img.url) return "";
      const ratio = img.width && img.height ? img.width / img.height : undefined;
      const dims = ratio ? ` width="800" height="${Math.round(800 / ratio)}"` : "";
      const figure =
        `<img src="${escapeHTML(sanityImage(img.url, { w: 800 }))}" srcset="${escapeHTML(sanitySrcset(img.url, [400, 800, 1200]))}" ` +
        `sizes="(min-width: 800px) 720px, calc(100vw - 48px)" alt="${escapeHTML(img.alt ?? "")}"${dims} loading="lazy" decoding="async" />`;
      return `<figure>${figure}${img.caption ? `<figcaption>${escapeHTML(img.caption)}</figcaption>` : ""}</figure>`;
    },
  },
  marks: {
    link: ({ children, value }) => {
      const href = String((value as { href?: string })?.href ?? "");
      if (!uriLooksSafe(href)) return String(children);
      const external = /^https?:\/\//i.test(href);
      return `<a href="${escapeHTML(href)}"${external ? ' rel="noopener noreferrer" target="_blank"' : ""}>${children}</a>`;
    },
  },
};

export function renderBody(body: unknown[] | null | undefined): string {
  if (!body?.length) return "";
  return toHTML(body as Parameters<typeof toHTML>[0], { components, onMissingComponent: false });
}
