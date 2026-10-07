// Génère le visuel Open Graph par défaut des fiches parc sans photo
// (apps/mobile/public/og/park-fallback.png, 1200×630).
// Composition : fond blanc, vrai logotype Toboggo (docs/brand-assets/02-wordmark-toboggo.png),
// bandeau vert de la charte (--color-primary #2FA37C). Aucun beige.
// Usage : node scripts/og/build-park-og-fallback.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const W = 1200;
const H = 630;
const BAND = 36;
const GREEN = "#2FA37C";

const wordmark = await sharp(path.join(root, "docs/brand-assets/02-wordmark-toboggo.png"))
  .resize({ width: 760 })
  .png()
  .toBuffer();
const meta = await sharp(wordmark).metadata();

await sharp({ create: { width: W, height: H, channels: 4, background: "#FFFFFF" } })
  .composite([
    { input: Buffer.from(`<svg width="${W}" height="${BAND}"><rect width="${W}" height="${BAND}" fill="${GREEN}"/></svg>`), top: H - BAND, left: 0 },
    { input: wordmark, left: Math.round((W - (meta.width ?? 760)) / 2), top: Math.round((H - BAND - (meta.height ?? 225)) / 2) },
  ])
  .png({ compressionLevel: 9 })
  .toFile(path.join(root, "apps/mobile/public/og/park-fallback.png"));
console.log("ok");
