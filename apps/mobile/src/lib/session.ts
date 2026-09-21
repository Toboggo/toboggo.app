import { create } from "zustand";
import {
  getOrCreateProfile,
  getSession,
  isSupabaseConfigured,
  onAuthStateChange,
  toggleFavorite as apiToggleFavorite,
  updateProfile as apiUpdateProfile,
  type Profile,
} from "@toboggo/shared";
import { registerIsAuthenticated, trackEvent } from "./analytics";

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
  toggleFavorite: (parkId: string) => void;
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
      const current = get().userId;

      // supabase-js re-emits SIGNED_IN / TOKEN_REFRESHED every time the tab or
      // installed PWA regains visibility (GoTrueClient._recoverAndRefresh), not
      // only on a real sign-in. Re-running bootstrapProfile() on those would
      // flip `loading` back to true and, via App.tsx (`if (loading) return
      // null`), unmount the whole routed tree — losing every in-progress
      // contribution form (LOT 3D audit §B.2). A same-user session refresh
      // changes nothing we hold: the profile is untouched by a token rotation.
      if (userId && userId === current) return;

      if (!userId) {
        set({ userId: null, profile: null, loading: false });
        return;
      }

      // First sign-in (including the just-in-time login that resumes a guest
      // contribution) or a genuine account switch.
      getSession().then((session) => {
        if (session?.user) {
          void bootstrapProfile(session.user.id, session.user.user_metadata?.name, session.user.email!);
        }
      });
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
  // Single place every screen toggles a favourite through (map, "Autour de
  // vous", park detail, favorites list) so the heart is always in sync
  // everywhere it's shown. Applied optimistically against the *current* store
  // state (not a value captured at render time) so two hearts tapped back to
  // back — e.g. two cards in the carousel — can't race each other's pending
  // network write and silently drop one of the changes.
  toggleFavorite: (parkId) => {
    const { userId, profile } = get();
    if (!userId || !profile) return;
    const current = profile.favorites ?? [];
    const wasFavorite = current.includes(parkId);
    const next = wasFavorite ? current.filter((f) => f !== parkId) : [...current, parkId];
    set({ profile: { ...profile, favorites: next } });
    void apiToggleFavorite(userId, parkId, current)
      .then(() => {
        // `park_favorited` (P0) uniquement après confirmation serveur —
        // jamais sur le seul état optimiste ci-dessus, qui peut encore être
        // annulé par le `.catch` ci-dessous en cas d'échec réseau.
        // `park_unfavorited` est P1 : volontairement non câblé dans cette
        // passe d'instrumentation P0 (consigne explicite).
        if (!wasFavorite) trackEvent("park_favorited", { park_id: parkId });
      })
      .catch(() => {
        set((s) => {
          if (!s.profile) return s;
          const cur = s.profile.favorites ?? [];
          const reverted = next.includes(parkId) ? cur.filter((f) => f !== parkId) : [...cur, parkId];
          return { profile: { ...s.profile, favorites: reverted } };
        });
      });
  },
}));

// Câble `is_authenticated` (propriété commune analytics) sur ce store, sans
// que `lib/analytics` n'ait jamais à importer ce fichier — voir le
// commentaire de tête de `lib/analytics/commonProperties.ts` pour la raison
// (éviter un cycle `session.ts` → `analytics` → `session.ts`, puisque ce
// fichier importe déjà `trackEvent` ci-dessus). Un seul appel, au chargement
// du module ; la fonction injectée relit `useSession.getState()` à chaque
// événement tracké, jamais une valeur figée.
registerIsAuthenticated(() => useSession.getState().userId !== null);

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
