import { create } from "zustand";
import {
  getSupabase,
  getSession,
  isSupabaseConfigured,
  onAuthStateChange,
  purgeDraftsForPrincipal,
  signOut as apiSignOut,
  type TeamMember,
  type Commune,
} from "@toboggo/shared";

export type ActiveOrg = { type: "admin" } | { type: "commune"; communeId: string };

/**
 * Which back office this session is for. `admin` keeps only the Toboggo staff
 * memberships (`organization_id IS NULL`), `collectivity` only the collectivité
 * memberships, `all` (legacy single app) keeps both — the historical behaviour.
 * A user with no membership of the requested kind is refused, whatever the
 * other kind they may have: the two apps never mix surfaces.
 */
export type BackofficeSurface = "admin" | "collectivity" | "all";

/** Why access was refused: no membership at all, or only memberships of the
 * other back office. */
export type AccessDeniedReason = "no-membership" | "wrong-surface";

interface OrgSessionState {
  userId: string | null;
  userName: string;
  userEmail: string;
  memberships: TeamMember[];
  communes: Commune[];
  activeOrg: ActiveOrg | null;
  loading: boolean;
  accessDenied: boolean;
  accessDeniedReason: AccessDeniedReason | null;
  surface: BackofficeSurface;
  init: (surface?: BackofficeSurface) => void;
  setActiveOrg: (org: ActiveOrg) => void;
  currentRole: () => TeamMember["role"] | null;
  isGestionnaireOrAbove: () => boolean;
  signOut: () => Promise<void>;
}

export const useOrgSession = create<OrgSessionState>((set, get) => ({
  userId: null,
  userName: "",
  userEmail: "",
  memberships: [],
  communes: [],
  activeOrg: null,
  loading: true,
  accessDenied: false,
  accessDeniedReason: null,
  surface: "all",
  init: (surface = "all") => {
    set({ surface });
    if (!isSupabaseConfigured()) {
      set({ loading: false });
      return;
    }
    async function load(userId: string, name: string, email: string) {
      set({ loading: true, accessDenied: false, accessDeniedReason: null });
      const supabase = getSupabase();
      const { data: memberships } = await supabase.from("team_members").select("*").eq("user_id", userId);
      const allRows = ((memberships ?? []) as TeamMember[]).map((r) => ({
        ...r,
        commune_id: r.commune_id ?? r.organization_id ?? null,
      }));
      const rows = allRows.filter(
        (r) => surface === "all" || (surface === "admin" ? r.commune_id === null : r.commune_id !== null),
      );
      if (rows.length === 0) {
        set({
          userId,
          userName: name,
          userEmail: email,
          memberships: [],
          loading: false,
          accessDenied: true,
          accessDeniedReason: allRows.length === 0 ? "no-membership" : "wrong-surface",
        });
        return;
      }
      const communeIds = rows.filter((r) => r.commune_id).map((r) => r.commune_id!) as string[];
      let communes: Commune[] = [];
      if (communeIds.length) {
        const { data } = await supabase.from("organizations").select("*").in("id", communeIds);
        communes = (data ?? []) as Commune[];
      }
      const isAdmin = rows.some((r) => r.commune_id === null);
      const defaultOrg: ActiveOrg = isAdmin ? { type: "admin" } : { type: "commune", communeId: communeIds[0] };
      set({ userId, userName: name, userEmail: email, memberships: rows, communes, activeOrg: defaultOrg, loading: false });
    }

    getSession().then((session) => {
      if (session?.user) {
        void load(session.user.id, session.user.user_metadata?.name ?? session.user.email!, session.user.email!);
      } else {
        set({ loading: false });
      }
    });

    onAuthStateChange((userId) => {
      const current = get().userId;

      // supabase-js re-emits SIGNED_IN / TOKEN_REFRESHED every time the tab
      // regains visibility (GoTrueClient._recoverAndRefresh), not only on a
      // real sign-in. Re-running load() on those would flip `loading` back to
      // true and, via App.tsx's full-screen loader, unmount the whole routed
      // tree — losing every in-progress form (LOT 3D audit §B.2). A same-user
      // session refresh needs no reload: memberships and org scope are only
      // ever established at a real sign-in.
      if (userId && userId === current) return;

      if (!userId) {
        set({
          userId: null,
          userName: "",
          userEmail: "",
          memberships: [],
          communes: [],
          activeOrg: null,
          loading: false,
          accessDenied: false,
          accessDeniedReason: null,
        });
        return;
      }

      // First sign-in, or a genuine account switch (A → B). load() flips
      // `loading` (spinner expected here) and replaces every field, so no
      // stale access data from the previous user survives.
      getSession().then((session) => {
        if (session?.user) void load(session.user.id, session.user.user_metadata?.name ?? session.user.email!, session.user.email!);
      });
    });
  },
  setActiveOrg: (org) => set({ activeOrg: org }),
  currentRole: () => {
    const { memberships, activeOrg } = get();
    if (!activeOrg) return null;
    const m = memberships.find((r) => (activeOrg.type === "admin" ? r.commune_id === null : r.commune_id === activeOrg.communeId));
    return m?.role ?? null;
  },
  isGestionnaireOrAbove: () => {
    const role = get().currentRole();
    return role === "gestionnaire" || role === "super_admin" || role === "moderation";
  },
  signOut: async () => {
    // Captured before the session is cleared — a shared-device logout must
    // remove only THIS account's local drafts (LOT 3D.F), never a guest's or
    // another signed-in user's.
    const userId = get().userId;
    await apiSignOut();
    if (userId) purgeDraftsForPrincipal({ userId });
    set({ userId: null, memberships: [], activeOrg: null });
  },
}));
