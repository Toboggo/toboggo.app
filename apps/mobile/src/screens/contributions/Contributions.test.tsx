import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UserContribution } from "@toboggo/shared";
import "../../i18n/testInit";
import Contributions from "./Contributions";

const listMyContributions = vi.fn();

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listMyContributions: (...args: unknown[]) => listMyContributions(...args),
  };
});

const sess = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("../../lib/session", () => ({
  useSession: (sel?: (s: unknown) => unknown) => {
    const s = { userId: sess.userId };
    return sel ? sel(s) : s;
  },
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderHub() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/contributions"]}>
        <LocationProbe />
        <Routes>
          <Route path="/contributions" element={<Contributions />} />
          <Route path="*" element={<div>OTHER</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const loc = () => screen.getByTestId("loc").textContent;

const PARK_ITEM: UserContribution = {
  id: "park:p1",
  sourceId: "p1",
  type: "park",
  parkId: "p1",
  parkName: "Square Voltaire",
  city: "Lyon",
  createdAt: "2026-09-01T10:00:00.000Z",
  status: "published",
  thumbnail: null,
};
const EDIT_ITEM: UserContribution = {
  id: "edit:e1",
  sourceId: "e1",
  type: "edit",
  parkId: "p1",
  parkName: "Square Voltaire",
  city: "Lyon",
  createdAt: "2026-09-05T10:00:00.000Z",
  status: "pending",
  thumbnail: null,
  editTarget: "play",
};

beforeEach(() => {
  sess.userId = "u1";
  listMyContributions.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Contributions hub — rendering", () => {
  it("renders the header, the add-park CTA and the 4 quick actions", async () => {
    listMyContributions.mockResolvedValue([]);
    renderHub();
    await screen.findByRole("heading", { name: "Contributions" });
    screen.getByText("Ensemble, gardons les infos des parcs à jour.");
    screen.getByText("Ajouter un parc");
    screen.getByText("Ajouter des photos");
    screen.getByText("Modifier les informations");
    screen.getByText("Signaler un problème");
    screen.getByText("Donner mon avis");
  });
});

describe("Contributions hub — navigation", () => {
  it("'Ajouter un parc' navigates to /action-intro/add", async () => {
    listMyContributions.mockResolvedValue([]);
    renderHub();
    await screen.findByText("Ajouter un parc");
    fireEvent.click(screen.getByText("Ajouter un parc").closest("button")!);
    await waitFor(() => expect(loc()).toBe("/action-intro/add"));
  });

  it("'Ajouter des photos' navigates straight to /photo-add (it has its own park picker)", async () => {
    listMyContributions.mockResolvedValue([]);
    renderHub();
    await screen.findByText("Ajouter des photos");
    fireEvent.click(screen.getByText("Ajouter des photos").closest("button")!);
    await waitFor(() => expect(loc()).toBe("/photo-add"));
  });

  it("'Modifier les informations' goes through the park-picker route, not straight into EditInfo", async () => {
    listMyContributions.mockResolvedValue([]);
    renderHub();
    await screen.findByText("Modifier les informations");
    fireEvent.click(screen.getByText("Modifier les informations").closest("button")!);
    await waitFor(() => expect(loc()).toBe("/contribute/edit/pick-park"));
  });

  it("'Signaler un problème' navigates to /report", async () => {
    listMyContributions.mockResolvedValue([]);
    renderHub();
    await screen.findByText("Signaler un problème");
    fireEvent.click(screen.getByText("Signaler un problème").closest("button")!);
    await waitFor(() => expect(loc()).toBe("/report"));
  });

  it("'Donner mon avis' navigates to /rate", async () => {
    listMyContributions.mockResolvedValue([]);
    renderHub();
    await screen.findByText("Donner mon avis");
    fireEvent.click(screen.getByText("Donner mon avis").closest("button")!);
    await waitFor(() => expect(loc()).toBe("/rate"));
  });

  it("'Voir tout' navigates to /contributions/history", async () => {
    listMyContributions.mockResolvedValue([PARK_ITEM]);
    renderHub();
    const seeAll = await screen.findByText("Voir tout");
    fireEvent.click(seeAll);
    await waitFor(() => expect(loc()).toBe("/contributions/history"));
  });
});

describe("Contributions hub — recent contributions & impact", () => {
  it("shows the latest contributions with their real status, newest first", async () => {
    listMyContributions.mockResolvedValue([EDIT_ITEM, PARK_ITEM]);
    renderHub();
    await screen.findByText("Modification · Jeux & équipements");
    screen.getByText("Nouveau parc proposé");
    screen.getByText("En vérification");
    screen.getByText("Publié");
  });

  it("hides the impact block when nothing has actually been published/approved yet", async () => {
    listMyContributions.mockResolvedValue([EDIT_ITEM]); // pending only — nothing "completed"
    renderHub();
    await screen.findByText("Modification · Jeux & équipements");
    expect(screen.queryByText("Merci pour votre aide !")).toBeNull();
  });

  it("counts a published park edit and shows only the 2 calculable metrics — never an invented one", async () => {
    listMyContributions.mockResolvedValue([{ ...EDIT_ITEM, status: "approved" }]);
    renderHub();
    await screen.findByText("Merci pour votre aide !");
    screen.getByText("contributions publiées");
    screen.getByText("parcs améliorés");
    expect(screen.queryByText(/parents/i)).toBeNull();
  });
});

describe("Contributions hub — empty / loading / error", () => {
  it("shows the empty state when the user has never contributed, and hides 'Voir tout'", async () => {
    listMyContributions.mockResolvedValue([]);
    renderHub();
    await screen.findByText("Vous n’avez encore rien contribué");
    screen.getByText("Explorer les parcs");
    expect(screen.queryByText("Voir tout")).toBeNull();
  });

  it("does not show the empty state while the query is still pending", () => {
    listMyContributions.mockImplementation(() => new Promise(() => {})); // never resolves
    renderHub();
    expect(screen.queryByText("Vous n’avez encore rien contribué")).toBeNull();
  });

  it("shows a retry action on error and refetches on click", async () => {
    listMyContributions.mockRejectedValue(new Error("network down"));
    renderHub();
    await screen.findByText("Une erreur est survenue");
    const retry = screen.getByText("Réessayer");
    listMyContributions.mockResolvedValue([]);
    fireEvent.click(retry);
    await screen.findByText("Vous n’avez encore rien contribué");
  });
});
