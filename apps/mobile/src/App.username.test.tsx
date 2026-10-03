import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "./i18n/testInit";
import App from "./App";
import { useSession } from "./lib/session";

vi.mock("./lib/analytics", () => ({ trackEvent: vi.fn(), registerIsAuthenticated: vi.fn(), identifyAnalyticsUser: vi.fn(), resetAnalyticsIdentity: vi.fn() }));
vi.mock("maplibre-gl", () => ({
  default: { Map: vi.fn(), NavigationControl: vi.fn(), Marker: vi.fn(), setWorkerUrl: vi.fn() },
}));
vi.spyOn(globalThis, "fetch").mockResolvedValue({ text: () => Promise.resolve("") } as Response);

const profile = (extra: Record<string, unknown>) =>
  ({ id: "u1", name: "", email: "c@x.fr", favorites: [], ...extra }) as never;

function setSession(p: unknown) {
  useSession.setState({ userId: "u1", profile: p as never, loading: false, guestMode: false, pendingResume: null });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App — garde « Choisissez votre pseudo »", () => {
  beforeEach(() => {
    useSession.setState({ userId: null, profile: null, loading: false });
  });

  it("propose l'écran quand name_confirmed_at est NULL (première connexion)", async () => {
    setSession(profile({ name_confirmed_at: null }));
    renderAt("/login");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Choisissez votre pseudo" })).toBeTruthy());
  });

  it("ne le propose pas à un compte existant (pseudo confirmé)", () => {
    setSession(profile({ name: "fabien.test", name_confirmed_at: "2026-09-01T00:00:00Z" }));
    renderAt("/login");
    expect(screen.queryByRole("heading", { name: "Choisissez votre pseudo" })).toBeNull();
  });

  it("ne le propose pas si la colonne n'existe pas encore (base non migrée)", () => {
    setSession(profile({ name: "fabien.test" }));
    renderAt("/login");
    expect(screen.queryByRole("heading", { name: "Choisissez votre pseudo" })).toBeNull();
  });

  it("ne l'impose pas en navigation sans compte", () => {
    renderAt("/login");
    expect(screen.queryByRole("heading", { name: "Choisissez votre pseudo" })).toBeNull();
  });
});
