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

describe("ContributionRow — une seule rangée", () => {
  it("chaque ligne a les mêmes colonnes ; « ⋯ » remplace le chevron sans colonne en plus", () => {
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
      for (const col of ["thumb", "typeIcon", "body", "trailing", "chevron"]) {
        expect(w.querySelectorAll(`[class*="${col}"]`)).toHaveLength(1);
      }
    }
    expect(wraps[0]!.querySelectorAll('[class*="menu"] button')).toHaveLength(1); // avis : menu
    expect(wraps[1]!.querySelectorAll('[class*="menu"]')).toHaveLength(0);
    expect(wraps[2]!.querySelectorAll('[class*="menu"]')).toHaveLength(0);
  });

  it("le titre complet reste accessible quand il est tronqué (attribut title)", () => {
    const { container } = render(<ContributionRow item={{ ...EDIT, parkName: "Un parc au nom vraiment très long" }} onClick={() => {}} />);
    expect(container.querySelector('[class*="subtitle"]')!.getAttribute("title")).toContain("Un parc au nom vraiment très long");
  });
});

describe("sprite", () => {
  it.each(["apps/mobile/public/icons-sprite.svg"])("%s contient coche, crayon et horloge", (file) => {
    const svg = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const id of ["ic-check", "ic-pencil", "ic-clock"]) expect(svg).toContain(`id="${id}"`);
  });
});
