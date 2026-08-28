import { Tag } from "@toboggo/design-system";
import type { ParkStatus, ReportStatus } from "@toboggo/shared";

const PARK_LABEL: Record<ParkStatus, string> = {
  draft: "Brouillon",
  pending: "En attente",
  published: "Publié",
  blocked: "Bloqué",
  rejected: "Refusé",
};
const PARK_TONE: Record<ParkStatus, "primary" | "warning" | "error" | "neutral"> = {
  draft: "neutral",
  pending: "warning",
  published: "primary",
  blocked: "error",
  rejected: "error",
};

export function ParkStatusTag({ status }: { status: ParkStatus }) {
  return <Tag tone={PARK_TONE[status]}>{PARK_LABEL[status]}</Tag>;
}

const REPORT_LABEL: Record<ReportStatus, string> = { open: "Ouvert", in_progress: "En cours", resolved: "Résolu", dismissed: "Ignoré" };
const REPORT_TONE: Record<ReportStatus, "warning" | "primary" | "neutral"> = { open: "warning", in_progress: "warning", resolved: "primary", dismissed: "neutral" };

export function ReportStatusTag({ status }: { status: ReportStatus }) {
  return <Tag tone={REPORT_TONE[status]}>{REPORT_LABEL[status]}</Tag>;
}
