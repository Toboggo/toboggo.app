import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input } from "@toboggo/design-system";
import { createGroup, getMyActiveGroup, joinGroup, leaveGroup, listGroupMembers, getPark } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
import { ParkPicker } from "../../components/ParkPicker";
import { useSession } from "../../lib/session";
import { queryClient } from "../../lib/queryClient";
import { useToastStore } from "../../lib/toast";

export default function GroupOuting() {
  const userId = useSession((s) => s.userId)!;
  const profile = useSession((s) => s.profile);
  const showToast = useToastStore((s) => s.show);
  const [showPicker, setShowPicker] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  const { data: group } = useQuery({ queryKey: ["my-group", userId], queryFn: () => getMyActiveGroup(userId) });
  const { data: park } = useQuery({
    queryKey: ["group-park", group?.park_id],
    queryFn: () => getPark(group!.park_id),
    enabled: !!group,
  });
  const { data: members = [] } = useQuery({
    queryKey: ["group-members", group?.id],
    queryFn: () => listGroupMembers(group!.id),
    enabled: !!group,
  });

  async function onCreate(parkId: string) {
    await createGroup(parkId, userId, profile?.name ?? "Vous");
    void queryClient.invalidateQueries({ queryKey: ["my-group", userId] });
    setShowPicker(false);
  }

  async function onJoin() {
    const g = await joinGroup(joinCode, profile?.name ?? "Vous");
    if (!g) return showToast("Code invalide");
    void queryClient.invalidateQueries({ queryKey: ["my-group", userId] });
  }

  async function onLeave() {
    if (!group) return;
    await leaveGroup(group.id);
    void queryClient.invalidateQueries({ queryKey: ["my-group", userId] });
  }

  return (
    <div className="screen">
      <TopBar title="Sortie de groupe" />
      <div style={{ padding: "0 20px" }}>
        {!group ? (
          <>
            <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginBottom: 20 }}>
              Créez une sortie pour partager votre position en temps réel avec d'autres parents sur ce parc, ou
              rejoignez-en une avec un code.
            </p>
            <Button block onClick={() => setShowPicker(true)}>
              Créer une sortie
            </Button>
            {showPicker && (
              <div style={{ marginTop: 12 }}>
                <ParkPicker onPick={(p) => onCreate(p.id)} onNone={() => setShowPicker(false)} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <Input placeholder="Code à 5 caractères" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
              <Button onClick={onJoin} disabled={!joinCode}>
                Rejoindre
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 18 }}>{park?.name}</h2>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
              Code : <strong>{group.code}</strong>
            </div>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Rejoins ma sortie Toboggo ! Code : ${group.code}`)}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: "block", marginBottom: 20, color: "var(--color-primary)", fontFamily: "var(--font-heading)", fontWeight: 600 }}
            >
              💬 Partager par WhatsApp
            </a>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {members.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, background: "var(--color-surface)", borderRadius: 12 }}>
                  <span>{m.name}</span>
                  <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{m.status}</span>
                </div>
              ))}
            </div>
            <Button variant="secondary" block style={{ marginTop: 24 }} onClick={onLeave}>
              Quitter la sortie
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
