import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listOrganizationsWithCounts } from "@toboggo/shared";
import Organizations from "./Organizations";

const FIXTURE = vi.hoisted(() => [
  {
    id: "org-lyon",
    name: "Ville de Lyon",
    type: "municipality",
    country_code: "FR",
    contact_email: null,
    email_notif: false,
    website: null,
    verified: true,
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-01-15T10:00:00Z",
    parkCount: 12,
  },
  {
    id: "org-bordeaux",
    name: "Ville de Bordeaux",
    type: "municipality",
    country_code: "FR",
    contact_email: null,
    email_notif: false,
    website: null,
    verified: false,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:00:00Z",
    parkCount: 0,
  },
]);

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listOrganizationsWithCounts: vi.fn().mockResolvedValue(FIXTURE),
  };
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderOrganizations() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/organizations"]}>
        <LocationProbe />
        <Routes>
          <Route path="/organizations" element={<Organizations />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Organizations — liste Admin des collectivités (Admin-UI-3B)", () => {
  it("affiche un état de chargement avant que les données n'arrivent", () => {
    renderOrganizations();
    expect(screen.queryByText("Ville de Lyon")).toBeNull();
  });

  it("affiche les collectivités réelles avec leur type et leur nombre de parcs rattachés", async () => {
    renderOrganizations();
    expect(await screen.findByText("Ville de Lyon")).toBeTruthy();
    expect(screen.getByText("Ville de Bordeaux")).toBeTruthy();
    expect(screen.getAllByText("Commune").length).toBe(2);
    const lyonRow = screen.getByText("Ville de Lyon").closest("tr")!;
    expect(lyonRow.textContent).toContain("12");
  });

  it("n'affiche aucune colonne Membres (retirée volontairement — RLS team_members)", async () => {
    renderOrganizations();
    await screen.findByText("Ville de Lyon");
    expect(screen.queryByText("Membres")).toBeNull();
  });

  it("affiche le tag Vérifiée/Non vérifiée selon la donnée réelle", async () => {
    renderOrganizations();
    const lyonRow = (await screen.findByText("Ville de Lyon")).closest("tr")!;
    const bordeauxRow = screen.getByText("Ville de Bordeaux").closest("tr")!;
    expect(lyonRow.textContent).toContain("Vérifiée");
    expect(lyonRow.textContent).not.toContain("Non vérifiée");
    expect(bordeauxRow.textContent).toContain("Non vérifiée");
  });

  it("le compteur total et le filtre de recherche restreignent la liste au nom de la collectivité", async () => {
    renderOrganizations();
    await screen.findByText("Ville de Lyon");
    expect(screen.getByText("2 collectivités")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Rechercher"), { target: { value: "Lyon" } });
    await waitFor(() => expect(screen.queryByText("Ville de Bordeaux")).toBeNull());
    expect(screen.getByText("Ville de Lyon")).toBeTruthy();
  });

  it("le filtre de vérification restreint la liste", async () => {
    renderOrganizations();
    await screen.findByText("Ville de Lyon");

    fireEvent.change(screen.getByLabelText("Vérification"), { target: { value: "verified" } });
    await waitFor(() => expect(screen.queryByText("Ville de Bordeaux")).toBeNull());
    expect(screen.getByText("Ville de Lyon")).toBeTruthy();
  });

  it("affiche un état d'erreur avec un bouton Réessayer", async () => {
    vi.mocked(listOrganizationsWithCounts).mockRejectedValueOnce(new Error("boom"));
    renderOrganizations();
    expect(await screen.findByText("Impossible de charger les collectivités.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });

  it("affiche un état vide honnête quand aucune collectivité n'est enregistrée", async () => {
    vi.mocked(listOrganizationsWithCounts).mockResolvedValueOnce([]);
    renderOrganizations();
    expect(await screen.findByText("Aucune collectivité enregistrée.")).toBeTruthy();
  });

  it("cliquer une ligne navigue vers /organizations/:id", async () => {
    renderOrganizations();
    fireEvent.click(await screen.findByText("Ville de Lyon"));
    expect(screen.getByTestId("loc").textContent).toBe("/organizations/org-lyon");
  });
});
