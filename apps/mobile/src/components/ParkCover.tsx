import { useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LogoMark } from "@toboggo/design-system";
import type { Park } from "@toboggo/shared";
import { getParkCover } from "../lib/parkCover";
import styles from "./ParkCover.module.css";

/**
 * A park cover slot: the approved public photo when there is one, otherwise a
 * deterministic illustration (same park → same illustration, everywhere).
 *
 * A photo that fails to load falls back to the illustration; an illustration
 * that fails falls back to the Toboggo mark. Each step happens once — no loop.
 * A load error never means "no photo": callers decide that from `park.photos`.
 *
 * `className` (size + radius from the caller) stays on the outer element.
 */
export function ParkCover({
  park,
  index = 0,
  className,
  style,
  markSize = 28,
  eager = false,
  children,
}: {
  park: Pick<Park, "id" | "photos">;
  index?: number;
  className?: string;
  style?: CSSProperties;
  /** Size of the last-resort Toboggo mark. */
  markSize?: number;
  /** Above-the-fold covers skip lazy loading. */
  eager?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation("common");
  const cover = getParkCover(park, index);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const [illustrationFailed, setIllustrationFailed] = useState(false);

  const showPhoto = cover.kind === "photo" && failedPhoto !== cover.url;
  const loading = eager ? "eager" : "lazy";

  if (showPhoto) {
    return (
      <div className={className} style={style}>
        <div className={styles.frame}>
          <img
            className={styles.img}
            src={cover.url}
            alt=""
            loading={loading}
            decoding="async"
            onError={() => setFailedPhoto(cover.url)}
          />
          {children}
        </div>
      </div>
    );
  }

  if (illustrationFailed) {
    return (
      <div className={className} style={style}>
        <div className={`${styles.frame} ${styles.mark}`} role="img" aria-label={t("a11y.noParkPhoto")}>
          <LogoMark size={markSize} rounded={false} />
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      <div className={styles.frame} role="img" aria-label={t("a11y.parkIllustration")}>
        <img
          className={styles.img}
          src={cover.illustration}
          alt=""
          width={1200}
          height={800}
          loading={loading}
          decoding="async"
          data-cover="illustration"
          onError={() => setIllustrationFailed(true)}
        />
        {children}
      </div>
    </div>
  );
}
