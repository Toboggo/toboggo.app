import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import App, { RoutedContent } from "../App";

/**
 * LOT A1 — Admin / Collectivité route guards. The screens are stubs: only the
 * routing decision is under test (RLS remains the real data protection).
 */

const session = vi.hoisted(() => ({
  userId: "u1" as string | null,
  loading: false,
  accessDenied: false,
  activeOrg: { type: "admin" } as { type: "admin" } | { type: "commune"; communeId: string } | null,
}));

vi.mock("../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = { ...session, init: vi.fn() };
    return sel ? sel(state) : state;
  },
}));
vi.mock("@toboggo/design-system", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@toboggo/design-system")>()),
  useIconSprite: () => {},
}));
vi.mock("../components/Shell", () => ({ Shell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../screens/Dashboard", () => ({ default: () => <div data-testid="screen-Dashboard" /> }));
vi.mock("../screens/Parks", () => ({ default: () => <div data-testid="screen-Parks" /> }));
vi.mock("../screens/parkNew/ParkNew", () => ({ default: () => <div data-testid="screen-ParkNew" /> }));
vi.mock("../screens/ParkDetail", () => ({ default: () => <div data-testid="screen-ParkDetail" /> }));
vi.mock("../screens/Validation", () => ({ default: () => <div data-testid="screen-Validation" /> }));
vi.mock("../screens/ValidationDetail", () => ({ default: () => <div data-testid="screen-ValidationDetail" /> }));
vi.mock("../screens/Organizations", () => ({ default: () => <div data-testid="screen-Organizations" /> }));
vi.mock("../screens/OrganizationDetail", () => ({ default: () => <div data-testid="screen-OrganizationDetail" /> }));
vi.mock("../screens/Reports", () => ({ default: () => <div data-testid="screen-Reports" /> }));
vi.mock("../screens/Reviews", () => ({ default: () => <div data-testid="screen-Reviews" /> }));
vi.mock("../screens/Photos", () => ({ default: () => <div data-testid="screen-Photos" /> }));
vi.mock("../screens/Users", () => ({ default: () => <div data-testid="screen-Users" /> }));
vi.mock("../screens/AppFeedback", () => ({ default: () => <div data-testid="screen-AppFeedback" /> }));
vi.mock("../screens/MapScreen", () => ({ default: () => <div data-testid="screen-MapScreen" /> }));
vi.mock("../screens/Maintenance", () => ({ default: () => <div data-testid="screen-Maintenance" /> }));
vi.mock("../screens/Journal", () => ({ default: () => <div data-testid="screen-Journal" /> }));
vi.mock("../screens/Statistiques", () => ({ default: () => <div data-testid="screen-Statistiques" /> }));
vi.mock("../screens/Settings", () => ({ default: () => <div data-testid="screen-Settings" /> }));
vi.mock("../screens/Login", () => ({ default: () => <div data-testid="screen-Login" /> }));
vi.mock("../screens/AccessDenied", () => ({ default: () => <div data-testid="screen-AccessDenied" /> }));

function Where() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="path">{pathname}</div>
      <button onClick={() => navigate(-1)}>retour</button>
      <button onClick={() => navigate("/organizations")}>vers-organisations</button>
    </>
  );
}

function renderAt(path: string, entries: string[] = [path]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Where />
      <RoutedContent />
    </MemoryRouter>,
  );
}

const asAdmin = () => (session.activeOrg = { type: "admin" });
const asCommune = () => (session.activeOrg = { type: "commune", communeId: "c1" });

const ADMIN_ONLY = ["/organizations", "/organizations/o1", "/users", "/validation", "/app-feedback"];
const COLLECTIVITY_ONLY = ["/maintenance", "/map", "/journal", "/statistiques"];
const SHARED = ["/", "/parks", "/parks/p1", "/validation/e1", "/reports", "/reviews", "/photos", "/settings"];

function shown(id: string) {
  return screen.queryByTestId(`screen-${id}`);
}

beforeEach(() => {
  session.userId = "u1";
  session.loading = false;
  session.accessDenied = false;
  asAdmin();
});

describe("route guards — Admin", () => {
  it.each(ADMIN_ONLY)("Admin can open %s", (path) => {
    renderAt(path);
    expect(screen.getByTestId("path").textContent).toBe(path);
  });

  it.each(COLLECTIVITY_ONLY)("Admin is sent back to the dashboard from %s", (path) => {
    renderAt(path);
    expect(screen.getByTestId("path").textContent).toBe("/");
    expect(shown("Dashboard")).not.toBeNull();
  });

  it.each(SHARED)("Admin keeps shared route %s", (path) => {
    renderAt(path);
    expect(screen.getByTestId("path").textContent).toBe(path);
  });
});

describe("route guards — Collectivité", () => {
  beforeEach(asCommune);

  it.each(ADMIN_ONLY)("Collectivité is refused %s (deep link) and sees no admin screen", (path) => {
    renderAt(path);
    expect(screen.getByTestId("path").textContent).toBe("/");
    expect(shown("Dashboard")).not.toBeNull();
    for (const id of ["Organizations", "OrganizationDetail", "Users", "Validation", "AppFeedback"]) {
      expect(shown(id)).toBeNull();
    }
  });

  it.each(COLLECTIVITY_ONLY)("Collectivité can open %s", (path) => {
    renderAt(path);
    expect(screen.getByTestId("path").textContent).toBe(path);
  });

  it.each(SHARED)("Collectivité keeps shared route %s", (path) => {
    renderAt(path);
    expect(screen.getByTestId("path").textContent).toBe(path);
  });

  it("keeps /validation/:editId reachable (review flow from a park's proposals tab)", () => {
    renderAt("/validation/e1");
    expect(shown("ValidationDetail")).not.toBeNull();
  });

  it("a redirected deep link does not trap the back button", () => {
    renderAt("/organizations", ["/parks", "/organizations"]);
    // Redirect replaced /organizations by "/" in history.
    expect(screen.getByTestId("path").textContent).toBe("/");
    act(() => screen.getByText("retour").click());
    expect(screen.getByTestId("path").textContent).toBe("/parks");
  });
});

describe("route guards — switching organisation", () => {
  it("re-evaluates the same URL when the active org changes", () => {
    asCommune();
    // Same MemoryRouter instance across renders: only the session changes.
    const Tree = ({ n }: { n: number }) => (
      <MemoryRouter initialEntries={["/maintenance"]}>
        <Where />
        <RoutedContent key={n} />
      </MemoryRouter>
    );
    const view = render(<Tree n={1} />);
    expect(shown("Maintenance")).not.toBeNull();
    asAdmin();
    view.rerender(<Tree n={2} />);
    expect(screen.getByTestId("path").textContent).toBe("/");
  });
});

describe("route guards — unknown routes and access states", () => {
  it.each([asAdmin, asCommune])("unknown route still redirects to / (unchanged)", (as) => {
    as();
    renderAt("/nope/nothing");
    expect(screen.getByTestId("path").textContent).toBe("/");
    expect(shown("Dashboard")).not.toBeNull();
  });

  it("a user without any membership gets AccessDenied, never a routed screen", () => {
    session.accessDenied = true;
    session.activeOrg = null;
    render(
      <MemoryRouter initialEntries={["/organizations"]}>
        <App />
      </MemoryRouter>,
    );
    expect(shown("AccessDenied")).not.toBeNull();
    expect(shown("Organizations")).toBeNull();
  });

  it("a signed-out visitor gets the login screen on an admin URL", () => {
    session.userId = null;
    session.activeOrg = null;
    render(
      <MemoryRouter initialEntries={["/users"]}>
        <App />
      </MemoryRouter>,
    );
    expect(shown("Login")).not.toBeNull();
    expect(shown("Users")).toBeNull();
  });
});
