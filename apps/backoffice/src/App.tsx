import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useOrgSession } from "./lib/orgSession";
import { useIconSprite } from "@toboggo/design-system";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Login from "./screens/Login";
import AccessDenied from "./screens/AccessDenied";
import { Shell } from "./components/Shell";
import Dashboard from "./screens/Dashboard";
import Parks from "./screens/Parks";
import ParkDetail from "./screens/ParkDetail";
import Reports from "./screens/Reports";
import Reviews from "./screens/Reviews";
import Photos from "./screens/Photos";
import Users from "./screens/Users";
import MapScreen from "./screens/MapScreen";
import Maintenance from "./screens/Maintenance";
import Journal from "./screens/Journal";
import Statistiques from "./screens/Statistiques";
import Settings from "./screens/Settings";

/** Wrapped separately so a screen-level render error is caught without
 * taking down the sidebar/shell around it — resets automatically when the
 * user navigates to a different route. */
function RoutedContent() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/parks" element={<Parks />} />
        <Route path="/parks/:id" element={<ParkDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/photos" element={<Photos />} />
        <Route path="/users" element={<Users />} />
        <Route path="/map" element={<MapScreen />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/statistiques" element={<Statistiques />} />
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
