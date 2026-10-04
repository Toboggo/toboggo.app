import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Icon, type IconName } from "@toboggo/design-system";
import { listNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from "@toboggo/shared";
import { useFormat } from "../../i18n/useFormat";
import { useSession } from "../../lib/session";
import { queryClient } from "../../lib/queryClient";
import { SettingsPage, kit } from "./SettingsKit";

const ICON: Record<AppNotification["type"], IconName> = {
  resolved: "ic-check",
  newPark: "ic-explore",
  thanks: "ic-heart",
  confirm: "ic-check",
  recommend: "ic-star",
};

type Filter = "all" | "unread";

export default function NotifCenter() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const f = useFormat();
  const userId = useSession((s) => s.userId);
  const [filter, setFilter] = useState<Filter>("all");
  const { data: notifs = [], isPending, isError, refetch } = useQuery({
    queryKey: ["notifications", userId],
    queryFn: () => listNotifications(userId!),
    enabled: !!userId,
  });

  const hasUnread = notifs.some((n) => !n.read);
  const filtered = filter === "unread" ? notifs.filter((n) => !n.read) : notifs;

  async function onOpen(n: AppNotification) {
    if (!n.read) {
      await markNotificationRead(n.id);
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    }
    if (n.type === "resolved") navigate(`/notifications/resolved/${n.id}`);
    else if (n.type === "newPark" && n.park_id) navigate(`/park/${n.park_id}`);
    else if (n.type === "thanks") navigate("/contributions");
    else if (n.type === "recommend") navigate("/map");
  }

  const tabs: { value: Filter; label: string }[] = [
    { value: "all", label: t("notifs.filter.all") },
    { value: "unread", label: t("notifs.filter.unread") },
  ];

  return (
    <SettingsPage
      white
      title={t("notifs.title")}
      right={
        hasUnread ? (
          <button
            type="button"
            className={kit.markAll}
            onClick={async () => {
              await markAllNotificationsRead(userId!);
              void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
            }}
          >
            {t("notifs.markAllRead")}
          </button>
        ) : undefined
      }
    >
      <>
        <div className={kit.tabs} role="tablist" aria-label={t("notifs.filterLabel")}>
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={filter === tab.value}
              className={clsx(kit.tab, filter === tab.value && kit.tabActive)}
              onClick={() => setFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {isPending && !!userId ? (
          <p className={kit.notifStatus} role="status">
            {t("notifs.loading")}
          </p>
        ) : isError ? (
          <div className={kit.notifStatus} role="alert">
            <div>{t("notifs.error")}</div>
            <button type="button" className={kit.retry} onClick={() => void refetch()}>
              {t("notifs.retry")}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className={kit.notifEmpty}>
            <div className={kit.bellCircle} aria-hidden>
              <Icon name="ic-bell" size={40} />
              <span className={kit.bellCheck}>
                <Icon name="ic-check" size={12} />
              </span>
            </div>
            <h2 className={kit.notifEmptyTitle}>{notifs.length > 0 ? t("notifs.emptyUnread") : t("notifs.empty")}</h2>
            {notifs.length === 0 && <p className={kit.notifEmptyText}>{t("notifs.emptyHint")}</p>}
          </div>
        ) : (
          <div className={kit.notifList}>
            {filtered.map((n) => (
              <button key={n.id} type="button" onClick={() => onOpen(n)} className={kit.notif}>
                <span className={kit.notifIcon} aria-hidden>
                  <Icon name={ICON[n.type]} size={18} />
                </span>
                <div className={kit.notifBody}>
                  {/* i18n debt: `title` / `description` are stored pre-rendered in
                      French in the DB. Localizing them needs a schema change to
                      `type` + structured `params` (see i18n audit) — out of scope
                      for this PR. */}
                  <div className={kit.notifTitle}>{n.title}</div>
                  <div className={kit.notifDesc}>{n.description}</div>
                  <div className={kit.notifDate}>{f.dateTime(n.created_at)}</div>
                </div>
                {!n.read && (
                  <>
                    <span className={kit.unreadDot} aria-hidden />
                    <span className={kit.srOnly}>{t("notifs.unreadDot")}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}
      </>
    </SettingsPage>
  );
}
