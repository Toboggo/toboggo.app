import { describe, expect, it } from "vitest";
import { SOCIAL_LINKS } from "../config/site";
import { listSocials } from "./social";

describe("listSocials", () => {
  it("n'affiche rien tant qu'aucun réseau n'est configuré (état actuel du site)", () => {
    expect(SOCIAL_LINKS).toEqual([]);
    expect(listSocials(SOCIAL_LINKS)).toEqual([]);
  });

  it("garde un lien https valide avec libellé", () => {
    const link = { label: "Instagram", href: "https://www.instagram.com/toboggo" };
    expect(listSocials([link])).toEqual([link]);
  });

  it("écarte les liens invalides : http, javascript:, vide, sans libellé, sans domaine", () => {
    const bad = [
      { label: "X", href: "http://x.com/toboggo" },
      { label: "X", href: "javascript:alert(1)" },
      { label: "X", href: "" },
      { label: "", href: "https://www.instagram.com/toboggo" },
      { label: "  ", href: "https://www.instagram.com/toboggo" },
      { label: "X", href: "https://localhost" },
      { label: "X", href: "pas une url" },
    ];
    expect(listSocials(bad)).toEqual([]);
  });
});
