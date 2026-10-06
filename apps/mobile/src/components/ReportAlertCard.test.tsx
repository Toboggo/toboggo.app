import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ActiveReport } from "@toboggo/shared";
import "../i18n/testInit";
import { ReportAlertCard } from "./ReportAlertCard";
import { ReportDetailsSheet } from "./ReportDetailsSheet";

function report(over: Partial<ActiveReport> = {}): ActiveReport {
  return {
    id: "r1",
    category: "broken_equipment",
    description: "Toboggan fissuré",
    equipment_label: null,
    status: "open",
    created_at: "2026-10-01T10:00:00Z",
    still_present_count: 0,
    resolved_count: 0,
    my_response: null,
    ...over,
  };
}

function setup(reports: ActiveReport[], props: Partial<{ pending: boolean; error: boolean }> = {}) {
  const onRespond = vi.fn();
  const onOpenDetails = vi.fn();
  render(
    <ReportAlertCard reports={reports} pending={props.pending ?? false} error={props.error ?? false} onOpenDetails={onOpenDetails} onRespond={onRespond} />,
  );
  return { onRespond, onOpenDetails };
}

describe("ReportAlertCard", () => {
  it("un seul signalement : titre, lien, question et deux boutons, sans sélecteur", () => {
    setup([report()]);
    expect(screen.getByText("Un problème a été signalé")).toBeTruthy();
    expect(screen.getByText("Voir le signalement")).toBeTruthy();
    expect(screen.getByText("Vous êtes sur place ?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Toujours présent" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Problème résolu" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("chaque bouton répond au signalement affiché", () => {
    const { onRespond } = setup([report()]);
    fireEvent.click(screen.getByRole("button", { name: "Toujours présent" }));
    expect(onRespond).toHaveBeenLastCalledWith(expect.objectContaining({ id: "r1" }), "still_present");
    fireEvent.click(screen.getByRole("button", { name: "Problème résolu" }));
    expect(onRespond).toHaveBeenLastCalledWith(expect.objectContaining({ id: "r1" }), "resolved");
  });

  it("plusieurs signalements : on choisit celui auquel on répond", () => {
    const { onRespond } = setup([report({ id: "r1" }), report({ id: "r2", category: "cleanliness" })]);
    expect(screen.getByText("2 problèmes ont été signalés")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "r2" } });
    fireEvent.click(screen.getByRole("button", { name: "Problème résolu" }));
    expect(onRespond).toHaveBeenCalledWith(expect.objectContaining({ id: "r2" }), "resolved");
  });

  it("reflète la réponse existante (aria-pressed) et reste modifiable", () => {
    const { onRespond } = setup([report({ my_response: "resolved" })]);
    expect(screen.getByRole("button", { name: "Problème résolu" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Toujours présent" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Toujours présent" }));
    expect(onRespond).toHaveBeenCalledWith(expect.anything(), "still_present");
  });

  it("chargement : boutons désactivés ; erreur : message d'alerte", () => {
    setup([report()], { pending: true });
    expect((screen.getByRole("button", { name: "Toujours présent" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Envoi…")).toBeTruthy();
  });

  it("erreur d'envoi : message accessible", () => {
    setup([report()], { error: true });
    expect(screen.getByRole("alert").textContent).toContain("Réponse non envoyée");
  });

  it("« Voir le signalement » ouvre le détail", () => {
    const { onOpenDetails } = setup([report()]);
    fireEvent.click(screen.getByText("Voir le signalement"));
    expect(onOpenDetails).toHaveBeenCalled();
  });
});

describe("ReportDetailsSheet", () => {
  it("affiche catégorie, description, date et confirmations — jamais l'auteur — et l'accès « autre problème »", () => {
    const onReportAnother = vi.fn();
    render(
      <ReportDetailsSheet
        open
        onClose={() => {}}
        onReportAnother={onReportAnother}
        reports={[report({ still_present_count: 3, resolved_count: 1 })]}
      />,
    );
    expect(screen.getAllByText("Jeu cassé / dangereux").length).toBeGreaterThan(0);
    expect(screen.getByText("Toboggan fissuré")).toBeTruthy();
    expect(screen.getByText(/Signalé le/)).toBeTruthy();
    expect(screen.getByText("3 confirmations « Toujours présent »")).toBeTruthy();
    expect(screen.getByText("1 confirmation « Problème résolu »")).toBeTruthy();
    fireEvent.click(screen.getByText("Signaler un autre problème"));
    expect(onReportAnother).toHaveBeenCalled();
  });
});
