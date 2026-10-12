import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import "../i18n/testInit";
import { AmenityBadge, ParkBadge } from "./ParkBadge";
import type { AmenityEntry } from "../lib/parkAmenities";

const entry = (over: Partial<AmenityEntry>): AmenityEntry => ({ code: "fenced", kind: "service", state: "present", verified: false, ...over });

describe("AmenityBadge — trois états", () => {
  it("présent / absent / inconnu : variante et libellé explicites", () => {
    const { container } = render(
      <>
        <AmenityBadge entry={entry({ state: "present" })} />
        <AmenityBadge entry={entry({ state: "absent" })} />
        <AmenityBadge entry={entry({ state: "unknown" })} />
      </>,
    );
    const badges = [...container.querySelectorAll("[data-variant]")];
    expect(badges.map((b) => b.getAttribute("data-variant"))).toEqual(["present", "absent", "unknown"]);
    expect(badges.map((b) => b.textContent)).toEqual(["Clôturé", "Pas de clôture", "Clôture à confirmer"]);
  });

  it("jeux : « Sans … » pour un jeu absent, « … à confirmer » pour un jeu inconnu, jamais barré", () => {
    const { container } = render(
      <>
        <AmenityBadge entry={entry({ kind: "play", code: "slide", state: "absent" })} />
        <AmenityBadge entry={entry({ kind: "play", code: "slide", state: "unknown" })} />
      </>,
    );
    expect(container.textContent).toBe("Sans tobogganToboggan à confirmer");
    expect(container.querySelector("s, del, [style*='line-through']")).toBeNull();
  });

  it("le badge de résumé ne porte jamais « Vérifié » (réservé à la page Équipements)", () => {
    const { container } = render(<AmenityBadge entry={entry({ state: "present", verified: true })} />);
    expect(container.textContent).toBe("Clôturé");
  });
});

describe("ParkBadge", () => {
  it("icône seule : image nommée, sans texte visible", () => {
    const { getByRole } = render(<ParkBadge variant="present" label="WC" icon="ic-toilets" iconOnly />);
    expect(getByRole("img", { name: "WC" }).textContent).toBe("");
  });
});
