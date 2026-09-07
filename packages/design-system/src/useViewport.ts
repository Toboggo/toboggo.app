import { useEffect, useState } from "react";

/**
 * Live viewport height in CSS pixels.
 *
 * Reads `window.innerHeight` — which on iOS is stable while the soft keyboard is
 * open and already reflects the standalone (chrome-less) viewport — but re-reads
 * it on the events iOS standalone actually fires after launch / rotation, where a
 * bare `window` "resize" is unreliable. Falls back to a sane default during SSR.
 *
 * This replaces a one-shot `window.innerHeight` captured at mount, which could
 * stay stale in an installed PWA (no "resize" fired once the launch splash
 * cleared).
 */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight,
  );

  useEffect(() => {
    const sync = () => setHeight(window.innerHeight);
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.addEventListener("pageshow", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener("pageshow", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, []);

  return height;
}

const BOTTOM_NAV_FALLBACK = 65;

function readBottomNavHeight(): number {
  if (typeof document === "undefined") return BOTTOM_NAV_FALLBACK;
  // Resolve the CSS token to concrete pixels (it is `calc(65px + env(...))`,
  // so it can't be read from getPropertyValue directly).
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:var(--bottom-nav-h)";
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px > 0 ? px : BOTTOM_NAV_FALLBACK;
}

/**
 * Resolved pixel height of the bottom navigation, tracking the CSS token
 * `--bottom-nav-h` (= `--bottom-nav-content-h` + `safe-area-inset-bottom`).
 *
 * Single source of truth shared by the bottom sheet (`bottomInset`) and the map
 * camera insets, so the hardcoded "~78px" nav-height guesses can be removed and
 * the sheet / map / nav can never disagree about where the nav starts.
 */
export function useBottomNavHeight(): number {
  const [height, setHeight] = useState(readBottomNavHeight);

  useEffect(() => {
    const sync = () => setHeight(readBottomNavHeight());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, []);

  return height;
}
