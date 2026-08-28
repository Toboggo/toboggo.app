import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "toboggo-theme";

export type Theme = "light" | "dark";

/** Applies data-theme on <html> and persists the choice, driving the CSS tokens in tokens.css. */
export function useTheme(): [Theme, (t: Theme) => void, () => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem(STORAGE_KEY) as Theme) || "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), []);

  return [theme, setTheme, toggle];
}
