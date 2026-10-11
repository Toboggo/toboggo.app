import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@toboggo/design-system": path.resolve(__dirname, "../../packages/design-system/src"),
      "@toboggo/shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@toboggo/backoffice-core": path.resolve(__dirname, "../../packages/backoffice-core/src"),
    },
  },
  optimizeDeps: {
    exclude: ["@toboggo/design-system", "@toboggo/shared", "@toboggo/backoffice-core"],
  },
  plugins: [react()],
  server: { port: 5174 },
});
