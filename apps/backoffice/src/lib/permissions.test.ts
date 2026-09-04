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
  type PermissionRoleContext,
} from "./permissions";

const admin: PermissionRoleContext = { isAdmin: true, isGestionnaireOrAbove: true };
const gestionnaire: PermissionRoleContext = { isAdmin: false, isGestionnaireOrAbove: true };
const contributeur: PermissionRoleContext = { isAdmin: false, isGestionnaireOrAbove: false };

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
});
