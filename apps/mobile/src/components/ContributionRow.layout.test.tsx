import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render } from "@testing-library/react";
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

  it("le nom complet du parc est affiché en premier, sans troncature", () => {
    const longName = "Un parc au nom vraiment très long, avec plusieurs mots, pour le test";
    const { container } = render(<ContributionRow item={{ ...EDIT, parkName: longName }} onClick={() => {}} />);
    const name = container.querySelector('[class*="name"]')!;
    expect(name.textContent).toBe(longName);
    expect(container.querySelector('[class*="body"]')!.firstElementChild).toBe(name);
  });

  it("la pastille de statut est un bouton séparé, nommé, qui n'ouvre pas la ligne", () => {
    let opened = 0;
    const { getByRole, queryByRole } = render(<ContributionRow item={EDIT} onClick={() => opened++} />);
    const pill = getByRole("button", { name: "Statut : En vérification" });
    expect(queryByRole("status")).toBeNull();
    fireEvent.click(pill);
    expect(opened).toBe(0);
    expect(getByRole("status").textContent).toBe("En vérification");
    expect(pill.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("status")).toBeNull();
  });
});

describe("sprite", () => {
  it.each(["apps/mobile/public/icons-sprite.svg"])("%s contient coche, crayon et horloge", (file) => {
    const svg = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const id of ["ic-check", "ic-pencil", "ic-clock"]) expect(svg).toContain(`id="${id}"`);
  });
});
