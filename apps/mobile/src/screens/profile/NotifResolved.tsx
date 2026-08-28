import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@toboggo/design-system";
import { listNotifications, getPark } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
import { ParkCard } from "../../components/ParkCard";
import { useSession } from "../../lib/session";

export default function NotifResolved() {
  const { notifId } = useParams();
  const navigate = useNavigate();
  const userId = useSession((s) => s.userId);
  const { data: notifs = [] } = useQuery({ queryKey: ["notifications", userId], queryFn: () => listNotifications(userId!), enabled: !!userId });
  const notif = notifs.find((n) => n.id === notifId);
  const { data: park } = useQuery({ queryKey: ["park", notif?.park_id], queryFn: () => getPark(notif!.park_id!), enabled: !!notif?.park_id });

  if (!notif) return null;

  return (
    <div className="screen">
      <TopBar />
      <div style={{ padding: "0 24px", textAlign: "center" }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <h1 style={{ fontSize: 20, marginTop: 12 }}>{notif.title}</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginTop: 8 }}>{notif.description}</p>
        {park && (
          <div style={{ marginTop: 20, textAlign: "left" }}>
            <ParkCard park={park} />
          </div>
        )}
        {park && (
          <Button block style={{ marginTop: 20 }} onClick={() => navigate(`/park/${park.id}`)}>
            Voir le parc
          </Button>
        )}
      </div>
    </div>
  );
}
