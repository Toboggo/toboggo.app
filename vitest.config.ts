import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Single root config for the monorepo's test suite (Lot 1 — audit §6 bis /
// §20). Mirrors the alias setup already used by apps/backoffice/vite.config.ts
// so shared/design-system can be imported the same way in tests as in the
// apps themselves.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@toboggo/design-system": path.resolve(__dirname, "packages/design-system/src"),
      "@toboggo/shared": path.resolve(__dirname, "packages/shared/src"),
    },
  },
  test: {
    // Default to "node": most of the suite (packages/shared) is pure logic
    // with no DOM. Only files that actually render/mount React need jsdom —
    // scoped below instead of paying that cost (and that global surface)
    // for every test file.
    environment: "node",
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "packages/shared/src/**/*.test.ts",
      "packages/design-system/src/**/*.test.{ts,tsx}",
      "apps/backoffice/src/**/*.test.{ts,tsx}",
      "apps/mobile/src/**/*.test.{ts,tsx}",
    ],
    // `packages/shared/src/utils/*.test.ts` is Node's built-in test runner
    // (`node --experimental-strip-types --test`, see that package's own `test`
    // script), not Vitest — excluded here so `npm run test` doesn't try to load
    // it as a Vitest suite (it has no `describe`/`it` and would report 0 tests).
    exclude: [...configDefaults.exclude, "packages/shared/src/utils/*.test.ts"],
  },
});
