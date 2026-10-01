/**
 * Pictograms local to the "Autour de vous" section.
 *
 * TEMPORARY (V1): Binoculars, Compass and Search have no symbol in the shared
 * sprite yet (`packages/design-system/src/icons/icons-sprite.svg`). These are
 * minimal inline stand-ins drawn in the sprite's own style (24 grid, outline,
 * round caps/joins, 1.6 stroke) — to be replaced by the final Toboggo assets
 * added to the 3 sprite copies + `IconName`. Chevron follows the existing
 * inline idiom (see `Settings.tsx`), rotated per direction.
 */
import type { CSSProperties, ReactNode } from "react";

type Props = { size?: number; style?: CSSProperties; className?: string };

function Svg({ size = 20, style, className, strokeWidth = 1.6, children }: Props & { strokeWidth?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function BinocularsIcon(props: Props) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <circle cx="6.5" cy="15.5" r="3.5" />
      <circle cx="17.5" cy="15.5" r="3.5" />
      <path d="M10 15.5h4" />
      <path d="M3 15.5 5 7a2 2 0 0 1 2-1.5h1A1.5 1.5 0 0 1 9.5 7v5" />
      <path d="M21 15.5 19 7a2 2 0 0 0-2-1.5h-1A1.5 1.5 0 0 0 14.5 7v5" />
    </Svg>
  );
}

export function CompassIcon(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </Svg>
  );
}

export function SearchIcon(props: Props) {
  return (
    <Svg {...props} strokeWidth={2}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Svg>
  );
}

const CHEVRON_ROTATION = { right: 0, down: 90, left: 180, up: 270 } as const;

export function ChevronIcon({ direction, ...props }: Props & { direction: keyof typeof CHEVRON_ROTATION }) {
  return (
    <Svg {...props} strokeWidth={2} style={{ transform: `rotate(${CHEVRON_ROTATION[direction]}deg)`, ...props.style }}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}
