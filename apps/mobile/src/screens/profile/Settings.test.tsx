import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../../i18n/testInit";
import Settings from "./Settings";

function Probe() {
  return <div data-testid="loc">{useLocation().pathname}</div>;
}

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Probe />
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
}

function group(title: string) {
  return screen.getByText(title).nextElementSibling as HTMLElement;
}

describe("Compte et réglages — Aide & informations", () => {
  it("keeps Aide, Nous contacter and À propos, without the three legal documents", () => {
    renderSettings();
    const help = within(group("Aide & informations"));
    expect(help.getAllByRole("button").map((b) => b.textContent)).toEqual(["Aide", "Nous contacter", "À propos de Toboggo"]);
    for (const name of [/Conditions d.utilisation/, /Politique de confidentialité/, /Mentions légales/]) {
      expect(help.queryByRole("button", { name })).toBeNull();
    }
  });

  it("keeps the legal documents reachable through « Confidentialité et conditions »", () => {
    renderSettings();
    fireEvent.click(within(group("Compte")).getByRole("button", { name: "Confidentialité et conditions" }));
    expect(screen.getByTestId("loc").textContent).toBe("/legal");
  });
});
