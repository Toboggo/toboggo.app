import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Dialog, Textarea } from "@toboggo/design-system";
import {
  dismissReport,
  reopenReport,
  resolveReport,
  uploadPhoto,
  createMaintenance,
  logActivity,
  listAuditLog,
  REPORT_REASON_LABEL,
  type Report,
} from "@toboggo/shared";
import { ReportStatusTag, ReportSeverityTag } from "./StatusTag";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import { useAsyncAction } from "../lib/useAsyncAction";
import { queryClient } from "../lib/queryClient";
import { useNavigate } from "react-router-dom";

export type ReportWithPark = Report & { parks?: { name: string; formatted_address?: string | null } };

const AUDIT_ACTION_LABEL: Record<string, string> = { insert: "Créé", update: "Modifié", delete: "Supprimé" };
const historyDateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/**
 * Historique du signalement (§4) : `audit_log` est alimenté par un trigger
 * générique sur `reports` (`reports_audit`, migration 0017), qui insère avec
 * `entity_type = tg_table_name = 'reports'`.
 *
 * Vérifié précisément (lecture seule, aucune policy modifiée) contre la
 * policy `audit_log_read` réellement active (migration 0020, qui remplace
 * celle de 0018) :
 *   is_toboggo_staff(auth.uid())
 *   or (entity_type = 'parks' and manages_park(auth.uid(), entity_id))
 * — la 2ᵉ branche ne matche jamais `entity_type = 'reports'` (seulement
 * `'parks'`), donc SEULE la 1ʳᵉ branche peut autoriser cette lecture.
 * `is_toboggo_staff` est vrai pour tout `team_members.organization_id is
 * null` (super_admin / moderation / support) — donc :
 *   - Staff Toboggo (Admin) : lecture AUTORISÉE, quel que soit `entity_type`.
 *   - Collectivité (gestionnaire/contributeur) : lecture TOUJOURS refusée
 *     pour `entity_type = 'reports'` — 0 ligne renvoyée même quand des
 *     évènements existent réellement, indépendamment des données.
 * Rendu donc uniquement côté Admin (voir l'appel plus bas) pour ne jamais
 * afficher un bloc qui semblerait fonctionnel mais resterait silencieusement
 * vide en Collectivité à cause de la RLS. Aucune policy modifiée ici — la
 * gestion globale de l'audit_log est hors périmètre de ce lot.
 */
function ReportHistory({ reportId }: { reportId: string }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["report-history", reportId],
    queryFn: () => listAuditLog("reports", reportId),
  });
  if (isLoading) return null;
  if (history.length === 0) return null;
  return (
    <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
      <strong style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 4 }}>Historique</strong>
      <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
        {history.map((h) => (
          <li key={h.id}>
            {AUDIT_ACTION_LABEL[h.action] ?? h.action} · {historyDateFmt.format(new Date(h.created_at))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReportModal({
  report,
  parkName,
  onClose,
  canManage,
}: {
  report: ReportWithPark | null;
  parkName?: string;
  onClose: () => void;
  canManage: boolean;
}) {
  const { communeId, isAdmin } = useOrgScope();
  const userName = useOrgSession((s) => s.userName);
  const userId = useOrgSession((s) => s.userId);
  const navigate = useNavigate();
  const [note, setNote] = useState(report?.resolution_note ?? "");
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["bo-reports"] });
    void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    // The uploaded object's owning folder must be the actual uploader — not
    // the collectivité id. (Verified: the `report-photos` Storage bucket has
    // no folder-prefix RLS constraint today, so `communeId`/"admin" also
    // worked, but aligning on auth.uid() matches the `park-photos`
    // convention and stays correct if that bucket is hardened later.)
    setAfterPhoto(await uploadPhoto("reportPhotos", file, userId));
  }

  const { run: resolve, pending: resolving } = useAsyncAction(
    async () => {
      await resolveReport(report!.id, note, afterPhoto ?? undefined);
      await logActivity(communeId ?? null, userName, `Signalement résolu : ${report!.parks?.name ?? parkName}`);
      invalidate();
      onClose();
    },
    { successMessage: "Signalement résolu." },
  );

  const { run: dismiss, pending: dismissing } = useAsyncAction(
    async () => {
      await dismissReport(report!.id, note);
      await logActivity(communeId ?? null, userName, `Signalement ignoré : ${report!.parks?.name ?? parkName}`);
      invalidate();
      onClose();
    },
    { successMessage: "Signalement ignoré." },
  );

  const { run: reopen, pending: reopening } = useAsyncAction(
    async () => {
      await reopenReport(report!.id);
      invalidate();
      onClose();
    },
    { successMessage: "Signalement réouvert." },
  );

  const { run: scheduleFollowUp, pending: schedulingFollowUp } = useAsyncAction(
    async () => {
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
    },
    { successMessage: "Contrôle de suivi programmé." },
  );

  if (!report) return null;

  // `in_progress` est un statut réel du domaine (enum `report_status`) mais
  // rien dans l'app ne l'écrit encore aujourd'hui — un signalement qui s'y
  // trouverait un jour reste néanmoins traitable comme un signalement ouvert
  // plutôt que de tomber dans un état mort sans action possible.
  const active = report.status === "open" || report.status === "in_progress";

  return (
    <Dialog open onClose={onClose} title="Signalement">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <strong>{report.parks?.name ?? parkName}</strong>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <ReportSeverityTag severity={report.severity} />
            <ReportStatusTag status={report.status} />
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => {
            onClose();
            navigate(`/parks/${report.park_id}`);
          }}
        >
          Voir le parc
        </Button>
        <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
          <div>
            <strong>Motif :</strong> {REPORT_REASON_LABEL[report.reason]}
          </div>
          {report.equipment && (
            <div>
              <strong>Équipement :</strong> {report.equipment}
            </div>
          )}
          {report.parks?.formatted_address && (
            <div>
              <strong>Localisation :</strong> {report.parks.formatted_address}
            </div>
          )}
          <div>
            <strong>Signalé par :</strong> {report.reported_by_name} · {new Date(report.created_at).toLocaleString("fr-FR")}
          </div>
          {report.comment && (
            <div>
              <strong>Détail :</strong> {report.comment}
            </div>
          )}
          {report.photo && (
            <div>
              <strong>Photo transmise :</strong>{" "}
              <a href={report.photo} target="_blank" rel="noreferrer">
                <img
                  src={report.photo}
                  alt="Photo jointe au signalement"
                  style={{ display: "block", marginTop: 4, width: 96, height: 96, objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}
                />
              </a>
            </div>
          )}
          {report.resolution_photo && (
            <div>
              <strong>Photo après résolution :</strong>{" "}
              <a href={report.resolution_photo} target="_blank" rel="noreferrer">
                <img
                  src={report.resolution_photo}
                  alt="Photo après résolution"
                  style={{ display: "block", marginTop: 4, width: 96, height: 96, objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}
                />
              </a>
            </div>
          )}
        </div>

        {active ? (
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
                <Button block disabled={!note || dismissing} loading={resolving} onClick={resolve}>
                  Résoudre
                </Button>
                <Button block variant="secondary" disabled={!note || resolving} loading={dismissing} onClick={dismiss}>
                  Ignorer
                </Button>
              </div>
              {!isAdmin && (
                <Button variant="ghost" block loading={schedulingFollowUp} onClick={scheduleFollowUp}>
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
              <Button variant="secondary" block loading={reopening} onClick={reopen}>
                Réouvrir le signalement
              </Button>
            )}
          </>
        )}

        {isAdmin && <ReportHistory reportId={report.id} />}
      </div>
    </Dialog>
  );
}
