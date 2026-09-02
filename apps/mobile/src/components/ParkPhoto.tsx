import type { CSSProperties, ReactNode } from "react";
import { LogoMark } from "@toboggo/design-system";
import type { Park } from "@toboggo/shared";
import { parkPhotoUrl } from "../lib/photos";
import styles from "./ParkPhoto.module.css";

/**
 * A park photo slot. Renders the real photo when the park has one, otherwise a
 * branded Toboggo placeholder — never a generic/stock image.
 *
 * The `className` (a caller CSS-module class giving size + border-radius) is
 * kept on the outer element in both states so layout is identical.
 */
export function ParkPhoto({
  park,
  index = 0,
  className,
  style,
  markSize = 28,
  children,
}: {
  park: Pick<Park, "photos">;
  index?: number;
  className?: string;
  style?: CSSProperties;
  /** Size of the placeholder logo mark. */
  markSize?: number;
  /** Optional overlay (e.g. a CTA) shown only in the empty state. */
  children?: ReactNode;
}) {
  const url = parkPhotoUrl(park, index);
  if (url) {
    return <div className={className} style={{ ...style, backgroundImage: `url(${url})` }} />;
  }
  return (
    <div
      className={`${className ?? ""} ${styles.empty}`}
      style={style}
      role="img"
      aria-label="Aucune photo pour ce parc"
    >
      <LogoMark size={markSize} rounded={false} />
      {children}
    </div>
  );
}
