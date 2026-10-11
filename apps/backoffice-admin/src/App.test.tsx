import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import App, { RoutedContent } from "./App";

/**
 * SPLIT-03 — route table of the Admin back office. Screens are stubs: only the
 * routing decision is under test. Routes that belong to the other back office
 * do not exist here, so they fall through to the unknown-route redirect.
 */
const surfaceProp = vi.hoisted(() => ({ value: "" }));
vi.mock("@toboggo/backoffice-core/BackofficeApp", () => ({
  BackofficeApp: ({ surface, children }: { surface: string; children: React.ReactNode }) => {
    surfaceProp.value = surface;
    return <>{children}</>;
  },
}));
vi.mock("@toboggo/backoffice-core/screens/ParkDetail", () => ({ default: () => <div data-testid="screen-ParkDetail" /> }));
vi.mock("@toboggo/backoffice-core/screens/ValidationDetail", () => ({ default: () => <div data-testid="screen-ValidationDetail" /> }));
vi.mock("@toboggo/backoffice-core/screens/Reports", () => ({ default: () => <div data-testid="screen-Reports" /> }));
vi.mock("@toboggo/backoffice-core/screens/Reviews", () => ({ default: () => <div data-testid="screen-Reviews" /> }));
vi.mock("@toboggo/backoffice-core/screens/Photos", () => ({ default: () => <div data-testid="screen-Photos" /> }));
vi.mock("@toboggo/backoffice-core/screens/Settings", () => ({ default: () => <div data-testid="screen-Settings" /> }));
vi.mock("./screens/AdminDashboard", () => ({ default: () => <div data-testid="screen-AdminDashboard" /> }));
vi.mock("./screens/parks/AdminParks", () => ({ AdminParks: () => <div data-testid="screen-AdminParks" /> }));
vi.mock("./screens/Validation", () => ({ default: () => <div data-testid="screen-Validation" /> }));
vi.mock("./screens/Organizations", () => ({ default: () => <div data-testid="screen-Organizations" /> }));
vi.mock("./screens/OrganizationDetail", () => ({ default: () => <div data-testid="screen-OrganizationDetail" /> }));
vi.mock("./screens/Users", () => ({ default: () => <div data-testid="screen-Users" /> }));
vi.mock("./screens/AppFeedback", () => ({ default: () => <div data-testid="screen-AppFeedback" /> }));

function Where() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <RoutedContent />
    </MemoryRouter>,
  );
}
const shown = (id: string) => screen.queryByTestId(`screen-${id}`);

describe("Admin routes", () => {
  it("mounts the shell with the admin surface", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(surfaceProp.value).toBe("admin");
  });

  it.each(['/parks/p1', '/validation/e1', '/reports', '/reviews', '/photos', '/settings', '/validation', '/organizations', '/organizations/o1', '/users', '/app-feedback'])("serves %s", (path) => {
    renderAt(path);
    expect(screen.getByTestId("path").textContent).toBe(path);
  });

  it("serves the right screen on / and /parks", () => {
    renderAt("/");
    expect(shown("AdminDashboard")).not.toBeNull();
    renderAt("/parks");
    expect(shown("AdminParks")).not.toBeNull();
  });

  it.each(['/map', '/maintenance', '/journal', '/statistiques'])("has no %s route: unknown-route redirect to /", (path) => {
    renderAt(path);
    expect(screen.getByTestId("path").textContent).toBe("/");
    expect(shown("AdminDashboard")).not.toBeNull();
  });

  it("/parks/new is not a creation page here (an Admin creates no park): it falls on /parks/:id", () => {
    renderAt("/parks/new");
    expect(shown("ParkDetail")).not.toBeNull();
  });

  it("unknown routes still redirect to /", () => {
    renderAt("/nope/nothing");
    expect(screen.getByTestId("path").textContent).toBe("/");
  });
});
