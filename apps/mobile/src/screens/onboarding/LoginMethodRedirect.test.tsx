import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../../i18n/testInit";
import LoginMethodRedirect from "./LoginMethodRedirect";

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

const go = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login-method" element={<LoginMethodRedirect />} />
        <Route path="/login" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe("legacy /login-method", () => {
  it("redirects to the login form", () => {
    go("/login-method");
    expect(screen.getByTestId("where").textContent).toBe("/login?mode=login");
  });
  it("keeps useful params", () => {
    go("/login-method?mode=signup&x=1");
    expect(screen.getByTestId("where").textContent).toBe("/login?mode=signup&x=1");
  });
});
