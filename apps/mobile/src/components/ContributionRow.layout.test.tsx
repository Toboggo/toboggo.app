import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import type { UserContribution } from "@toboggo/shared";
import "../i18n/testInit";
import { ContributionRow } from "./ContributionRow";

const base = { parkId: "p", parkName: "Parc", city: "Lyon", createdAt: "2026-09-01T10:00:00.000Z", thumbnail: null };
const REVIEW: UserContribution = { ...base, id: "r", sourceId: "r", type: "review", status: "published", rating: 5 };
const REPORT: UserContribution = { ...base, id: "x", sourceId: "x", type: "report", status: "open" };
const EDIT: UserContribution = { ...base, id: "e", sourceId: "e", type: "edit", status: "pending" };

describe("ContributionRow — colonnes communes", () => {
  it("chaque ligne (avec ou sans « ⋯ ») a le même squelette : contenu + colonne d'actions réservée", () => {
    const { container } = render(
      <>
        <ContributionRow item={REVIEW} onClick={() => {}} onEditReview={() => {}} />
        <ContributionRow item={REPORT} onClick={() => {}} onEditReview={() => {}} />
        <ContributionRow item={EDIT} onClick={() => {}} onEditReview={() => {}} />
      </>,
    );
    const wraps = container.querySelectorAll('[class*="rowWrap"]');
    expect(wraps).toHaveLength(3);
    for (const w of wraps) {
      expect(w.querySelectorAll('[class*="actions"]')).toHaveLength(1);
      expect(w.querySelectorAll('[class*="trailing"]')).toHaveLength(1);
    }
    expect(wraps[0]!.querySelectorAll('[class*="actions"] button')).toHaveLength(1); // avis : menu
    expect(wraps[1]!.querySelectorAll('[class*="actions"] button')).toHaveLength(0);
  });
});

describe("sprite", () => {
  it.each(["apps/mobile/public/icons-sprite.svg"])("%s contient coche, crayon et horloge", (file) => {
    const svg = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const id of ["ic-check", "ic-pencil", "ic-clock"]) expect(svg).toContain(`id="${id}"`);
  });
});
