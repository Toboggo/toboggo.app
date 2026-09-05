import { Tag } from "@toboggo/design-system";
import type { ParkStatus, ReportStatus, VerificationStatus } from "@toboggo/shared";

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
