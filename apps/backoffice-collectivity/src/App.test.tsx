import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import App, { RoutedContent } from "./App";

/**
 * SPLIT-03 — route table of the Collectivité back office. Screens are stubs: only the
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
vi.mock("./screens/CommuneDashboard", () => ({ default: () => <div data-testid="screen-CommuneDashboard" /> }));
vi.mock("./screens/parks/CommuneParks", () => ({ CommuneParks: () => <div data-testid="screen-CommuneParks" /> }));
vi.mock("./screens/parkNew/ParkNew", () => ({ default: () => <div data-testid="screen-ParkNew" /> }));
vi.mock("./screens/MapScreen", () => ({ default: () => <div data-testid="screen-MapScreen" /> }));
vi.mock("./screens/Maintenance", () => ({ default: () => <div data-testid="screen-Maintenance" /> }));
vi.mock("./screens/Journal", () => ({ default: () => <div data-testid="screen-Journal" /> }));
vi.mock("./screens/Statistiques", () => ({ default: () => <div data-testid="screen-Statistiques" /> }));

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

describe("Collectivité routes", () => {
  it("mounts the shell with the collectivity surface", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(surfaceProp.value).toBe("collectivity");
  });

  it.each(['/parks/p1', '/validation/e1', '/reports', '/reviews', '/photos', '/settings', '/parks/new', '/map', '/maintenance', '/journal', '/statistiques'])("serves %s", (path) => {
    renderAt(path);
    expect(screen.getByTestId("path").textContent).toBe(path);
  });

  it("serves the right screen on / and /parks", () => {
    renderAt("/");
    expect(shown("CommuneDashboard")).not.toBeNull();
    renderAt("/parks");
    expect(shown("CommuneParks")).not.toBeNull();
  });

  it.each(['/validation', '/organizations', '/organizations/o1', '/users', '/app-feedback'])("has no %s route: unknown-route redirect to /", (path) => {
    renderAt(path);
    expect(screen.getByTestId("path").textContent).toBe("/");
    expect(shown("CommuneDashboard")).not.toBeNull();
  });

  it("unknown routes still redirect to /", () => {
    renderAt("/nope/nothing");
    expect(screen.getByTestId("path").textContent).toBe("/");
  });
});
