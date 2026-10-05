import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../../i18n/testInit";
import { ThankYou } from "./ThankYou";

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
function renderThanks(props: Parameters<typeof ThankYou>[0]) {
  return render(
    <MemoryRouter initialEntries={["/x"]}>
      <Where />
      <Routes>
        <Route path="/x" element={<ThankYou {...props} />} />
        <Route path="*" element={<div>ailleurs</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
const where = () => screen.getByTestId("where").textContent;

describe("ThankYou", () => {
  it("titre commun, logo Toboggo, message adapté ; la vérification n'apparaît que si elle s'applique", () => {
    const { rerender } = renderThanks({ body: "Votre avis est publié.", parkId: "p1" });
    expect(screen.getByText("Merci pour votre coup de pouce !")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Toboggo" })).toBeTruthy();
    expect(screen.getByText("Votre avis est publié.")).toBeTruthy();
    expect(screen.queryByText(/vérifié/)).toBeNull();
    rerender(
      <MemoryRouter initialEntries={["/x"]}>
        <Routes>
          <Route path="/x" element={<ThankYou body="Envoyé." moderation="Il sera vérifié avant publication." parkId="p1" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Il sera vérifié avant publication.")).toBeTruthy();
  });

  it("fiche accessible → « Revenir au parc » ; « Voir mes ajouts » remplace l'entrée", () => {
    renderThanks({ body: "ok", parkId: "p1" });
    fireEvent.click(screen.getByRole("button", { name: "Revenir au parc" }));
    expect(where()).toBe("/park/p1");
  });

  it("sans fiche accessible → retour carte ; lien vers Mes ajouts", () => {
    renderThanks({ body: "ok", parkId: null });
    expect(screen.queryByRole("button", { name: "Revenir au parc" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voir mes ajouts" }));
    expect(where()).toBe("/contributions");
  });

  it("l'animation est conditionnée à prefers-reduced-motion (pas de boucle)", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("apps/mobile/src/components/flow/ThankYou.module.css", "utf-8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
    expect(css).not.toMatch(/infinite/);
  });
});
