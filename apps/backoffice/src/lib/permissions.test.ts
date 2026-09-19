import { describe, expect, it } from "vitest";
import {
  canCreatePark,
  canDeleteReview,
  canEditCommuneSettings,
  canEditPark,
  canImportParksCsv,
  canManageTeam,
  canReplyToReview,
  canResolveReport,
  canReviewParkEdit,
  type PermissionRoleContext,
} from "./permissions";

const admin: PermissionRoleContext = { isAdmin: true, isGestionnaireOrAbove: true };
const gestionnaire: PermissionRoleContext = { isAdmin: false, isGestionnaireOrAbove: true };
const contributeur: PermissionRoleContext = { isAdmin: false, isGestionnaireOrAbove: false };
/** Staff `support` : `isAdmin` (org null) mais PAS `isGestionnaireOrAbove`
 * (rôle exclu de la liste gestionnaire/super_admin/moderation) — le cas
 * exact que `review_park_edit()` (0037) refuse via `is_toboggo_admin`. */
const supportStaff: PermissionRoleContext = { isAdmin: true, isGestionnaireOrAbove: false };

describe("permissions — D. an action never appears available to a role it would fail for", () => {
  it("a contributeur cannot create/import parks (organization_parks insert requires gestionnaire)", () => {
    expect(canCreatePark(contributeur)).toBe(false);
    expect(canImportParksCsv(contributeur)).toBe(false);
  });

  it("a contributeur cannot resolve a report (reports_update is gestionnaire+/staff only)", () => {
    expect(canResolveReport(contributeur)).toBe(false);
  });

  it("a contributeur cannot reply to a review (reviews_update is gestionnaire+/staff only)", () => {
    expect(canReplyToReview(contributeur)).toBe(false);
  });

  it("a contributeur cannot delete a review (staff only)", () => {
    expect(canDeleteReview(contributeur)).toBe(false);
  });

  it("a contributeur cannot manage the team (team_write/update/delete are gestionnaire+/staff only)", () => {
    expect(canManageTeam(contributeur)).toBe(false);
  });

  it("a contributeur cannot edit the commune settings (organizations_update is gestionnaire+/staff only)", () => {
    expect(canEditCommuneSettings(contributeur)).toBe(false);
  });

  it("a contributeur cannot review a park_edit (review_park_edit is gestionnaire+/admin only)", () => {
    expect(canReviewParkEdit(contributeur)).toBe(false);
  });

  it("a support staff member cannot review a park_edit — review_park_edit's is_toboggo_admin() gate excludes support, unlike the broader isAdmin used elsewhere", () => {
    expect(canReviewParkEdit(supportStaff)).toBe(false);
  });
});

describe("permissions — G. existing staff/admin capabilities do not regress", () => {
  it("a Toboggo admin retains edit/resolve/team capabilities", () => {
    expect(canEditPark(admin)).toBe(true);
    expect(canResolveReport(admin)).toBe(true);
    expect(canManageTeam(admin)).toBe(true);
    expect(canDeleteReview(admin)).toBe(true);
  });

  it("an admin does not create parks from this screen (no organisation context to attach to)", () => {
    expect(canCreatePark(admin)).toBe(false);
  });

  it("a gestionnaire retains full collectivité capabilities", () => {
    expect(canCreatePark(gestionnaire)).toBe(true);
    expect(canImportParksCsv(gestionnaire)).toBe(true);
    expect(canEditPark(gestionnaire)).toBe(true);
    expect(canResolveReport(gestionnaire)).toBe(true);
    expect(canReplyToReview(gestionnaire)).toBe(true);
    expect(canManageTeam(gestionnaire)).toBe(true);
    expect(canEditCommuneSettings(gestionnaire)).toBe(true);
  });

  it("a gestionnaire does not get the staff-only review delete capability", () => {
    expect(canDeleteReview(gestionnaire)).toBe(false);
  });

  it("a Toboggo admin (super_admin/moderation) and a gestionnaire can both review park_edits", () => {
    expect(canReviewParkEdit(admin)).toBe(true);
    expect(canReviewParkEdit(gestionnaire)).toBe(true);
  });
});
