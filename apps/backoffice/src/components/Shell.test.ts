import { describe, expect, it } from "vitest";
import { buildNavGroups } from "./Shell";

/** Routes actually registered in `App.tsx`'s `<Routes>` — kept in sync by
 * hand (small, stable list). Any nav item pointing outside this set would be
 * a dead link. */
const REGISTERED_ROUTES = new Set([
  "/",
  "/parks",
  "/reports",
  "/reviews",
  "/photos",
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
  const base = { pendingParks: 0, openReports: 0, pendingMedia: 0 };

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

  it("matches the validated commune group structure exactly", () => {
    const groups = buildNavGroups({ isAdmin: false, ...base });
    expect(groups.map((g) => [g.title, g.items.map((i) => i.label)])).toEqual([
      ["Pilotage", ["Tableau de bord"]],
      ["Parcs", ["Mes parcs", "Carte"]],
      ["Exploitation", ["Signalements", "Entretien"]],
      ["Échanges / Qualité", ["Avis", "Photos"]],
      ["Organisation", ["Journal", "Statistiques", "Équipe & Réglages"]],
    ]);
  });

  it("matches the validated admin group structure exactly, with Utilisateurs admin-only", () => {
    const communeLabels = flatten({ isAdmin: false, ...base }).map((i) => i.label);
    const adminGroups = buildNavGroups({ isAdmin: true, ...base });
    expect(adminGroups.map((g) => [g.title, g.items.map((i) => i.label)])).toEqual([
      ["Pilotage", ["Tableau de bord"]],
      ["Parcs", ["Parcs"]],
      ["Exploitation", ["Signalements"]],
      ["Échanges / Qualité", ["Avis", "Photos"]],
      ["Organisation", ["Équipe & Réglages"]],
      ["Admin", ["Utilisateurs"]],
    ]);
    expect(communeLabels).not.toContain("Utilisateurs");
  });

  it("carries the real pending counts through as badges", () => {
    const groups = buildNavGroups({ isAdmin: false, pendingParks: 3, openReports: 5, pendingMedia: 2 });
    const byLabel = Object.fromEntries(groups.flatMap((g) => g.items).map((i) => [i.label, i.badge]));
    expect(byLabel["Mes parcs"]).toBe(3);
    expect(byLabel["Signalements"]).toBe(5);
    expect(byLabel["Photos"]).toBe(2);
    expect(byLabel["Carte"]).toBeUndefined();
  });
});
