// Public entry points of the shared back-office code. Most modules are consumed
// through sub-paths (`@toboggo/backoffice-core/lib/orgScope`, …) — the alias is
// declared in each app's vite/tsconfig/vitest config.
export { BackofficeApp } from "./BackofficeApp";
export { mountBackoffice } from "./mountBackoffice";
export { queryClient } from "./lib/queryClient";
