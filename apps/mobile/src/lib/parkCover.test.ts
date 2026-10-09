import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PARK_COVER_MANIFEST_V1, getParkCover, hashParkId, parkIllustrationSrc } from "./parkCover";

describe("parkCover — manifest v1", () => {
  it("12 fichiers ordonnés playground-01…12, tous présents dans public/", () => {
    expect(PARK_COVER_MANIFEST_V1).toHaveLength(12);
    PARK_COVER_MANIFEST_V1.forEach((src, i) => {
      expect(src).toBe(`/images/park-placeholders/v1/playground-${String(i + 1).padStart(2, "0")}.webp`);
      expect(existsSync(resolve(__dirname, "../../public", src.slice(1)))).toBe(true);
    });
  });
});

describe("parkCover — attribution", () => {
  it("stable : même id → même illustration, sans aléatoire", () => {
    const first = parkIllustrationSrc("park-abc");
    for (let i = 0; i < 20; i++) expect(parkIllustrationSrc("park-abc")).toBe(first);
  });

  it("valeurs de référence figées (une dérive du hash réattribuerait tous les parcs)", () => {
    expect(hashParkId("")).toBe(0x811c9dc5);
    expect(hashParkId("a")).toBe(0xe40c292c);
  });

  it("répartit des ids réalistes sur les 12 illustrations", () => {
    const used = new Set<string>();
    for (let i = 0; i < 500; i++) used.add(parkIllustrationSrc(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`));
    expect(used.size).toBe(12);
  });
});

describe("parkCover — priorité photo", () => {
  it("photo approuvée (park.photos) prioritaire, sinon illustration", () => {
    expect(getParkCover({ id: "p1", photos: ["https://x/a.jpg"] }).kind).toBe("photo");
    expect(getParkCover({ id: "p1", photos: [] }).kind).toBe("illustration");
    expect(getParkCover({ id: "p1", photos: null as unknown as string[] }).kind).toBe("illustration");
  });
});
