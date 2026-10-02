import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../../i18n/testInit";
import { useSession } from "../../lib/session";
import { hasSeenWelcome } from "../../lib/welcomeSeen";
import Splash from "./Splash";

function renderSplash() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/map" element={<div>MAP</div>} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useSession.setState({ userId: null });
});

describe("Splash", () => {
  it("lets a guest explore without an account and remembers it", () => {
    renderSplash();
    fireEvent.click(screen.getByRole("button", { name: /explorer les parcs|explore parks/i }));
    expect(screen.getByText("MAP")).toBeTruthy();
    expect(hasSeenWelcome()).toBe(true);
  });

  it("is not shown again once seen", () => {
    localStorage.setItem("toboggo:welcome-seen", "1");
    renderSplash();
    expect(screen.getByText("MAP")).toBeTruthy();
  });

  it("is skipped for a signed-in user", () => {
    useSession.setState({ userId: "u1" });
    renderSplash();
    expect(screen.getByText("MAP")).toBeTruthy();
  });

  it("offers account creation and sign-in", () => {
    renderSplash();
    fireEvent.click(screen.getByRole("button", { name: /créer un compte|create an account/i }));
    expect(screen.getByText("LOGIN")).toBeTruthy();
  });
});
