import type { ReactNode } from "react";
import { PostHogProvider } from "@posthog/react";
import { getAnalyticsClient } from "./client";

/**
 * Wrapper de composition-root autour de `@posthog/react`'s `PostHogProvider`.
 *
 * Quand PostHog n'est pas configuré (`VITE_POSTHOG_KEY`/`VITE_POSTHOG_HOST`
 * absentes — le cas par défaut en dev local, CI, Simulator et sessions
 * Claude Code), `getAnalyticsClient()` renvoie `null` et ce composant rend
 * `children` directement : `PostHogProvider` n'est jamais monté,
 * `posthog.init()` n'est jamais appelé, aucune requête réseau n'est jamais
 * émise. `PostHogProvider` exige de toute façon `client` OU `apiKey` (union
 * discriminée côté types `@posthog/react`) — il ne peut de toute façon pas
 * être monté "vide".
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const client = getAnalyticsClient();
  if (!client) return <>{children}</>;
  return <PostHogProvider client={client}>{children}</PostHogProvider>;
}
