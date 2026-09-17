import { Tag } from "@toboggo/design-system";
import {
  REPORT_SEVERITY_LABEL,
  type EditStatus,
  type ParkStatus,
  type ReportSeverity,
  type ReportStatus,
  type VerificationStatus,
} from "@toboggo/shared";

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

const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  unverified: "Non vérifié",
  community_verified: "Communauté",
  organization_verified: "Collectivité",
  toboggo_verified: "Toboggo",
};
const VERIFICATION_TONE: Record<VerificationStatus, "neutral" | "info" | "primary"> = {
  unverified: "neutral",
  community_verified: "info",
  organization_verified: "primary",
  toboggo_verified: "primary",
};

/** `unverified` (the default for every OSM-imported park) renders as a discreet
 * dash rather than a grey tag on every single row — a verification badge is
 * only shown once a park has actually been verified. */
export function ParkVerificationTag({ status }: { status: VerificationStatus }) {
  if (status === "unverified") return <span style={{ color: "var(--color-text-faint)" }}>—</span>;
  return <Tag tone={VERIFICATION_TONE[status]}>{VERIFICATION_LABEL[status]}</Tag>;
}

const REPORT_LABEL: Record<ReportStatus, string> = { open: "Ouvert", in_progress: "En cours", resolved: "Résolu", dismissed: "Ignoré" };
const REPORT_TONE: Record<ReportStatus, "warning" | "primary" | "neutral"> = { open: "warning", in_progress: "warning", resolved: "primary", dismissed: "neutral" };

export function ReportStatusTag({ status }: { status: ReportStatus }) {
  return <Tag tone={REPORT_TONE[status]}>{REPORT_LABEL[status]}</Tag>;
}

// `reports.severity` (colonne réelle, toujours renseignée par `createReport` —
// défaut "medium") n'était affichée nulle part dans le BO. `low`/`medium` ne
// changent rien à la lecture d'une ligne (tag neutre) ; seul `high`/`critical`
// portent une vraie couleur d'attention, conformément à « orange = attention,
// rouge = criticité réelle ».
const SEVERITY_TONE: Record<ReportSeverity, "neutral" | "warning" | "error"> = {
  low: "neutral",
  medium: "neutral",
  high: "warning",
  critical: "error",
};

export function ReportSeverityTag({ severity }: { severity: ReportSeverity }) {
  return <Tag tone={SEVERITY_TONE[severity]}>{REPORT_SEVERITY_LABEL[severity]}</Tag>;
}

const EDIT_LABEL: Record<EditStatus, string> = {
  pending: "En attente",
  approved: "Approuvée",
  rejected: "Rejetée",
  auto_approved: "Auto-approuvée",
};
const EDIT_TONE: Record<EditStatus, "warning" | "primary" | "error"> = {
  pending: "warning",
  approved: "primary",
  rejected: "error",
  auto_approved: "primary",
};

export function ParkEditStatusTag({ status }: { status: EditStatus }) {
  return <Tag tone={EDIT_TONE[status]}>{EDIT_LABEL[status]}</Tag>;
}
