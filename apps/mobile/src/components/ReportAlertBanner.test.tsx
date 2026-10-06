import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ActiveReport } from "@toboggo/shared";
import "../i18n/testInit";
import { ReportAlertBanner } from "./ReportAlertBanner";
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

describe("ReportAlertBanner", () => {
  it("un signalement sans réponse : une seule ligne, entièrement cliquable", () => {
    const onOpen = vi.fn();
    render(<ReportAlertBanner reports={[report()]} onOpen={onOpen} />);
    expect(screen.getByText("Signalement en cours")).toBeTruthy();
    expect(screen.queryByText(/Votre réponse/)).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalled();
  });

  it("affiche ma réponse en seconde ligne", () => {
    const { unmount } = render(<ReportAlertBanner reports={[report({ my_response: "resolved" })]} onOpen={() => {}} />);
    expect(screen.getByText("Votre réponse : problème résolu")).toBeTruthy();
    unmount();
    render(<ReportAlertBanner reports={[report({ my_response: "still_present" })]} onOpen={() => {}} />);
    expect(screen.getByText("Votre réponse : toujours présent")).toBeTruthy();
  });

  it("plusieurs signalements : pluriel et résumé, jamais une réponse attribuée à tous", () => {
    render(
      <ReportAlertBanner
        reports={[report({ my_response: "resolved" }), report({ id: "r2" })]}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("Signalements en cours")).toBeTruthy();
    expect(screen.getByText("Vous avez répondu à 1 sur 2 signalements")).toBeTruthy();
    expect(screen.queryByText(/problème résolu/)).toBeNull();
  });
});

function sheet(reports: ActiveReport[], props: Partial<{ pending: boolean; error: boolean }> = {}) {
  const onRespond = vi.fn();
  const onReportAnother = vi.fn();
  render(
    <ReportDetailsSheet open onClose={() => {}} reports={reports} pending={props.pending ?? false} error={props.error ?? false} onRespond={onRespond} onReportAnother={onReportAnother} />,
  );
  return { onRespond, onReportAnother };
}

describe("ReportDetailsSheet", () => {
  it("détail public, deux réponses, accès « autre problème »", () => {
    const { onRespond, onReportAnother } = sheet([report({ still_present_count: 3, resolved_count: 1 })]);
    expect(screen.getByText("Toboggan fissuré")).toBeTruthy();
    expect(screen.getByText(/Signalé le/)).toBeTruthy();
    expect(screen.getByText("3 confirmations « Toujours présent »")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Toujours présent" }));
    expect(onRespond).toHaveBeenLastCalledWith(expect.objectContaining({ id: "r1" }), "still_present");
    fireEvent.click(screen.getByRole("button", { name: "Problème résolu" }));
    expect(onRespond).toHaveBeenLastCalledWith(expect.objectContaining({ id: "r1" }), "resolved");
    fireEvent.click(screen.getByText("Signaler un autre problème"));
    expect(onReportAnother).toHaveBeenCalled();
  });

  it("plusieurs signalements : on choisit celui auquel on répond", () => {
    const { onRespond } = sheet([report(), report({ id: "r2", category: "cleanliness" })]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "r2" } });
    fireEvent.click(screen.getByRole("button", { name: "Problème résolu" }));
    expect(onRespond).toHaveBeenCalledWith(expect.objectContaining({ id: "r2" }), "resolved");
  });

  it("réponse existante (aria-pressed), modifiable ; chargement et erreur", () => {
    const { onRespond } = sheet([report({ my_response: "resolved" })]);
    expect(screen.getByRole("button", { name: "Problème résolu" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Toujours présent" }));
    expect(onRespond).toHaveBeenCalledWith(expect.anything(), "still_present");
  });

  it("chargement : boutons désactivés", () => {
    sheet([report()], { pending: true });
    expect((screen.getByRole("button", { name: "Toujours présent" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Envoi…")).toBeTruthy();
  });

  it("erreur : message accessible", () => {
    sheet([report()], { error: true });
    expect(screen.getByRole("alert").textContent).toContain("Réponse non envoyée");
  });
});
