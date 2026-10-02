import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getOrganization, listParks, listReports, listReviews, listActivity } from "@toboggo/shared";
import OrganizationDetail from "./OrganizationDetail";

const ORG_LYON = {
  id: "org-lyon",
  name: "Ville de Lyon",
  type: "municipality",
  country_code: "FR",
  contact_email: "contact@lyon.fr",
  email_notif: false,
  website: "https://lyon.fr",
  verified: true,
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-01-15T10:00:00Z",
};

const PARK = {
  id: "park-1",
  name: "Parc de la Tête d'Or",
  formatted_address: "Lyon 6e",
  status: "published",
  rating: 4.5,
  review_count: 3,
};

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    getOrganization: vi.fn(),
    listParks: vi.fn(),
    listReports: vi.fn(),
    listReviews: vi.fn(),
    listActivity: vi.fn(),
  };
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderDetail(id = "org-lyon") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/organizations/${id}`]}>
        <LocationProbe />
        <Routes>
          <Route path="/organizations/:id" element={<OrganizationDetail />} />
          <Route path="/organizations" element={<div>LISTE</div>} />
          <Route path="/parks/:id" element={<div>FICHE PARC</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OrganizationDetail — fiche Collectivité 360 (Admin-UI-3C)", () => {
  beforeEach(() => {
    vi.mocked(getOrganization).mockReset().mockResolvedValue(ORG_LYON as never);
    vi.mocked(listParks).mockReset().mockResolvedValue([PARK] as never);
    vi.mocked(listReports).mockReset().mockResolvedValue([{ id: "r1", status: "open" }] as never);
    vi.mocked(listReviews)
      .mockReset()
      .mockResolvedValue([{ id: "rv1", rating: 4 }, { id: "rv2", rating: 5 }] as never);
    vi.mocked(listActivity)
      .mockReset()
      .mockResolvedValue([{ id: "a1", text: "Parc modifié", actor: "Alice", created_at: "2026-09-01T10:00:00Z" }] as never);
  });

  it("affiche le nom, le type, le badge de vérification et la date de création", async () => {
    renderDetail();
    expect(await screen.findByRole("heading", { name: "Ville de Lyon" })).toBeTruthy();
    expect(screen.getByText("Commune")).toBeTruthy();
    expect(screen.getByText("Vérifiée")).toBeTruthy();
    expect(screen.getByText(/15 janv\. 2026/)).toBeTruthy();
  });

  it("affiche les informations générales réellement présentes (contact, site web, pays)", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Ville de Lyon" });
    expect(screen.getByText("contact@lyon.fr")).toBeTruthy();
    expect(screen.getByText("https://lyon.fr")).toBeTruthy();
    expect(screen.getByText("FR")).toBeTruthy();
  });

  it("n'affiche pas une info générale absente (pas de placeholder trompeur)", async () => {
    vi.mocked(getOrganization).mockResolvedValueOnce({ ...ORG_LYON, contact_email: null, website: null, country_code: null } as never);
    renderDetail();
    await screen.findByRole("heading", { name: "Ville de Lyon" });
    expect(screen.queryByText("Contact :")).toBeNull();
    expect(screen.queryByText("Site web :")).toBeNull();
    expect(screen.queryByText("Pays :")).toBeNull();
  });

  it("vue d'ensemble : compteurs réels de parcs/signalements/avis", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Ville de Lyon" });
    expect(screen.getByText("Parcs rattachés")).toBeTruthy();
    expect(screen.getByText(/Signalements ouverts \(sur 1\)/)).toBeTruthy();
    expect(screen.getByText(/Avis publiés · 4\.5\/5/)).toBeTruthy();
  });

  it("affiche l'activité récente réelle de la collectivité", async () => {
    renderDetail();
    expect(await screen.findByText("Parc modifié")).toBeTruthy();
    expect(screen.getByText(/Alice/)).toBeTruthy();
  });

  it("liste les parcs de la collectivité et ouvre la fiche existante au clic", async () => {
    renderDetail();
    fireEvent.click(await screen.findByText("Parc de la Tête d'Or"));
    expect(screen.getByTestId("loc").textContent).toBe("/parks/park-1");
  });

  it("affiche un état vide honnête quand la collectivité n'a aucun parc rattaché", async () => {
    vi.mocked(listParks).mockResolvedValueOnce([]);
    renderDetail();
    expect(await screen.findByText("Aucun parc rattaché à cette collectivité.")).toBeTruthy();
  });

  it("affiche un état introuvable quand l'id ne résout à rien (ou hors RLS)", async () => {
    vi.mocked(getOrganization).mockResolvedValueOnce(null);
    renderDetail("missing");
    expect(await screen.findByText(/n'existe pas ou n'est pas accessible/)).toBeTruthy();
  });

  it("affiche un état d'erreur avec un bouton Réessayer", async () => {
    vi.mocked(getOrganization).mockRejectedValueOnce(new Error("boom"));
    renderDetail();
    expect(await screen.findByText("Impossible de charger cette collectivité.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });

  it("le fil d'Ariane ramène à la liste des collectivités", async () => {
    renderDetail();
    fireEvent.click(await screen.findByText("Collectivités"));
    expect(screen.getByTestId("loc").textContent).toBe("/organizations");
  });

  it("n'affiche aucune section Équipe (RLS team_members non extensible pour l'admin)", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Ville de Lyon" });
    expect(screen.queryByText("Équipe")).toBeNull();
    expect(screen.queryByText(/Membres/)).toBeNull();
  });
});
