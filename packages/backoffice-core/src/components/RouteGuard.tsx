import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useOrgScope } from "../lib/orgScope";

/**
 * Which surface a route belongs to. `admin` = Toboggo staff (`activeOrg.type
 * === "admin"`), `organization` = a collectivité (`activeOrg.type ===
 * "commune"`). Routes used by both are simply not wrapped.
 *
 * UI-level protection only: it keeps the wrong surface from rendering a
 * half-working screen on a typed URL / old bookmark. The data stays protected
 * by RLS, never by this component.
 */
export type RouteSurface = "admin" | "organization";

/** Same behaviour as the pre-existing `AppFeedback` guard: back to the
 * dashboard of the surface the user is actually on. */
export function RouteGuard({ surface, children }: { surface: RouteSurface; children: ReactNode }) {
  const { isAdmin, activeOrg } = useOrgScope();
  if (!activeOrg) return null;
  if ((surface === "admin") !== !!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
