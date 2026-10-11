import { useOrgSession } from "./orgSession";
import { useOrgScope } from "./orgScope";

/**
 * Centralised UI capabilities (Lot 1 — audit §6 bis / §20, objectif 3).
 *
 * These functions are a thin, pure derivation of the roles/helpers already
 * computed by `orgSession` (`isAdmin`, `isGestionnaireOrAbove`) — NOT a second,
 * independent permission system. RLS remains the backend authority; the goal
 * here is only to make sure the interface never *offers* an action that would
 * fail server-side.
 *
 * Each function below was checked against the real RLS policy it corresponds
 * to (supabase/migrations) rather than assumed from the audit — see the
 * per-function comment. Where RLS is technically broader than the UI gate
 * (parks / team media), the gate is kept as-is (or stricter) on purpose: a
 * stricter UI never causes a "shown but forbidden" bug, only a looser one
 * would. Where a gap was found (review replies), the gate is added here.
 */
export interface PermissionRoleContext {
  isAdmin: boolean;
  isGestionnaireOrAbove: boolean;
}

export function canCreatePark(ctx: PermissionRoleContext): boolean {
  // `parks_insert` (RLS) only requires an authenticated user, but the
  // `organization_parks` INSERT that links the new park to its collectivité
  // requires `is_org_gestionnaire` (migration 0018) — only a gestionnaire can
  // usefully create a park that stays visible to its own organisation. Admin
  // has no organisation context to attach a park to from this screen.
  return !ctx.isAdmin && ctx.isGestionnaireOrAbove;
}

export const canImportParksCsv = canCreatePark;

export function canEditPark(ctx: PermissionRoleContext): boolean {
  // `parks_update` (RLS, migration 0020) actually allows any member of the
  // owning organisation (`can_edit_park` → `manages_park` has no role
  // filter), but the product intends only gestionnaire+/staff to edit,
  // validate, block or remove a park — kept stricter than RLS on purpose.
  return ctx.isAdmin || ctx.isGestionnaireOrAbove;
}

export function canResolveReport(ctx: PermissionRoleContext): boolean {
  // `reports_update` (RLS, migration 0021) is gestionnaire+/staff only —
  // matches exactly.
  return ctx.isAdmin || ctx.isGestionnaireOrAbove;
}

export function canReplyToReview(ctx: PermissionRoleContext): boolean {
  // `reviews_update` (RLS, migration 0021) is gestionnaire+/staff only. The
  // back office previously showed the reply form to every collectivité
  // member; for a contributeur the write silently affects 0 rows (no error
  // surfaced) — gated here to fix that.
  return !ctx.isAdmin && ctx.isGestionnaireOrAbove;
}

export function canDeleteReview(ctx: PermissionRoleContext): boolean {
  // `reviews_delete` (RLS, migration 0002) actually requires `is_toboggo_admin`
  // (super_admin/moderation), narrower than "any staff" — a `support` role
  // staff member has `isAdmin: true` in this UI (they see the admin nav) but
  // is NOT `is_toboggo_admin`, so this button can appear for them and the
  // delete would be rejected server-side. Pre-existing behaviour (identical
  // to the `isAdmin` check this replaces) — not introduced or fixed by this
  // lot; flagged for a future pass rather than silently narrowed here.
  return ctx.isAdmin;
}

export function canManageTeam(ctx: PermissionRoleContext): boolean {
  // `team_write` / `team_update` / `team_delete` (RLS, migration 0002) are
  // gestionnaire+/staff only.
  return ctx.isAdmin || ctx.isGestionnaireOrAbove;
}

export function canEditCommuneSettings(ctx: PermissionRoleContext): boolean {
  // `organizations_update` (RLS, migration 0018) is gestionnaire+/staff only;
  // this screen is only ever shown in a commune context, so staff is moot here.
  return ctx.isGestionnaireOrAbove;
}

/**
 * `review_park_edit()` (RLS, migration 0037) imposes a filter STRICTER than
 * plain staff/gestionnaire: `is_toboggo_admin` only (super_admin/moderation —
 * `support` explicitly excluded) for staff, `is_org_gestionnaire` for a
 * collectivité. Unlike `canEditPark` above, `ctx.isAdmin` must NOT be OR'd in
 * here — it is broad staff (includes `support`), which the RPC itself
 * refuses. `isGestionnaireOrAbove` alone is exactly the right gate: it's
 * computed from `currentRole()`, scoped to whichever org is active, and
 * already only returns true for gestionnaire/super_admin/moderation — the
 * same 3 roles the RPC accepts, whether the active org is "admin" or a
 * commune.
 */
export function canReviewParkEdit(ctx: PermissionRoleContext): boolean {
  return ctx.isGestionnaireOrAbove;
}

/**
 * `park_media_update` / `park_media_delete` (RLS, migration 0027) both key off
 * `manages_park()`, which — exactly like `parks_update` (see `canEditPark`) —
 * actually allows ANY member of the owning organisation (even `contributeur`)
 * or any Toboggo staff role (including `support`), with no role filter of its
 * own. Kept stricter here on purpose, same product convention already applied
 * to `canEditPark` / `canResolveReport`: only gestionnaire+/staff moderate
 * media from the UI, so a `contributeur` never sees Approuver/Refuser/
 * Supprimer for a resource RLS would in fact let them write.
 */
export function canModerateMedia(ctx: PermissionRoleContext): boolean {
  return ctx.isAdmin || ctx.isGestionnaireOrAbove;
}

export interface Permissions {
  canCreatePark: boolean;
  canImportParksCsv: boolean;
  canEditPark: boolean;
  canResolveReport: boolean;
  canReplyToReview: boolean;
  canDeleteReview: boolean;
  canManageTeam: boolean;
  canEditCommuneSettings: boolean;
  canReviewParkEdit: boolean;
  canModerateMedia: boolean;
}

/** Reads the current role from `orgSession`/`orgScope` and derives every
 * capability above. Use this in screens instead of recomputing ad hoc
 * `isAdmin || isGestionnaireOrAbove()` combinations. */
export function usePermissions(): Permissions {
  const { isAdmin } = useOrgScope();
  const isGestionnaireOrAbove = useOrgSession((s) => s.isGestionnaireOrAbove());
  const ctx: PermissionRoleContext = { isAdmin: !!isAdmin, isGestionnaireOrAbove };
  return {
    canCreatePark: canCreatePark(ctx),
    canImportParksCsv: canImportParksCsv(ctx),
    canEditPark: canEditPark(ctx),
    canResolveReport: canResolveReport(ctx),
    canReplyToReview: canReplyToReview(ctx),
    canDeleteReview: canDeleteReview(ctx),
    canManageTeam: canManageTeam(ctx),
    canEditCommuneSettings: canEditCommuneSettings(ctx),
    canReviewParkEdit: canReviewParkEdit(ctx),
    canModerateMedia: canModerateMedia(ctx),
  };
}
