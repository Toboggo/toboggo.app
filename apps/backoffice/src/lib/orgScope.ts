import { useOrgSession } from "./orgSession";

/** Resolves the current activeOrg into a scope usable by shared API calls:
 * admin sees everything (communeId undefined), a commune user is scoped to
 * their commune_id. */
export function useOrgScope() {
  const activeOrg = useOrgSession((s) => s.activeOrg);
  const isAdmin = activeOrg?.type === "admin";
  const communeId = activeOrg?.type === "commune" ? activeOrg.communeId : undefined;
  return { isAdmin, communeId, activeOrg };
}
