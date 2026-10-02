import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import "../../i18n/testInit";
import Legal from "./Legal";
import LegalIndex from "./LegalIndex";

function Probe() {
  const loc = useLocation();
  const type = useNavigationType();
  return <div data-testid="probe">{`${loc.pathname}|${type}`}</div>;
}

function renderAt(entries: string[], index: number) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Probe />
      <Routes>
        <Route path="/legal" element={<LegalIndex />} />
        <Route path="/legal/:doc" element={<Legal />} />
      </Routes>
    </MemoryRouter>,
  );
}

const back = () => screen.getByRole("button", { name: "Retour" });
const probe = () => screen.getByTestId("probe").textContent;

describe("Confidentialité et conditions — flèche de retour", () => {
  for (const doc of ["privacy", "terms", "mentions"]) {
    it(`${doc}: opened from the menu, the arrow pops once back to the menu (POP, no new entry)`, () => {
      renderAt(["/legal"], 0);
      const rows = screen.getAllByRole("button").filter((b) => b.textContent && !/Retour/.test(b.textContent));
      fireEvent.click(rows[["privacy", "terms", "mentions"].indexOf(doc)]);
      expect(probe()).toBe(`/legal/${doc}|PUSH`);

      fireEvent.click(back());
      // POP = the history entry was removed, not a second /legal pushed on top
      // (which made the native back reopen the document).
      expect(probe()).toBe("/legal|POP");
    });

    it(`${doc}: opened directly (no previous entry), the arrow goes to the menu by replacing the entry`, () => {
      renderAt([`/legal/${doc}`], 0);
      fireEvent.click(back());
      expect(probe()).toBe("/legal|REPLACE");
      expect(screen.queryByText(/./, { selector: "h2" })).toBeNull(); // document no longer shown
    });
  }
});
