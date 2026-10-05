import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@toboggo/design-system";
import styles from "./Flow.module.css";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/**
 * Assemble des fragments d'adresse sans répéter un segment déjà présent
 * (« Boulevard X, 12100 Millau, 12100 Millau » → « Boulevard X, 12100 Millau »).
 * Chaque fragment est lui-même découpé sur les virgules.
 */
export function dedupeAddress(...parts: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    for (const seg of (part ?? "").split(",")) {
      const clean = seg.trim();
      if (!clean) continue;
      const k = norm(clean);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(clean);
    }
  }
  return out.join(", ");
}

/**
 * Récapitulatif d'un parcours : UNE carte blanche à bordure légère — aperçu du
 * parc en tête (miniature, nom, adresse), puis des lignes compactes séparées
 * par de fins traits. Jamais de carte dans la carte.
 */
export function RecapCard({
  thumb,
  name,
  nameNote,
  address,
  children,
}: {
  thumb: ReactNode;
  name: string;
  /** Mention discrète sous le nom (ex. « Nom non renseigné »). */
  nameNote?: string;
  address?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.recap}>
      <div className={styles.recapHead}>
        {thumb}
        <div style={{ minWidth: 0 }}>
          <div className={styles.recapName}>{name}</div>
          {nameNote && <div className={styles.recapSub}>{nameNote}</div>}
          {address && <div className={styles.recapSub}>{address}</div>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Ligne : picto à gauche, titre + résumé au centre, « Modifier » à droite. */
export function RecapRow({
  icon,
  title,
  onEdit,
  hideEdit = false,
  children,
}: {
  icon: IconName;
  title: string;
  onEdit: () => void;
  hideEdit?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation("contribute");
  return (
    <div className={styles.recapRow}>
      <span className={styles.recapIcon} aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <div className={styles.recapBody}>
        <div className={styles.recapTitle}>{title}</div>
        <div className={styles.recapText}>{children}</div>
      </div>
      {!hideEdit && (
        <button type="button" className={styles.recapEdit} onClick={onEdit} aria-label={`${t("common.edit")} — ${title}`}>
          {t("common.edit")}
        </button>
      )}
    </div>
  );
}

/** Miniatures de photos + compteur, pour une ligne « Photos ». */
export function PhotoThumbs({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className={styles.thumbs}>
      {urls.map((u, i) => (
        <div key={i} className={styles.thumb} style={{ backgroundImage: `url(${u})` }} />
      ))}
    </div>
  );
}
