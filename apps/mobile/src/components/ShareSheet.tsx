import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet, Button, Icon, type IconName } from "@toboggo/design-system";
import { getParkDisplayName, type Park } from "@toboggo/shared";
import { ParkPhoto } from "./ParkPhoto";
import { useToastStore } from "../lib/toast";
import { trackEvent, type AnalyticsEventProperties } from "../lib/analytics";
import { buildShareText } from "../lib/parkShare";
import { useFormat } from "../i18n/useFormat";
import styles from "./ShareSheet.module.css";

type ShareChannel = AnalyticsEventProperties["park_shared"]["channel"];

const COPIED_FEEDBACK_MS = 2200;

/** Origine publique de production par défaut (alias Vercel du projet toboggo-app). */
export const DEFAULT_PUBLIC_APP_URL = "https://toboggo-app.vercel.app";

/**
 * Lien public canonique du parc : origine publique configurée
 * (`VITE_PUBLIC_APP_URL`, sinon l'alias de production) + `/park/:id`, sans
 * query ni hash. Jamais l'origine courante : un partage depuis une Preview
 * Vercel (protégée) ou le localhost doit rester ouvrable par n'importe qui.
 */
export function getParkShareUrl(parkId: string, publicOrigin: string = import.meta.env.VITE_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL): string {
  return new URL(`/park/${encodeURIComponent(parkId)}`, publicOrigin).toString();
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission refusée / contexte non sécurisé → repli ci-dessous.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function ShareSheet({ open, onClose, park }: { open: boolean; onClose: () => void; park: Park }) {
  const { t } = useTranslation("contribute");
  const { t: tc } = useTranslation("common");
  const f = useFormat();
  const showToast = useToastStore((s) => s.show);
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const shareUrl = getParkShareUrl(park.id);
  const displayName = getParkDisplayName(park, t);
  const city = park.city?.trim() || null;
  // Texte enrichi (nom, lieu, note) ; l'URL n'y figure qu'une fois, en fin de
  // texte — elle n'est donc jamais passée en champ `url` séparé au partage natif.
  const body = buildShareText(
    {
      name: displayName,
      address_line: park.address_line,
      city: park.city,
      rating: park.rating,
      review_count: park.review_count,
    },
    shareUrl,
    t,
    f.rating,
  );

  const links: { label: string; icon: IconName; href: string; channel: ShareChannel; external?: boolean }[] = [
    {
      label: "WhatsApp",
      icon: "ic-whatsapp",
      href: `https://wa.me/?text=${encodeURIComponent(body)}`,
      channel: "whatsapp",
      external: true,
    },
    { label: "SMS", icon: "ic-message", href: `sms:?&body=${encodeURIComponent(body)}`, channel: "sms" },
    {
      label: t("share.email"),
      icon: "ic-mail",
      href: `mailto:?subject=${encodeURIComponent(displayName)}&body=${encodeURIComponent(body)}`,
      channel: "email",
    },
  ];

  async function copyLink() {
    // `park_shared` (canal `copy_link`) uniquement si l'écriture presse-papiers
    // a réellement réussi — seul canal où une confirmation technique existe
    // (voir PRIVACY-RULES.md / TRACKING-PLAN.md §2).
    const ok = await copyText(shareUrl);
    if (!ok) {
      showToast(t("share.copyFailed"));
      return;
    }
    trackEvent("park_shared", { park_id: park.id, channel: "copy_link" });
    setCopied(true);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }

  async function shareMore() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: displayName, text: body });
      } catch (err) {
        // Annulation par l'utilisateur : pas une erreur. Tout autre échec →
        // repli sur la copie du lien.
        if (err instanceof DOMException && err.name === "AbortError") return;
        await copyLink();
      }
      return;
    }
    await copyLink();
  }

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={["fit"]} initialSnap={0} showBackdrop>
      <div className={styles.sheet}>
        <h2 className={styles.title}>{t("share.title")}</h2>

        <div className={styles.park}>
          <ParkPhoto park={park} markSize={20} className={styles.thumb} />
          <div className={styles.parkText}>
            <div className={styles.parkName}>{displayName}</div>
            {city && <div className={styles.parkCity}>{city}</div>}
          </div>
        </div>

        <div className={styles.actions}>
          {links.map((l) => (
            <a
              key={l.channel}
              className={styles.action}
              href={l.href}
              {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              onClick={() => trackEvent("park_shared", { park_id: park.id, channel: l.channel })}
            >
              <span className={styles.actionIcon}>
                <Icon name={l.icon} size={24} />
              </span>
              <span className={styles.actionLabel}>{l.label}</span>
            </a>
          ))}
          <button type="button" className={styles.action} onClick={() => void shareMore()}>
            <span className={styles.actionIcon}>
              <Icon name="ic-more" size={24} />
            </span>
            <span className={styles.actionLabel}>{t("share.more")}</span>
          </button>
        </div>

        <Button type="button" block className={styles.copy} onClick={() => void copyLink()}>
          <Icon name={copied ? "ic-check" : "ic-link"} size={20} />
          <span aria-live="polite">{copied ? t("share.copied") : t("share.copy")}</span>
        </Button>
        <Button type="button" variant="ghost" block className={styles.close} onClick={onClose}>
          {tc("action.close")}
        </Button>
      </div>
    </BottomSheet>
  );
}
