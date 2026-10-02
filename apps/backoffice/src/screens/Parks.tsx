import { useOrgScope } from "../lib/orgScope";
import { AdminParks } from "./parks/AdminParks";
import { CommuneParks } from "./parks/CommuneParks";

/** One route, two surfaces: the admin keeps the original server-paginated
 * management table untouched; a collectivité gets the COLL-03 "patrimoine"
 * view (`CommuneParks`). */
export default function Parks() {
  const { isAdmin } = useOrgScope();
  return isAdmin ? <AdminParks /> : <CommuneParks />;
}
