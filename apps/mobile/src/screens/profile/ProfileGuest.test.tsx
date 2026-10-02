import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../../i18n/testInit";
import { useSession } from "../../lib/session";
import Profile from "./Profile";

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

function renderProfile() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/profile"]}>
        <Routes>
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSession.setState({ userId: null, profile: null });
});

describe("Profile — guest", () => {
  it("«Créer un compte» opens the signup form directly", () => {
    renderProfile();
    fireEvent.click(screen.getByRole("button", { name: /créer un compte|create an account/i }));
    expect(screen.getByTestId("where").textContent).toBe("/login?mode=signup");
  });

  it("«Se connecter» opens the login form directly (no method chooser)", () => {
    renderProfile();
    fireEvent.click(screen.getByRole("button", { name: /se connecter|sign in/i }));
    expect(screen.getByTestId("where").textContent).toBe("/login?mode=login");
  });
});
