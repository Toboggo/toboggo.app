import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AnalyticsProvider } from "./lib/analytics";
import App from "./App";
import "./i18n";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* No-op tant que VITE_POSTHOG_KEY/VITE_POSTHOG_HOST sont absentes (dev
        local, CI, Simulator, sessions Claude Code) — voir lib/analytics. */}
    <AnalyticsProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {/* i18next charge le namespace `common` de façon asynchrone au boot ;
              le fallback null reprend le comportement de l'écran de chargement. */}
          <Suspense fallback={null}>
            <App />
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </AnalyticsProvider>
  </React.StrictMode>,
);
