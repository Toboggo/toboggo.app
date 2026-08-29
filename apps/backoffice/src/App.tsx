import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useOrgSession } from "./lib/orgSession";
import { useIconSprite } from "@toboggo/design-system";
import Login from "./screens/Login";
import AccessDenied from "./screens/AccessDenied";
import { Shell } from "./components/Shell";
import Dashboard from "./screens/Dashboard";
import Parks from "./screens/Parks";
import Reports from "./screens/Reports";
import Reviews from "./screens/Reviews";
import Users from "./screens/Users";
import MapScreen from "./screens/MapScreen";
import Maintenance from "./screens/Maintenance";
import Journal from "./screens/Journal";
import Statistiques from "./screens/Statistiques";
import Settings from "./screens/Settings";

export default function App() {
  const init = useOrgSession((s) => s.init);
  const loading = useOrgSession((s) => s.loading);
  const userId = useOrgSession((s) => s.userId);
  const accessDenied = useOrgSession((s) => s.accessDenied);
  useIconSprite(); // charge packages/design-system/src/icons/icons-sprite.svg (public/icons-sprite.svg)

  useEffect(() => {
    init();
  }, [init]);

  if (loading) return null;
  if (!userId) return <Login />;
  if (accessDenied) return <AccessDenied />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/parks" element={<Parks />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/users" element={<Users />} />
        <Route path="/map" element={<MapScreen />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/statistiques" element={<Statistiques />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
