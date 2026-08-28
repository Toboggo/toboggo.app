import { useState } from "react";
import { Button, Dialog, Textarea } from "@toboggo/design-system";
import { dismissReport, reopenReport, resolveReport, uploadPhoto, createMaintenance, logActivity, REPORT_REASON_LABEL, type Report } from "@toboggo/shared";
import { ReportStatusTag } from "./StatusTag";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import { queryClient } from "../lib/queryClient";
import { useNavigate } from "react-router-dom";

export function ReportModal({
  report,
  parkName,
  onClose,
  canManage,
}: {
  report: (Report & { parks?: { name: string } }) | null;
  parkName?: string;
  onClose: () => void;
  canManage: boolean;
}) {
  const { communeId, isAdmin } = useOrgScope();
  const userName = useOrgSession((s) => s.userName);
  const navigate = useNavigate();
  const [note, setNote] = useState(report?.resolution_note ?? "");
  const [saving, setSaving] = useState(false);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);

  if (!report) return null;

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAfterPhoto(await uploadPhoto("reportPhotos", file, communeId ?? "admin"));
  }

  async function resolve() {
    setSaving(true);
    try {
      await resolveReport(report!.id, note, afterPhoto ?? undefined);
      await logActivity(communeId ?? null, userName, `Signalement résolu : ${report!.parks?.name ?? parkName}`);
      invalidate();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function dismiss() {
    setSaving(true);
    try {
      await dismissReport(report!.id, note);
      await logActivity(communeId ?? null, userName, `Signalement ignoré : ${report!.parks?.name ?? parkName}`);
      invalidate();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function reopen() {
    await reopenReport(report!.id);
    invalidate();
    onClose();
  }

  async function scheduleFollowUp() {
    if (!communeId) return;
    await createMaintenance({
      park_id: report!.park_id,
      commune_id: communeId,
      date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      note: "Contrôle de suivi après signalement",
      assignee: null,
      recur: "none",
    });
    await logActivity(communeId, userName, `Contrôle de suivi programmé : ${report!.parks?.name ?? parkName}`);
    onClose();
    navigate("/maintenance");
  }

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["bo-reports"] });
    void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
  }

  return (
    <Dialog open onClose={onClose} title="Signalement">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>{report.parks?.name ?? parkName}</strong>
          <ReportStatusTag status={report.status} />
        </div>
        <div style={{ fontSize: 13 }}>
          <div>
            <strong>Motif :</strong> {REPORT_REASON_LABEL[report.reason]}
          </div>
          {report.equipment && (
            <div>
              <strong>Équipement :</strong> {report.equipment}
            </div>
          )}
          <div>
            <strong>Signalé par :</strong> {report.reported_by_name} · {new Date(report.created_at).toLocaleString("fr-FR")}
          </div>
          {report.comment && (
            <div style={{ marginTop: 6 }}>
              <strong>Détail :</strong> {report.comment}
            </div>
          )}
        </div>

        {report.status === "open" ? (
          canManage ? (
            <>
              <Textarea label="Note de traitement (obligatoire)" value={note} onChange={(e) => setNote(e.target.value)} />
              {!isAdmin && (
                <label style={{ fontSize: 12.5, cursor: "pointer" }}>
                  📷 Ajouter une photo après réparation
                  <input type="file" accept="image/*" hidden onChange={onPhoto} />
                </label>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <Button block disabled={!note} loading={saving} onClick={resolve}>
                  Résoudre
                </Button>
                <Button block variant="secondary" disabled={!note} onClick={dismiss}>
                  Ignorer
                </Button>
              </div>
              {!isAdmin && (
                <Button variant="ghost" block onClick={scheduleFollowUp}>
                  Programmer un contrôle de suivi
                </Button>
              )}
            </>
          ) : (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Vous n'avez pas les droits pour traiter ce signalement.</p>
          )
        ) : (
          <>
            {report.resolution_note && (
              <div style={{ fontSize: 13 }}>
                <strong>Note de traitement :</strong> {report.resolution_note}
              </div>
            )}
            {canManage && (
              <Button variant="secondary" block onClick={reopen}>
                Réouvrir le signalement
              </Button>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
