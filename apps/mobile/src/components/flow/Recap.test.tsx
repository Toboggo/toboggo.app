import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import "../../i18n/testInit";
import { RecapCard, RecapRow, dedupeAddress } from "./Recap";

describe("dedupeAddress", () => {
  it("n'affiche jamais deux fois le même segment", () => {
    expect(dedupeAddress("Boulevard Pierre Bousquet, 12100 Millau, 12100 Millau")).toBe("Boulevard Pierre Bousquet, 12100 Millau");
    expect(dedupeAddress("12 rue des Tilleuls, 69001 Lyon", "69001 Lyon")).toBe("12 rue des Tilleuls, 69001 Lyon");
    expect(dedupeAddress("", "12100 Millau")).toBe("12100 Millau");
    expect(dedupeAddress(null, undefined)).toBe("");
  });
  it("ignore casse et accents", () => {
    expect(dedupeAddress("Rue X, Besançon", "besancon")).toBe("Rue X, Besançon");
  });
});

describe("RecapCard", () => {
  it("est UNE seule carte : les lignes ne sont jamais des cartes imbriquées", () => {
    const { container } = render(
      <RecapCard thumb={<div />} name="Parc" address="1 rue X">
        <RecapRow icon="ic-camera" title="Photos" onEdit={() => {}}>Aucune photo</RecapRow>
        <RecapRow icon="ic-pencil" title="Description" onEdit={() => {}}>—</RecapRow>
      </RecapCard>,
    );
    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(container.querySelectorAll("section section")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(2);
  });
});
