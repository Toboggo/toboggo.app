import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppHeader } from "./AppHeader";

const scope = vi.hoisted(() => ({ isAdmin: true }));
vi.mock("../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: scope.isAdmin, communeId: scope.isAdmin ? undefined : "c1" }) }));
vi.mock("../lib/orgSession", () => ({
  useOrgSession: () => ({
    userName: "Testeur",
    userEmail: "testeur@toboggo.local",
    currentRole: () => "super_admin",
    signOut: vi.fn(),
  }),
}));

function renderHeader() {
  return render(
    <MemoryRouter>
      <AppHeader orgLabel="Toboggo Admin" screenLabel="Tableau de bord" />
    </MemoryRouter>,
  );
}

function renderFor(isAdmin: boolean) {
  scope.isAdmin = isAdmin;
  return render(
    <MemoryRouter>
      <AppHeader orgLabel={isAdmin ? "Toboggo Admin" : "Ma commune"} screenLabel="Tableau de bord" />
    </MemoryRouter>,
  );
}

describe("AppHeader — Brand Book v2 (même header Admin / Collectivités)", () => {
  it.each([
    ["Admin", true],
    ["Collectivité", false],
  ])("renders the same header and search styling for a %s session (no per-surface variant)", (_label, isAdmin) => {
    renderFor(isAdmin);
    const header = screen.getByRole("banner");
    expect(header.className).not.toMatch(/adminHeader/);
    const search = screen.getByRole("searchbox", { name: "Rechercher un parc" });
    expect(search.className).not.toMatch(/searchInputAdmin/);
  });

  it("preserves existing functionality: breadcrumb, search input, and profile menu still render", () => {
    renderFor(true);
    expect(screen.getByText("Toboggo Admin")).toBeTruthy();
    expect(screen.getByText("Tableau de bord")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Rechercher un parc" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Menu utilisateur — Testeur/ })).toBeTruthy();
  });

  it.each([
    ["Admin", true],
    ["Collectivité", false],
  ])("shows the ic-search icon in the search field for a %s session", (_label, isAdmin) => {
    const { container } = renderFor(isAdmin);
    const wrap = container.querySelector('input[type="search"]')?.parentElement?.parentElement;
    expect(wrap?.querySelector("svg")).toBeTruthy();
  });
});
