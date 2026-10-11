import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { BackofficeApp } from "@toboggo/backoffice-core/BackofficeApp";
import { ErrorBoundary } from "@toboggo/backoffice-core/components/ErrorBoundary";
import ParkDetail from "@toboggo/backoffice-core/screens/ParkDetail";
import ValidationDetail from "@toboggo/backoffice-core/screens/ValidationDetail";
import Reports from "@toboggo/backoffice-core/screens/Reports";
import Reviews from "@toboggo/backoffice-core/screens/Reviews";
import Photos from "@toboggo/backoffice-core/screens/Photos";
import Settings from "@toboggo/backoffice-core/screens/Settings";
import AdminDashboard from "./screens/AdminDashboard";
import { AdminParks } from "./screens/parks/AdminParks";
import Validation from "./screens/Validation";
import Organizations from "./screens/Organizations";
import OrganizationDetail from "./screens/OrganizationDetail";
import Users from "./screens/Users";
import AppFeedback from "./screens/AppFeedback";

/** Wrapped separately so a screen-level render error is caught without
 * taking down the sidebar/shell around it — resets automatically when the
 * user navigates to a different route. */
export function RoutedContent() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Routes>
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/parks" element={<AdminParks />} />
        <Route path="/parks/:id" element={<ParkDetail />} />
        <Route path="/validation" element={<Validation />} />
        <Route path="/validation/:editId" element={<ValidationDetail />} />
        <Route path="/organizations" element={<Organizations />} />
        <Route path="/organizations/:id" element={<OrganizationDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/photos" element={<Photos />} />
        <Route path="/users" element={<Users />} />
        <Route path="/app-feedback" element={<AppFeedback />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <BackofficeApp surface="admin">
      <RoutedContent />
    </BackofficeApp>
  );
}
