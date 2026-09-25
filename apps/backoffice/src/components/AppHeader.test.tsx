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

describe("AppHeader — Admin-UI-7C (admin-only topbar theming)", () => {
  it("applies the admin header/search styling for an Admin session", () => {
    scope.isAdmin = true;
    renderHeader();
    const header = screen.getByRole("banner");
    expect(header.className).toMatch(/adminHeader/);
    const search = screen.getByRole("searchbox", { name: "Rechercher un parc" });
    expect(search.className).toMatch(/searchInputAdmin/);
  });

  it("does not apply admin styling for a Collectivité session", () => {
    scope.isAdmin = false;
    render(
      <MemoryRouter>
        <AppHeader orgLabel="Ma commune" screenLabel="Tableau de bord" />
      </MemoryRouter>,
    );
    const header = screen.getByRole("banner");
    expect(header.className).not.toMatch(/adminHeader/);
    const search = screen.getByRole("searchbox", { name: "Rechercher un parc" });
    expect(search.className).not.toMatch(/searchInputAdmin/);
  });

  it("preserves existing functionality: breadcrumb, search input, and profile menu still render", () => {
    scope.isAdmin = true;
    renderHeader();
    expect(screen.getByText("Toboggo Admin")).toBeTruthy();
    expect(screen.getByText("Tableau de bord")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Rechercher un parc" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Menu utilisateur — Testeur/ })).toBeTruthy();
  });
});
