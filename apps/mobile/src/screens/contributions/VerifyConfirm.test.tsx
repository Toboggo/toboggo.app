import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Feature } from "@toboggo/shared";
import "../../i18n/testInit";
import { useGeo } from "../../lib/geo";
import Contributions from "./Contributions";

// The "server": confirmations survive a remount, like the real table does.
const db = vi.hoisted(() => ({ confirmed: new Set<string>(), failNext: false, writes: 0 }));

const FEATURES: Feature[] = [
  { id: "f1", code: "toilets", category: "service", label_key: "toilets", icon_key: null, value_set: null, sort_order: 1, is_active: true, created_at: "" },
];
const park = (id: string, name: string, distance_m: number) => ({
  id, name, city: "Lyon", cover_photo: null, distance_m,
  features: { toilets: { status: "available", value: null, quantity: null, category: "service", verified_at: null } },
});

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listMyContributions: async () => [],
    fetchNearbyParks: async () => [park("pA", "Parc Alpha", 100), park("pB", "Parc Beta", 300)],
    listFeatures: async () => FEATURES,
    listMyConfirmationKeys: async () => new Set(db.confirmed),
    countMyConfirmations: async () => db.confirmed.size,
    confirmParkFeature: async (i: { parkId: string; featureId: string }) => {
      if (db.failNext) {
        db.failNext = false;
        throw new Error("boom");
      }
      db.writes += 1;
      db.confirmed.add(`${i.parkId}:${i.featureId}`);
    },
  };
});
vi.mock("../../lib/session", () => ({
  useSession: (sel?: (s: unknown) => unknown) => {
    const s = { userId: "u1" };
    return sel ? sel(s) : s;
  },
}));

function Probe() {
  const l = useLocation();
  return <div data-testid="url">{l.pathname + l.search}</div>;
}
function renderHub() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/contributions"]}>
        <Probe />
        <Routes>
          <Route path="/contributions" element={<Contributions />} />
          <Route path="*" element={<div>OTHER</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  db.confirmed.clear();
  db.failNext = false;
  db.writes = 0;
  useGeo.setState({ lat: 45.76, lng: 4.83, hasFix: true, permission: "granted" });
});

const yes = (park: string) => screen.findByRole("button", { name: new RegExp(`pour ${park}$`) });

describe("« À vérifier près de chez vous » — confirmation", () => {
  it("retire le parc confirmé et affiche le suivant", async () => {
    renderHub();
    fireEvent.click(await yes("Parc Alpha"));
    await screen.findByText("Parc Beta");
    expect(screen.queryByText("Parc Alpha")).toBeNull();
    expect(db.confirmed.has("pA:f1")).toBe(true);
  });

  it("ne repropose pas le parc confirmé après rechargement", async () => {
    const first = renderHub();
    fireEvent.click(await yes("Parc Alpha"));
    await screen.findByText("Parc Beta");
    first.unmount();
    renderHub();
    await screen.findByText("Parc Beta");
    expect(screen.queryByText("Parc Alpha")).toBeNull();
  });

  it("un double clic n'envoie qu'une seule confirmation", async () => {
    renderHub();
    const btn = await yes("Parc Alpha");
    fireEvent.click(btn);
    fireEvent.click(btn);
    await screen.findByText("Parc Beta");
    expect(db.writes).toBe(1);
  });

  it("en cas d'erreur : la carte reste et propose un réessai, puis la confirmation passe", async () => {
    db.failNext = true;
    renderHub();
    fireEvent.click(await yes("Parc Alpha"));
    await screen.findByRole("alert");
    expect(screen.getByText("Parc Alpha")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /pour Parc Alpha$/ }));
    await screen.findByText("Parc Beta");
    expect(screen.queryByText("Parc Alpha")).toBeNull();
  });

  it("« Modifier » ouvre l'édition du parc concerné", async () => {
    renderHub();
    await yes("Parc Alpha");
    fireEvent.click(screen.getByRole("button", { name: /Modifier les informations de Parc Alpha/ }));
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/contribute/edit?park=pA"));
  });
});
