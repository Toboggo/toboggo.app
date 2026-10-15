import { describe, expect, it } from "vitest";
import { ATTRIBUTION_CONTROL_H, attributionLayout } from "./attributionLayout";

const base = { navH: 84, viewportH: 812, headerBottom: 72 };

describe("attributionLayout — attribution au-dessus de la feuille et de la navigation", () => {
  it("peek : juste au-dessus de la barre + feuille, visible", () => {
    expect(attributionLayout({ ...base, sheetHeight: 96 })).toEqual({ bottom: 180, hidden: false });
  });

  it("suit la hauteur de la feuille (cran intermédiaire), visible", () => {
    expect(attributionLayout({ ...base, sheetHeight: 340 })).toEqual({ bottom: 424, hidden: false });
  });

  it("n'est jamais sous la barre de navigation, même feuille nulle", () => {
    expect(attributionLayout({ ...base, sheetHeight: 0 })).toEqual({ bottom: 84, hidden: false });
  });

  it("dernier cran (carte couverte) : masqué, jamais écrasé sous l'en-tête", () => {
    expect(attributionLayout({ ...base, sheetHeight: 650 }).hidden).toBe(true);
  });

  it("seuil exact : visible tant que le contrôle tient entre l'en-tête et la feuille", () => {
    const fits = base.viewportH - base.headerBottom - ATTRIBUTION_CONTROL_H - base.navH; // 600
    expect(attributionLayout({ ...base, sheetHeight: fits }).hidden).toBe(false);
    expect(attributionLayout({ ...base, sheetHeight: fits + 1 }).hidden).toBe(true);
  });

  it("320×640 : mêmes garanties", () => {
    const small = { navH: 84, viewportH: 640, headerBottom: 72 };
    expect(attributionLayout({ ...small, sheetHeight: 96 })).toEqual({ bottom: 180, hidden: false });
    expect(attributionLayout({ ...small, sheetHeight: 280 }).hidden).toBe(false);
    expect(attributionLayout({ ...small, sheetHeight: 500 }).hidden).toBe(true);
  });

  it("viewport pas encore mesuré : visible, calé sur la barre", () => {
    expect(attributionLayout({ navH: 84, sheetHeight: 96, viewportH: 0, headerBottom: 72 })).toEqual({ bottom: 180, hidden: false });
  });
});
