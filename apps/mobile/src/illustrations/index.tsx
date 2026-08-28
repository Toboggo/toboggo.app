import type { CSSProperties } from "react";
import { SplashPark } from "./SplashPark";
import { ParkStrip } from "./ParkStrip";

export interface IllustrationProps {
  style?: CSSProperties;
  className?: string;
}

/**
 * Central registry of prototype illustrations.
 *
 * Every illustration lives in its own file and is referenced here by key.
 * To swap the whole set for final artwork: replace the component files (keeping
 * the same `IllustrationProps` contract) or repoint the keys below — nothing
 * else in the app imports the individual files directly.
 */
export const illustrations = {
  splashPark: SplashPark,
  parkStrip: ParkStrip,
} as const;

export type IllustrationName = keyof typeof illustrations;

export function Illustration({ name, ...props }: IllustrationProps & { name: IllustrationName }) {
  const Cmp = illustrations[name];
  return <Cmp {...props} />;
}
