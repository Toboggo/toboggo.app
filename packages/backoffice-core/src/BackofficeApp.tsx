import { useEffect, type ReactNode } from "react";
import { useIconSprite } from "@toboggo/design-system";
import { useOrgSession, type BackofficeSurface } from "./lib/orgSession";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Shell } from "./components/Shell";
import Login from "./screens/Login";
import AccessDenied from "./screens/AccessDenied";

/**
 * Session gate + Shell shared by every back-office app: loading → login →
 * access denied → Shell around the app's own routes (`children`). `surface`
 * restricts the memberships the session accepts (see `BackofficeSurface`).
 */
export function BackofficeApp({ surface, children }: { surface: BackofficeSurface; children: ReactNode }) {
  const init = useOrgSession((s) => s.init);
  const loading = useOrgSession((s) => s.loading);
  const userId = useOrgSession((s) => s.userId);
  const accessDenied = useOrgSession((s) => s.accessDenied);
  useIconSprite(); // loads packages/design-system/src/icons/icons-sprite.svg (public/icons-sprite.svg of the app)

  useEffect(() => {
    init(surface);
  }, [init, surface]);

  return (
    <ErrorBoundary>
      {loading ? (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-muted)",
            fontSize: 13.5,
          }}
        >
          Chargement…
        </div>
      ) : !userId ? (
        <Login />
      ) : accessDenied ? (
        <AccessDenied />
      ) : (
        <Shell>{children}</Shell>
      )}
    </ErrorBoundary>
  );
}
