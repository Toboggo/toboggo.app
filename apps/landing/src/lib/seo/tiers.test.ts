import { describe, expect, it } from "vitest";
import { park, rich } from "./fixtures";
import { isIndexablePark, isPhotoUsable, parkTier, qualitySignals, usablePhotos } from "./tiers";

const specific = (o = {}) => rich({ name: "Parc de la Mairie", ...o });

describe("park tiers", () => {
  it("tier 0: not listable (no coordinates or postal code)", () => {
    expect(parkTier(park({ postalCode: null })).tier).toBe(0);
    expect(parkTier(park({ latitude: null })).tier).toBe(0);
  });

  it("tier 1: listed only when poorly documented", () => {
    const t = parkTier(park());
    expect(t.tier).toBe(1);
    expect(t.missing[0]).toMatch(/documentation/);
  });

  it("tier 2: documented (detailed card) but not indexable without a quality signal", () => {
    const t = parkTier(specific());
    expect(t.tier).toBe(2);
    expect(t.missing).toContain("signal de qualité (collectivité vérifiée, photo à droits validés ou vérification réelle)");
    expect(isIndexablePark(specific())).toBe(false);
  });

  it("tier 2: a generic name never reaches tier 3, even with a quality signal", () => {
    const t = parkTier(rich({ name: "Aire de jeux", lastVerifiedAt: "2026-09-01T00:00:00Z" }));
    expect(t.tier).toBe(2);
    expect(t.missing).toContain("nom spécifique");
  });

  it("tier 3 with a verified collectivity", () => {
    const t = parkTier(specific({ collectivityVerified: true }));
    expect(t).toMatchObject({ tier: 3, signals: ["collectivity"], missing: [] });
  });

  it("tier 3 with a real verification date", () => {
    expect(parkTier(specific({ lastVerifiedAt: "2026-09-01T00:00:00Z" })).tier).toBe(3);
  });

  it("tier 3 with a rights-validated photo", () => {
    expect(parkTier(specific({ photos: [{ url: "u", rightsStatus: "validated" }] })).tier).toBe(3);
  });

  it("a photo with unknown or rejected rights is NOT a quality signal and is never usable", () => {
    const unknown = specific({ photos: [{ url: "u", rightsStatus: "unknown" }, { url: "v", rightsStatus: "rejected" }] });
    expect(parkTier(unknown).tier).toBe(2);
    expect(qualitySignals(unknown)).toEqual([]);
    expect(usablePhotos(unknown)).toEqual([]);
    expect(isPhotoUsable({ rightsStatus: "unknown" })).toBe(false);
    expect(isPhotoUsable({ rightsStatus: "validated" })).toBe(true);
  });

  it("verification_status alone is not a signal: only a real last_verified_at counts", () => {
    expect(parkTier(specific({ verificationStatus: "verified", lastVerifiedAt: null })).tier).toBe(2);
  });

  it("requires an address and at least 3 declared infos for tier 3", () => {
    const noAddress = parkTier(specific({ collectivityVerified: true, addressLine: null }));
    expect(noAddress.tier).toBe(2);
    expect(noAddress.missing).toContain("adresse");
    const ageOnly = parkTier(park({ name: "Parc de la Mairie", minAge: 2, maxAge: 12, collectivityVerified: true }));
    expect(ageOnly.tier).toBe(2);
    expect(ageOnly.missing).toContain("≥ 3 infos déclarées");
  });
});
