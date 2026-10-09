import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useOrgSession } from "./lib/orgSession";
import { useIconSprite } from "@toboggo/design-system";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Login from "./screens/Login";
import AccessDenied from "./screens/AccessDenied";
import { Shell } from "./components/Shell";
import { RouteGuard, type RouteSurface } from "./components/RouteGuard";
import Dashboard from "./screens/Dashboard";
import Parks from "./screens/Parks";
import ParkNew from "./screens/parkNew/ParkNew";
import ParkDetail from "./screens/ParkDetail";
import Validation from "./screens/Validation";
import ValidationDetail from "./screens/ValidationDetail";
import Organizations from "./screens/Organizations";
import OrganizationDetail from "./screens/OrganizationDetail";
import Reports from "./screens/Reports";
import Reviews from "./screens/Reviews";
import Photos from "./screens/Photos";
import Users from "./screens/Users";
import AppFeedback from "./screens/AppFeedback";
import MapScreen from "./screens/MapScreen";
import Maintenance from "./screens/Maintenance";
import Journal from "./screens/Journal";
import Statistiques from "./screens/Statistiques";
import Settings from "./screens/Settings";

/** Route reserved to one surface (Admin Toboggo / collectivité) — see RouteGuard. */
function guarded(surface: RouteSurface, screen: ReactNode) {
  return <RouteGuard surface={surface}>{screen}</RouteGuard>;
}

/** Wrapped separately so a screen-level render error is caught without
 * taking down the sidebar/shell around it — resets automatically when the
 * user navigates to a different route. */
export function RoutedContent() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/parks" element={<Parks />} />
        <Route path="/parks/new" element={<ParkNew />} />
        <Route path="/parks/:id" element={<ParkDetail />} />
        {/* File globale : staff. `/validation/:editId` reste partagé : un gestionnaire
            y arrive depuis l'onglet « Modifications proposées » d'une fiche parc
            (canReviewParkEdit, RPC review_park_edit). */}
        <Route path="/validation" element={guarded("admin", <Validation />)} />
        <Route path="/validation/:editId" element={<ValidationDetail />} />
        <Route path="/organizations" element={guarded("admin", <Organizations />)} />
        <Route path="/organizations/:id" element={guarded("admin", <OrganizationDetail />)} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/photos" element={<Photos />} />
        <Route path="/users" element={guarded("admin", <Users />)} />
        <Route path="/app-feedback" element={guarded("admin", <AppFeedback />)} />
        <Route path="/map" element={guarded("organization", <MapScreen />)} />
        <Route path="/maintenance" element={guarded("organization", <Maintenance />)} />
        <Route path="/journal" element={guarded("organization", <Journal />)} />
        <Route path="/statistiques" element={guarded("organization", <Statistiques />)} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  const init = useOrgSession((s) => s.init);
  const loading = useOrgSession((s) => s.loading);
  const userId = useOrgSession((s) => s.userId);
  const accessDenied = useOrgSession((s) => s.accessDenied);
  useIconSprite(); // charge packages/design-system/src/icons/icons-sprite.svg (public/icons-sprite.svg)

  useEffect(() => {
    init();
  }, [init]);

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
        <Shell>
          <RoutedContent />
        </Shell>
      )}
    </ErrorBoundary>
  );
}
