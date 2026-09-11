/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Injecté par vite.config.ts depuis package.json — voir écran "À propos". */
declare const __APP_VERSION__: string;

declare module "*.module.css" {
  const classes: { [key: string]: string };
  export default classes;
}
