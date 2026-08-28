import { create } from "zustand";
import { getSupabase, getSession, isSupabaseConfigured, onAuthStateChange, signOut as apiSignOut, type TeamMember, type Commune } from "@toboggo/shared";

export type ActiveOrg = { type: "admin" } | { type: "commune"; communeId: string };

interface OrgSessionState {
  userId: string | null;
  userName: string;
  userEmail: string;
  memberships: TeamMember[];
  communes: Commune[];
  activeOrg: ActiveOrg | null;
  loading: boolean;
  accessDenied: boolean;
  init: () => void;
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
  init: () => {
    if (!isSupabaseConfigured()) {
      set({ loading: false });
      return;
    }
    async function load(userId: string, name: string, email: string) {
      set({ loading: true, accessDenied: false });
      const supabase = getSupabase();
      const { data: memberships } = await supabase.from("team_members").select("*").eq("user_id", userId);
      const rows = ((memberships ?? []) as TeamMember[]).map((r) => ({
        ...r,
        commune_id: r.commune_id ?? r.organization_id ?? null,
      }));
      if (rows.length === 0) {
        set({ userId, userName: name, userEmail: email, memberships: [], loading: false, accessDenied: true });
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
      if (!userId) {
        set({ userId: null, memberships: [], activeOrg: null, loading: false, accessDenied: false });
        return;
      }
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
    await apiSignOut();
    set({ userId: null, memberships: [], activeOrg: null });
  },
}));
