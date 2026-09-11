import { useSyncExternalStore } from "react";

const STORAGE_KEY = "toboggo-theme";

/** Choix actif — "system" suit `prefers-color-scheme`. */
export type ThemePreference = "system" | "light" | "dark";
/** Thème effectivement appliqué (résolu depuis la préférence). */
export type Theme = "light" | "dark";

/**
 * Applies data-theme on <html> and persists the choice, driving the CSS
 * tokens in tokens.css.
 *
 * Backed by a module-level store (not local React state) rather than a
 * plain `useState` hook: several screens read/set this independently (the
 * root App and the Apparence screen), and the "Système" preference must
 * keep tracking OS theme changes even while no settings screen is mounted.
 * A store shared via `useSyncExternalStore` keeps every caller in sync and
 * lets the `prefers-color-scheme` listener live for the app's whole
 * lifetime instead of a single component's.
 *
 * Local-only (localStorage) by design: the active theme must work in guest
 * mode and must not depend on a Supabase profile.
 */

const media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function systemTheme(): Theme {
  return media?.matches ? "dark" : "light";
}

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function resolveTheme(preference: ThemePreference): Theme {
  return preference === "system" ? systemTheme() : preference;
}

let preference: ThemePreference = readPreference();
let resolved: Theme = resolveTheme(preference);
const listeners = new Set<() => void>();

function applyToDocument() {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = resolved;
}
applyToDocument();

media?.addEventListener("change", () => {
  if (preference !== "system") return;
  resolved = systemTheme();
  applyToDocument();
  listeners.forEach((l) => l());
});

function setPreference(next: ThemePreference) {
  preference = next;
  resolved = resolveTheme(next);
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, next);
  applyToDocument();
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/**
 *   const [theme, preference, setPreference] = useTheme();
 *
 * `theme` : "light" | "dark" effectivement appliqué (utile pour un rendu
 * conditionnel). `preference` : le choix actif, "system" inclus — c'est lui
 * qu'il faut afficher/piloter dans l'écran Apparence.
 */
export function useTheme(): [Theme, ThemePreference, (p: ThemePreference) => void] {
  const pref = useSyncExternalStore(subscribe, () => preference, () => "system" as const);
  const theme = useSyncExternalStore(subscribe, () => resolved, () => "light" as const);
  return [theme, pref, setPreference];
}
