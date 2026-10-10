import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import "../i18n/testInit";
import { ParkCover } from "./ParkCover";
import { parkIllustrationSrc } from "../lib/parkCover";

const imgs = (c: HTMLElement) => Array.from(c.querySelectorAll("img"));

describe("ParkCover", () => {
  it("sans photo : illustration déterministe, aucun badge visible, rôle img", () => {
    const { container, queryByText, getByRole } = render(<ParkCover park={{ id: "p1", photos: [] }} />);
    expect(imgs(container)[0]!.getAttribute("src")).toBe(parkIllustrationSrc("p1"));
    expect(queryByText("Illustration")).toBeNull();
    expect(getByRole("img").getAttribute("aria-label")).toMatch(/Illustration/);
  });

  it("la même illustration pour deux rendus du même parc", () => {
    const a = render(<ParkCover park={{ id: "same", photos: [] }} />);
    const b = render(<ParkCover park={{ id: "same", photos: [] }} />);
    expect(imgs(a.container)[0]!.getAttribute("src")).toBe(imgs(b.container)[0]!.getAttribute("src"));
  });

  it("photo approuvée : affichée, lazy", () => {
    const { container, queryByText } = render(<ParkCover park={{ id: "p1", photos: ["https://x/a.jpg"] }} />);
    const img = imgs(container)[0]!;
    expect(img.getAttribute("src")).toBe("https://x/a.jpg");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(queryByText("Illustration")).toBeNull();
  });

  it("erreur de la photo → illustration de secours ; erreur de l'illustration → logo, sans boucle", () => {
    const { container, getByRole } = render(<ParkCover park={{ id: "p1", photos: ["https://x/broken.jpg"] }} />);
    fireEvent.error(imgs(container)[0]!);
    const fallback = imgs(container)[0]!;
    expect(fallback.getAttribute("src")).toBe(parkIllustrationSrc("p1"));
    expect(getByRole("img").getAttribute("aria-label")).toMatch(/Illustration/);
    fireEvent.error(fallback);
    expect(imgs(container)).toHaveLength(0);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
