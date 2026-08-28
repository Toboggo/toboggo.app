import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, Segmented } from "@toboggo/design-system";
import { listNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
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
        title="Notifications"
        right={
          <button
            onClick={async () => {
              await markAllNotificationsRead(userId!);
              void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
            }}
            style={{ background: "none", border: "none", color: "var(--color-primary)", fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13 }}
          >
            Tout marquer comme lu
          </button>
        }
      />
      <div style={{ padding: "0 16px" }}>
        <Segmented
          options={[
            { value: "all", label: "Toutes" },
            { value: "unread", label: "Non lues" },
            { value: "read", label: "Lues" },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as any)}
        />
        <div style={{ marginTop: 14 }}>
          {filtered.length === 0 ? (
            <EmptyState icon="🔔" title="Aucune notification ici." />
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
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14 }}>{n.title}</div>
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{n.description}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-faint)", marginTop: 2 }}>
                    {new Date(n.created_at).toLocaleString("fr-FR")}
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
