import { useOrgScope } from "@toboggo/backoffice-core/lib/orgScope";
import AdminDashboard from "../../../backoffice-admin/src/screens/AdminDashboard";
import CommuneDashboard from "../../../backoffice-collectivity/src/screens/CommuneDashboard";

/** One route, two dashboards: Toboggo Admin gets the platform cockpit
 * (`AdminDashboard`, Admin-UI), a collectivité its own operational view
 * (`CommuneDashboard`, COLL-02). They share no layout and no state. */
export default function Dashboard() {
  const { isAdmin } = useOrgScope();
  return isAdmin ? <AdminDashboard /> : <CommuneDashboard />;
}
