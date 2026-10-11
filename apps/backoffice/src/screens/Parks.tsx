import { useOrgScope } from "@toboggo/backoffice-core/lib/orgScope";
import { AdminParks } from "../../../backoffice-admin/src/screens/parks/AdminParks";
import { CommuneParks } from "../../../backoffice-collectivity/src/screens/parks/CommuneParks";

/** One route, two surfaces: the admin keeps the original server-paginated
 * management table untouched; a collectivité gets the COLL-03 "patrimoine"
 * view (`CommuneParks`). */
export default function Parks() {
  const { isAdmin } = useOrgScope();
  return isAdmin ? <AdminParks /> : <CommuneParks />;
}
