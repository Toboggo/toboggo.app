import { Icon, type IconName } from "@toboggo/design-system";

/**
 * Pictos du parcours « Ajouter un parc » — même famille que le sprite du
 * design system (24×24, trait 1.6, `currentColor`, extrémités arrondies).
 * Le sprite est réutilisé tel quel pour ce qu'il couvre ; les jeux qu'il ne
 * couvre pas ont un SVG dédié ici (pas d'emoji disparate, pas de découpe de
 * maquette). Indexé par code du catalogue `features` (V2).
 */

const SPRITE_BY_CODE: Record<string, IconName> = {
  slide: "ic-slide",
  swing: "ic-swing",
  climbing: "ic-climb",
  sandbox: "ic-sandbox",
  springer: "ic-spring",
  motor_course: "ic-motor",
  multisport: "ic-multisport",
  // services & accès
  wc: "ic-toilets",
  benches: "ic-bench",
  water: "ic-water",
  parking: "ic-parking",
  shade: "ic-shade",
  fenced: "ic-fence",
  pmr: "ic-pmr",
};

const CUSTOM_PATHS: Record<string, JSX.Element> = {
  carousel: (
    <>
      <ellipse cx="12" cy="16" rx="8" ry="3" />
      <path d="M12 16V5" />
      <path d="M12 8 6.5 11M12 8l5.5 3" />
    </>
  ),
  zipline: (
    <>
      <path d="M4 4v16M20 4v16" />
      <path d="M4 7l16 3" />
      <path d="M12 8.5v4" />
      <circle cx="12" cy="14.5" r="1.8" />
    </>
  ),
  water_play: (
    <>
      <path d="M12 4c3 4 5 6.5 5 9.2a5 5 0 0 1-10 0C7 10.5 9 8 12 4z" />
      <path d="M9.6 14.2a2.6 2.6 0 0 0 2 2.2" />
    </>
  ),
  play_structure: (
    <>
      <path d="M3 20h18" />
      <path d="M5 20V10l4-3 4 3v10" />
      <path d="M13 20v-7h6v7" />
    </>
  ),
  seesaw: (
    <>
      <path d="M4 9l16 6" />
      <path d="M12 12l-3 8h6z" />
    </>
  ),
  playhouse: (
    <>
      <path d="M5 20v-9l7-5 7 5v9z" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  trampoline: (
    <>
      <path d="M4 13h16" />
      <path d="M6 13l-1 7M18 13l1 7M12 13v7" />
      <path d="M9 8c1-2 5-2 6 0" />
    </>
  ),
  balance_beam: (
    <>
      <path d="M3 11h18" />
      <path d="M6 11v9M18 11v9" />
    </>
  ),
  agility_trail: (
    <>
      <path d="M3 20h18" />
      <path d="M4.5 20l2-6 2 6M10 20l2-6 2 6M15.5 20l2-6 2 6" />
    </>
  ),
  horizontal_bar: (
    <>
      <path d="M5 20V6M19 20V6" />
      <path d="M5 7h14" />
    </>
  ),
  hopscotch: (
    <>
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="5" y="8" width="6" height="5" rx="1" />
      <rect x="13" y="8" width="6" height="5" rx="1" />
      <rect x="9" y="13" width="6" height="5" rx="1" />
    </>
  ),
};

/** Repli neutre pour un code de catalogue futur sans picto dédié. */
const GENERIC = (
  <>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </>
);

export function ParkGlyph({ code, size = 28 }: { code: string; size?: number }) {
  const sprite = SPRITE_BY_CODE[code];
  if (sprite) return <Icon name={sprite} size={size} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {CUSTOM_PATHS[code] ?? GENERIC}
    </svg>
  );
}
