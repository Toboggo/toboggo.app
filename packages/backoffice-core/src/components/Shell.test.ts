import { describe, expect, it } from "vitest";
import { buildNavGroups, isNavActive, NAV_ICON_GAPS, resolveScreenLabel } from "./Shell";

/** Routes actually registered in `App.tsx`'s `<Routes>` — kept in sync by
 * hand (small, stable list). Any nav item pointing outside this set would be
 * a dead link. */
const REGISTERED_ROUTES = new Set([
  "/",
  "/parks",
  "/validation",
  "/reports",
  "/reviews",
  "/app-feedback",
  "/photos",
  "/organizations",
  "/users",
  "/map",
  "/maintenance",
  "/journal",
  "/statistiques",
  "/settings",
]);

/** Screens explicitly not built yet (Lots 4–7) — the sidebar must never
 * link to them (validated Lot 2 decision: absent, not "coming soon"). */
const NOT_YET_BUILT_LABELS = ["Équipements", "Interventions", "Contrôles & inspections", "Infos à vérifier", "Messages"];

function flatten(opts: Parameters<typeof buildNavGroups>[0]) {
  return buildNavGroups(opts).flatMap((g) => g.items);
}

describe("buildNavGroups — Lot 2 sidebar", () => {
  const base = { pendingParks: 0, openReports: 0, pendingMedia: 0, pendingEdits: 0 };

  it("every commune nav item points to a real, registered route", () => {
    for (const item of flatten({ isAdmin: false, ...base })) {
      expect(REGISTERED_ROUTES.has(item.to)).toBe(true);
    }
  });

  it("every admin nav item points to a real, registered route", () => {
    for (const item of flatten({ isAdmin: true, ...base })) {
      expect(REGISTERED_ROUTES.has(item.to)).toBe(true);
    }
  });

  it("never links to a screen that doesn't exist yet", () => {
    const labels = [
      ...flatten({ isAdmin: false, ...base }).map((i) => i.label),
      ...flatten({ isAdmin: true, ...base }).map((i) => i.label),
    ];
    for (const banned of NOT_YET_BUILT_LABELS) {
      expect(labels).not.toContain(banned);
    }
  });

  it("matches the validated commune group structure exactly (Admin-UI-6B: Modération groups Signalements/Avis/Photos)", () => {
    const groups = buildNavGroups({ isAdmin: false, ...base });
    expect(groups.map((g) => [g.title, g.items.map((i) => i.label)])).toEqual([
      ["Pilotage", ["Tableau de bord"]],
      ["Parcs", ["Mes parcs", "Carte"]],
      ["Modération", ["Signalements", "Avis", "Photos"]],
      ["Exploitation", ["Entretien"]],
      ["Organisation", ["Journal", "Statistiques", "Équipe & Réglages"]],
    ]);
  });

  it("matches the validated admin group structure exactly, with Utilisateurs/Collectivités admin-only (Admin-UI-6B: Modération groups Signalements/Avis/Photos/File de validation)", () => {
    const communeLabels = flatten({ isAdmin: false, ...base }).map((i) => i.label);
    const adminGroups = buildNavGroups({ isAdmin: true, ...base });
    expect(adminGroups.map((g) => [g.title, g.items.map((i) => i.label)])).toEqual([
      ["Pilotage", ["Tableau de bord"]],
      ["Parcs", ["Parcs"]],
      ["Modération", ["Signalements", "Avis", "Photos", "File de validation"]],
      ["Organisation", ["Équipe & Réglages"]],
      ["Admin", ["Collectivités", "Utilisateurs", "Évaluations de l'app"]],
    ]);
    expect(communeLabels).not.toContain("Utilisateurs");
    expect(communeLabels).not.toContain("Collectivités");
  });

  it("Admin-UI-6B: no duplicate nav item across groups (each route appears exactly once per session type)", () => {
    for (const isAdmin of [true, false]) {
      const items = flatten({ isAdmin, ...base });
      const routes = items.map((i) => i.to);
      expect(new Set(routes).size).toBe(routes.length);
    }
  });

  it("carries the real pending counts through as badges", () => {
    const groups = buildNavGroups({ isAdmin: false, pendingParks: 3, openReports: 5, pendingMedia: 2, pendingEdits: 0 });
    const byLabel = Object.fromEntries(groups.flatMap((g) => g.items).map((i) => [i.label, i.badge]));
    expect(byLabel["Mes parcs"]).toBe(3);
    expect(byLabel["Signalements"]).toBe(5);
    expect(byLabel["Photos"]).toBe(2);
    expect(byLabel["Carte"]).toBeUndefined();
  });

  it("Admin-UI-6B: Avis never carries a badge (pas encore de définition d'un avis à modérer)", () => {
    for (const isAdmin of [true, false]) {
      const groups = buildNavGroups({ isAdmin, pendingParks: 1, openReports: 1, pendingMedia: 1, pendingEdits: 1 });
      const byLabel = Object.fromEntries(groups.flatMap((g) => g.items).map((i) => [i.label, i.badge]));
      expect(byLabel["Avis"]).toBeUndefined();
    }
  });

  it("carries the pending park_edits count as the admin-only 'File de validation' badge", () => {
    const groups = buildNavGroups({ isAdmin: true, pendingParks: 0, openReports: 0, pendingMedia: 0, pendingEdits: 7 });
    const byLabel = Object.fromEntries(groups.flatMap((g) => g.items).map((i) => [i.label, i.badge]));
    expect(byLabel["File de validation"]).toBe(7);
  });

  it("never exposes 'File de validation' to a Collectivité session (Admin-3B-1 §11)", () => {
    const communeLabels = flatten({ isAdmin: false, ...base }).map((i) => i.label);
    expect(communeLabels).not.toContain("File de validation");
  });

  it("Admin-UI-7E-B : « Photos » a désormais ic-camera (Admin et Collectivité), « Collectivités » a ic-building", () => {
    for (const isAdmin of [true, false]) {
      const byLabel = Object.fromEntries(flatten({ isAdmin, ...base }).map((i) => [i.label, i.icon]));
      expect(byLabel["Photos"]).toBe("ic-camera");
    }
    const adminByLabel = Object.fromEntries(flatten({ isAdmin: true, ...base }).map((i) => [i.label, i.icon]));
    expect(adminByLabel["Collectivités"]).toBe("ic-building");
  });

  it("Admin-UI-7E-B : NAV_ICON_GAPS ne liste plus /photos ni /organizations (résolus), mais garde /maintenance et /journal (toujours sans pictogramme sûr)", () => {
    expect(NAV_ICON_GAPS["/photos"]).toBeUndefined();
    expect(NAV_ICON_GAPS["/organizations"]).toBeUndefined();
    expect(NAV_ICON_GAPS["/maintenance"]).toBeTruthy();
    expect(NAV_ICON_GAPS["/journal"]).toBeTruthy();
  });
});

describe("breadcrumb & active state on dynamic routes", () => {
  const items = buildNavGroups({ isAdmin: false, pendingParks: 0, openReports: 0, pendingMedia: 0, pendingEdits: 0 }).flatMap((g) => g.items);

  it("resolves the section label for an exact route", () => {
    expect(resolveScreenLabel(items, "/parks")).toBe("Mes parcs");
    expect(resolveScreenLabel(items, "/")).toBe("Tableau de bord");
  });

  it("resolves the parent section for /parks/:id and /parks/new", () => {
    expect(resolveScreenLabel(items, "/parks/4afbcae8-b5b9-4646-8fd5-48c70d9cb188")).toBe("Mes parcs");
    expect(resolveScreenLabel(items, "/parks/new")).toBe("Mes parcs");
  });

  it("uses the admin label on the admin sidebar", () => {
    const admin = buildNavGroups({ isAdmin: true, pendingParks: 0, openReports: 0, pendingMedia: 0, pendingEdits: 0 }).flatMap((g) => g.items);
    expect(resolveScreenLabel(admin, "/parks/abc")).toBe("Parcs");
  });

  it("never resolves '/' as a parent of unknown routes, nor a prefix lookalike", () => {
    expect(resolveScreenLabel(items, "/inconnu")).toBeUndefined();
    expect(resolveScreenLabel(items, "/parksfoo")).toBeUndefined();
  });

  it("keeps a nav entry active on its sub-routes only", () => {
    expect(isNavActive("/parks", "/parks")).toBe(true);
    expect(isNavActive("/parks", "/parks/abc")).toBe(true);
    expect(isNavActive("/parks", "/parksfoo")).toBe(false);
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/", "/parks")).toBe(false);
  });
});
