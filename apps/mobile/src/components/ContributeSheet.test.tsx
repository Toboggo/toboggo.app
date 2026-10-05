import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../i18n/testInit";
import { ContributeSheet } from "./ContributeSheet";

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

function renderSheet(props: { myReviewId?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={["/park/p1"]}>
      <Where />
      <Routes>
        <Route path="*" element={<ContributeSheet open onClose={() => {}} parkId="p1" parkName="Square Voltaire" {...props} />} />
      </Routes>
    </MemoryRouter>,
  );
}
const where = () => screen.getByTestId("where").textContent;

describe("ContributeSheet — « Enrichir ce parc »", () => {
  it("propose exactement quatre actions avec leur sous-titre", () => {
    renderSheet();
    expect(screen.getByText("Enrichir ce parc")).toBeTruthy();
    for (const [title, hint] of [
      ["Compléter les informations", "Jeux, âges et petits détails"],
      ["Ajouter des photos", "Montrez le parc aux familles"],
      ["Donner mon avis", "Partagez votre expérience"],
      ["Signaler un problème", "Aidez à garder le parc agréable"],
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(hint)).toBeTruthy();
    }
    expect(screen.getAllByRole("button").filter((b) => b.className.includes("item"))).toHaveLength(4);
  });

  it.each([
    ["Compléter les informations", "/contribute/edit?park=p1"],
    ["Ajouter des photos", "/photo-add?park=p1"],
    ["Donner mon avis", "/rate?park=p1"],
    ["Signaler un problème", "/report?park=p1"],
  ])("« %s » ouvre le parcours avec le parc présélectionné", (title, to) => {
    renderSheet();
    fireEvent.click(screen.getByText(title));
    expect(where()).toBe(to);
  });

  it("un avis déjà publié → « Modifier mon avis » ouvre son édition (jamais un doublon)", () => {
    renderSheet({ myReviewId: "r9" });
    expect(screen.queryByText("Donner mon avis")).toBeNull();
    fireEvent.click(screen.getByText("Modifier mon avis"));
    expect(where()).toBe("/review/r9/edit");
  });
});
