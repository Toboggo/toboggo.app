import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, Segmented } from "@toboggo/design-system";
import { listNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
import { useFormat } from "../../i18n/useFormat";
import { useSession } from "../../lib/session";
import { queryClient } from "../../lib/queryClient";

const ICON: Record<AppNotification["type"], string> = {
  resolved: "✅",
  newPark: "🛝",
  thanks: "🙏",
  confirm: "✔️",
  recommend: "✨",
};

export default function NotifCenter() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const f = useFormat();
  const userId = useSession((s) => s.userId);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const { data: notifs = [] } = useQuery({ queryKey: ["notifications", userId], queryFn: () => listNotifications(userId!), enabled: !!userId });

  const filtered = notifs.filter((n) => (filter === "unread" ? !n.read : filter === "read" ? n.read : true));

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

  return (
    <div className="screen">
      <TopBar
        title={t("notifs.title")}
        right={
          <button
            onClick={async () => {
              await markAllNotificationsRead(userId!);
              void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
            }}
            style={{ background: "none", border: "none", color: "var(--color-primary)", fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13 }}
          >
            {t("notifs.markAllRead")}
          </button>
        }
      />
      <div style={{ padding: "0 16px" }}>
        <Segmented
          options={[
            { value: "all", label: t("notifs.filter.all") },
            { value: "unread", label: t("notifs.filter.unread") },
            { value: "read", label: t("notifs.filter.read") },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as any)}
        />
        <div style={{ marginTop: 14 }}>
          {filtered.length === 0 ? (
            <EmptyState icon="🔔" title={t("notifs.empty")} />
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                onClick={() => onOpen(n)}
                style={{
                  display: "flex",
                  gap: 12,
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 4px",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 20 }}>{ICON[n.type]}</span>
                <div style={{ flex: 1 }}>
                  {/* i18n debt: `title` / `description` are stored pre-rendered in
                      French in the DB. Localizing them needs a schema change to
                      `type` + structured `params` (see i18n audit) — out of scope
                      for this PR. */}
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14 }}>{n.title}</div>
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{n.description}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-faint)", marginTop: 2 }}>
                    {f.dateTime(n.created_at)}
                  </div>
                </div>
                {!n.read && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-accent)", flexShrink: 0, marginTop: 6 }} />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
