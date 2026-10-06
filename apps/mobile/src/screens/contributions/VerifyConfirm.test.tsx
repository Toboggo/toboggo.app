import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Feature } from "@toboggo/shared";
import "../../i18n/testInit";
import { useGeo } from "../../lib/geo";
import { useVerifySkips } from "../../lib/verifySkips";
import VerifyList from "./VerifyList";
import Contributions from "./Contributions";

// The "server": confirmations survive a remount, like the real table does.
const db = vi.hoisted(() => ({ confirmed: new Set<string>(), failNext: false, writes: 0, alphaStatus: "available" }));

const FEATURES: Feature[] = [
  { id: "f1", code: "toilets", category: "service", label_key: "toilets", icon_key: null, value_set: null, sort_order: 1, is_active: true, created_at: "" },
];
const park = (id: string, name: string, distance_m: number, status = "available") => ({
  id, name, city: "Lyon", cover_photo: null, distance_m,
  features: { toilets: { status, value: null, quantity: null, category: "service", verified_at: null } },
});

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listMyContributions: async () => [],
    fetchNearbyParks: async () => [park("pA", "Parc Alpha", 100, db.alphaStatus), park("pB", "Parc Beta", 300)],
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
function renderHub(path = "/contributions") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route path="/contributions" element={<Contributions />} />
          <Route path="/contributions/verify" element={<VerifyList />} />
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
  db.alphaStatus = "available";
  useVerifySkips.setState({ skipped: new Set() });
  useGeo.setState({ lat: 45.76, lng: 4.83, hasFix: true, permission: "granted" });
});

const skipBtn = () => screen.findByRole("button", { name: /Je ne sais pas pour/ });
const yes = (park: string) => screen.findByRole("button", { name: new RegExp(`^Confirmer pour ${park} :`) });

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
    fireEvent.click(screen.getByRole("button", { name: /^Confirmer pour Parc Alpha :/ }));
    await screen.findByText("Parc Beta");
    expect(screen.queryByText("Parc Alpha")).toBeNull();
  });

  it("« Modifier » ouvre l'édition du parc concerné", async () => {
    renderHub();
    await yes("Parc Alpha");
    fireEvent.click(screen.getByRole("button", { name: /Modifier les informations de Parc Alpha/ }));
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/contribute/edit?park=pA"));
  });

  it("formule la question de présence naturellement", async () => {
    renderHub();
    await screen.findByText("Y a-t-il des toilettes dans ce parc ?");
  });

  it("confirmer une absence enregistre la confirmation « unavailable »", async () => {
    db.alphaStatus = "unavailable";
    renderHub();
    await screen.findByText("Ce parc ne dispose pas de toilettes. Est-ce exact ?");
    fireEvent.click(await yes("Parc Alpha"));
    await screen.findByText("Parc Beta");
    expect(db.writes).toBe(1);
  });
});

describe("« Je ne sais pas »", () => {
  it("passe à la vérification suivante sans aucune écriture", async () => {
    renderHub();
    await screen.findByText("Parc Alpha");
    fireEvent.click(await skipBtn());
    await screen.findByText("Parc Beta");
    expect(screen.queryByText("Parc Alpha")).toBeNull();
    expect(db.writes).toBe(0);
    expect(db.confirmed.size).toBe(0);
  });

  it("la question passée ne réapparaît ni sur la carte ni dans la liste complète", async () => {
    const first = renderHub();
    await screen.findByText("Parc Alpha");
    fireEvent.click(await skipBtn());
    await screen.findByText("Parc Beta");
    first.unmount();
    renderHub("/contributions/verify");
    await screen.findByText("Parc Beta");
    expect(screen.queryByText("Parc Alpha")).toBeNull();
  });

  it("affiche un état vide quand il n'en reste aucune", async () => {
    renderHub();
    await screen.findByText("Parc Alpha");
    fireEvent.click(await skipBtn());
    await screen.findByText("Parc Beta");
    fireEvent.click(await skipBtn());
    await screen.findByText(/Plus d’autre vérification/);
    expect(db.writes).toBe(0);
  });

  it("« Modifier » reste disponible depuis la liste complète", async () => {
    renderHub("/contributions/verify");
    await screen.findByText("Parc Alpha");
    fireEvent.click(screen.getAllByRole("button", { name: /Modifier les informations de Parc Alpha/ })[0]);
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/contribute/edit?park=pA"));
  });
});
