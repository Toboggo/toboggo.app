import { useOrgScope } from "../lib/orgScope";
import AdminDashboard from "./AdminDashboard";
import CommuneDashboard from "./CommuneDashboard";

/** One route, two dashboards: Toboggo Admin gets the platform cockpit
 * (`AdminDashboard`, Admin-UI), a collectivité its own operational view
 * (`CommuneDashboard`, COLL-02). They share no layout and no state. */
export default function Dashboard() {
  const { isAdmin } = useOrgScope();
  return isAdmin ? <AdminDashboard /> : <CommuneDashboard />;
}
