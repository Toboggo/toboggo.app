import { describe, expect, it } from "vitest";
import { normalizeUsername, validateUsername } from "./username";

describe("validateUsername", () => {
  it("accepte 3 à 24 caractères et normalise les espaces", () => {
    expect(validateUsername("  Camille   et Léo ")).toEqual({ ok: true, value: "Camille et Léo" });
    expect(validateUsername("abc")).toEqual({ ok: true, value: "abc" });
    expect(validateUsername("x".repeat(24)).ok).toBe(true);
  });
  it("compte les caractères Unicode, pas les unités UTF-16", () => {
    expect(validateUsername("🙂🙂🙂").ok).toBe(true);
    expect(validateUsername("🙂".repeat(24)).ok).toBe(true);
  });
  it("refuse trop court / trop long", () => {
    expect(validateUsername("ab")).toEqual({ ok: false, issue: "tooShort" });
    expect(validateUsername("   ")).toEqual({ ok: false, issue: "tooShort" });
    expect(validateUsername("x".repeat(25))).toEqual({ ok: false, issue: "tooLong" });
  });
  it("refuse @ < > et caractères de contrôle", () => {
    for (const bad of ["a@b.com", "<b>gras", "tab\there", "nul\u0000x"]) {
      expect(validateUsername(bad)).toEqual({ ok: false, issue: "invalidChars" });
    }
  });
  it("normalizeUsername", () => {
    expect(normalizeUsername("  a   b ")).toBe("a b");
  });
});
