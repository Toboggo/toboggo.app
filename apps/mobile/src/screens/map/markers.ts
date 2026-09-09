/**
 * Map marker DOM builders — shared by the real MapLibre canvas and (via the
 * matching CSS) the offline FakeMap, so a park pin looks identical either way.
 * Uses Toboggo tokens only; no new colours.
 *
 * IMPORTANT: MapLibre rewrites the marker element's `transform` on every frame
 * while the map moves. The element MapLibre owns must therefore carry no
 * `transform` / `transition: transform` of its own — otherwise every pan/zoom
 * makes the pin lag and float away. All visual styling lives on an inner span.
 */

export function ratingTierColor(rating: number): string {
  if (rating >= 4) return "var(--color-primary)";
  if (rating >= 3) return "var(--color-accent)";
  return "var(--color-error)";
}

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.dataset.toboggoMarkers = "1";
  style.textContent = `
.tbg-pin {
  --marker-color: var(--color-primary);
  cursor: pointer;
  border: none;
  background: none;
  padding: 0;
}
.tbg-pin__inner {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 9px 4px 5px;
  background: var(--color-surface);
  border: 2px solid var(--marker-color);
  border-radius: 999px 999px 999px 6px;
  box-shadow: var(--shadow-md);
  font-family: var(--font-heading); font-weight: 700; font-size: 12px;
  color: var(--color-text);
  transform-origin: bottom left;
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.tbg-pin__dot {
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--marker-color);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-on-primary); flex: none;
}
.tbg-pin__dot svg { width: 10px; height: 10px; display: block; }
.tbg-pin__inner [data-note]:empty { display: none; }
.tbg-pin__inner:not(:has([data-note]:not(:empty))) { padding-right: 5px; }
.tbg-pin[data-selected="1"] { z-index: 3; }
.tbg-pin[data-selected="1"] .tbg-pin__inner {
  transform: scale(1.12);
  box-shadow: 0 0 0 4px var(--color-primary-tint), var(--shadow-lg);
}
.tbg-user {
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--color-info);
  border: 3px solid var(--color-surface);
  box-shadow: 0 0 0 8px rgba(76, 158, 235, 0.22), var(--shadow-sm);
}
`;
  document.head.appendChild(style);
}

// A slide glyph (matches the sprite's ic-slide silhouette) so the pin reads as
// "playground" without depending on the runtime sprite injection.
const SLIDE_PATH = "M4 20c3 0 4-2 5-5l7-9M14 4l4 3M9 15l4 1M3 20h4";

export function buildParkMarker(label: string): HTMLButtonElement {
  ensureStyles();
  const el = document.createElement("button");
  el.type = "button";
  el.className = "tbg-pin";
  el.setAttribute("aria-label", label);
  el.dataset.selected = "";

  const inner = document.createElement("span");
  inner.className = "tbg-pin__inner";

  const dot = document.createElement("span");
  dot.className = "tbg-pin__dot";
  dot.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${SLIDE_PATH}"/></svg>`;

  const note = document.createElement("span");
  note.dataset.note = "1";
  note.textContent = "—";

  inner.append(dot, note);
  el.append(inner);
  return el;
}

export function buildUserMarker(): HTMLDivElement {
  ensureStyles();
  const el = document.createElement("div");
  el.className = "tbg-user";
  el.setAttribute("aria-label", "Votre position");
  return el;
}
