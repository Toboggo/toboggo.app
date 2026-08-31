import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

// Icon names available in icons-sprite.svg (kept in sync manually — see that
// file's header comment). Regenerate this list if the sprite changes:
// grep '<symbol id=' icons-sprite.svg
export type IconName =
  | "logo-pictogram"
  | "logo-pictogram-mono"
  | "ic-age"
  | "ic-fence"
  | "ic-shade"
  | "ic-slide"
  | "ic-swing"
  | "ic-climb"
  | "ic-sandbox"
  | "ic-spring"
  | "ic-motor"
  | "ic-pingpong"
  | "ic-multisport"
  | "ic-toilets"
  | "ic-water"
  | "ic-bench"
  | "ic-picnic"
  | "ic-parking"
  | "ic-pmr"
  | "ic-light"
  | "ic-check"
  | "ic-question"
  | "ic-explore"
  | "ic-heart"
  | "ic-flag"
  | "ic-user"
  | "ic-plus"
  | "ic-share"
  | "ic-route"
  | "ic-back"
  | "ic-close"
  | "ic-shield"
  | "ic-star"
  | "ic-walk"
  | "ic-bike"
  | "ic-car"
  | "ic-dashboard"
  | "ic-list"
  | "ic-users"
  | "ic-review"
  | "ic-chart"
  | "ic-settings"
  | "ic-report-broken"
  | "ic-report-safety"
  | "ic-report-clean"
  | "ic-report-info"
  | "ic-report-other";

const SPRITE_URL = "/icons-sprite.svg"; // servi depuis public/ de chaque app
let injected = false;

/**
 * Charge icons-sprite.svg une seule fois et l'injecte (caché) dans le DOM, pour
 * que tous les <Icon name="..."/> de la page puissent y référencer un symbole
 * via <use>. Sans appel à ce hook au moins une fois (ex. en haut de App.tsx),
 * les icônes ne s'affichent pas.
 */
export function useIconSprite() {
  const [ready, setReady] = useState(injected);
  useEffect(() => {
    if (injected) {
      setReady(true);
      return;
    }
    let cancelled = false;
    fetch(SPRITE_URL)
      .then((r) => r.text())
      .then((svg) => {
        if (cancelled) return;
        const div = document.createElement("div");
        div.style.display = "none";
        div.innerHTML = svg;
        document.body.prepend(div);
        injected = true;
        setReady(true);
      })
      .catch((err) => {
        console.error("[Icon] failed to load icons-sprite.svg", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

/** Tailles de rendu standard du système (cf. en-tête de icons-sprite.svg). */
const ICON_SIZES = { sm: 16, md: 24, lg: 32 } as const;
export type IconSize = keyof typeof ICON_SIZES;

/**
 * Une icône du système Toboggo (voir docs/DESIGN-SYSTEM.md §7).
 * Hérite `currentColor` — définir la couleur via le CSS du parent
 * (`color: var(--color-primary)`, etc.), pas de prop `color` séparée.
 *
 * `size` accepte un nombre de pixels ou un pas nommé (`"sm"` 16 / `"md"` 24 /
 * `"lg"` 32). Sans `title`, l'icône est décorative (`aria-hidden`) ; avec
 * `title`, elle est exposée en `role="img"` + `aria-label`.
 *
 * Nécessite que useIconSprite() ait tourné une fois dans l'app (voir App.tsx).
 */
export function Icon({
  name,
  size = "md",
  style,
  title,
}: {
  name: IconName;
  size?: number | IconSize;
  style?: CSSProperties;
  title?: string;
}) {
  const px = typeof size === "number" ? size : ICON_SIZES[size];
  return (
    <svg
      width={px}
      height={px}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: "block", flex: "none", ...style }}
    >
      <use href={`#${name}`} />
    </svg>
  );
}
