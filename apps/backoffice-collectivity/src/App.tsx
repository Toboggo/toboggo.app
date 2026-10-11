import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { BackofficeApp } from "@toboggo/backoffice-core/BackofficeApp";
import { ErrorBoundary } from "@toboggo/backoffice-core/components/ErrorBoundary";
import ParkDetail from "@toboggo/backoffice-core/screens/ParkDetail";
import ValidationDetail from "@toboggo/backoffice-core/screens/ValidationDetail";
import Reports from "@toboggo/backoffice-core/screens/Reports";
import Reviews from "@toboggo/backoffice-core/screens/Reviews";
import Photos from "@toboggo/backoffice-core/screens/Photos";
import Settings from "@toboggo/backoffice-core/screens/Settings";
import CommuneDashboard from "./screens/CommuneDashboard";
import { CommuneParks } from "./screens/parks/CommuneParks";
import ParkNew from "./screens/parkNew/ParkNew";
import MapScreen from "./screens/MapScreen";
import Maintenance from "./screens/Maintenance";
import Journal from "./screens/Journal";
import Statistiques from "./screens/Statistiques";

/** Wrapped separately so a screen-level render error is caught without
 * taking down the sidebar/shell around it — resets automatically when the
 * user navigates to a different route. */
export function RoutedContent() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Routes>
        <Route path="/" element={<CommuneDashboard />} />
        <Route path="/parks" element={<CommuneParks />} />
        <Route path="/parks/new" element={<ParkNew />} />
        <Route path="/parks/:id" element={<ParkDetail />} />
        {/* `/validation/:editId` : un gestionnaire y arrive depuis l'onglet
            « Modifications proposées » d'une fiche parc (canReviewParkEdit, RPC
            review_park_edit). La liste globale `/validation` est Admin. */}
        <Route path="/validation/:editId" element={<ValidationDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/photos" element={<Photos />} />
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
  return (
    <BackofficeApp surface="collectivity">
      <RoutedContent />
    </BackofficeApp>
  );
}
