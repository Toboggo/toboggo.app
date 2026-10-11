import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { BackofficeApp } from "@toboggo/backoffice-core/BackofficeApp";
import { ErrorBoundary } from "@toboggo/backoffice-core/components/ErrorBoundary";
import { RouteGuard, type RouteSurface } from "@toboggo/backoffice-core/components/RouteGuard";
import Dashboard from "./screens/Dashboard";
import Parks from "./screens/Parks";
import ParkNew from "../../backoffice-collectivity/src/screens/parkNew/ParkNew";
import ParkDetail from "@toboggo/backoffice-core/screens/ParkDetail";
import Validation from "../../backoffice-admin/src/screens/Validation";
import ValidationDetail from "@toboggo/backoffice-core/screens/ValidationDetail";
import Organizations from "../../backoffice-admin/src/screens/Organizations";
import OrganizationDetail from "../../backoffice-admin/src/screens/OrganizationDetail";
import Reports from "@toboggo/backoffice-core/screens/Reports";
import Reviews from "@toboggo/backoffice-core/screens/Reviews";
import Photos from "@toboggo/backoffice-core/screens/Photos";
import Users from "../../backoffice-admin/src/screens/Users";
import AppFeedback from "../../backoffice-admin/src/screens/AppFeedback";
import MapScreen from "../../backoffice-collectivity/src/screens/MapScreen";
import Maintenance from "../../backoffice-collectivity/src/screens/Maintenance";
import Journal from "../../backoffice-collectivity/src/screens/Journal";
import Statistiques from "../../backoffice-collectivity/src/screens/Statistiques";
import Settings from "@toboggo/backoffice-core/screens/Settings";

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
  return (
    <BackofficeApp surface="all">
      <RoutedContent />
    </BackofficeApp>
  );
}
