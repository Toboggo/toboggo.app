import { create } from "zustand";
import {
  getOrCreateProfile,
  getSession,
  isSupabaseConfigured,
  onAuthStateChange,
  updateProfile as apiUpdateProfile,
  type Profile,
} from "@toboggo/shared";

interface SessionState {
  userId: string | null;
  profile: Profile | null;
  loading: boolean;
  guestMode: boolean;
  /** Stashed callback to resume a contribution action after a just-in-time login (requireAccount pattern). */
  pendingResume: (() => void) | null;
  init: () => void;
  setGuestMode: (v: boolean) => void;
  setPendingResume: (fn: (() => void) | null) => void;
  refreshProfile: () => Promise<void>;
  patchProfile: (patch: Partial<Profile>) => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  userId: null,
  profile: null,
  loading: true,
  guestMode: false,
  pendingResume: null,
  init: () => {
    if (!isSupabaseConfigured()) {
      set({ loading: false });
      return;
    }
    getSession()
      .then((session) => {
        if (session?.user) {
          void bootstrapProfile(session.user.id, session.user.user_metadata?.name, session.user.email!);
        } else {
          set({ loading: false });
        }
      })
      .catch(() => set({ loading: false }));

    onAuthStateChange((userId) => {
      if (userId) {
        getSession().then((session) => {
          if (session?.user) {
            void bootstrapProfile(session.user.id, session.user.user_metadata?.name, session.user.email!);
          }
        });
      } else {
        set({ userId: null, profile: null, loading: false });
      }
    });

    async function bootstrapProfile(userId: string, name: string | undefined, email: string) {
      set({ loading: true });
      try {
        const profile = await getOrCreateProfile(userId, name || email.split("@")[0], email);
        set({ userId, profile, loading: false });
        const resume = get().pendingResume;
        if (resume) {
          set({ pendingResume: null });
          resume();
        }
      } catch {
        set({ loading: false });
      }
    }
  },
  setGuestMode: (v) => set({ guestMode: v }),
  setPendingResume: (fn) => set({ pendingResume: fn }),
  refreshProfile: async () => {
    const { userId } = get();
    if (!userId) return;
  },
  patchProfile: async (patch) => {
    const { userId, profile } = get();
    if (!userId || !profile) return;
    const updated = await apiUpdateProfile(userId, patch);
    set({ profile: updated });
  },
}));

/** Central gate: contribution actions (add/rate/report/favorite/group) require
 * an account. Guests get routed to auth and resumed after login — mirrors the
 * prototype's requireAccount()/_pendingResume pattern. */
export function requireAccount(navigate: (path: string) => void, action: () => void) {
  const { userId, setPendingResume } = useSession.getState();
  if (userId) {
    action();
    return;
  }
  setPendingResume(action);
  navigate("/login");
}
