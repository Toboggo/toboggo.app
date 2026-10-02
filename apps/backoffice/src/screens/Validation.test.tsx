import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listParkEditsWithDetails } from "@toboggo/shared";
import Validation from "./Validation";

const FIXTURE = vi.hoisted(() => [
  {
    id: "e1",
    park_id: "p1",
    user_id: "u1",
    organization_id: null,
    changes: { items: [{ field: "ages", label: "Tranche d'âge", current: { min: 3, max: 10 }, proposed: { min: 4, max: 11 } }] },
    status: "pending",
    reviewed_by: null,
    review_note: null,
    created_at: "2026-09-01T10:00:00Z",
    reviewed_at: null,
    parks: { name: "Parc Nord", formatted_address: "1 rue A" },
    proposedByName: null,
  },
  {
    id: "e2",
    park_id: "p2",
    user_id: "u1",
    organization_id: null,
    changes: {
      items: [
        {
          field: "location",
          label: "Localisation",
          current: { latitude: 43.6, longitude: 1.44 },
          proposed: { lat: 44, lng: 2 },
        },
      ],
    },
    status: "pending",
    reviewed_by: null,
    review_note: null,
    created_at: "2026-09-02T10:00:00Z",
    reviewed_at: null,
    parks: { name: "Parc Sud", formatted_address: null },
    proposedByName: "Jean Dupont",
  },
  {
    id: "e3",
    park_id: "p3",
    user_id: null,
    organization_id: null,
    changes: { items: [{ field: "feature:slide", label: "Toboggan", current: "unavailable", proposed: "available" }] },
    status: "pending",
    reviewed_by: null,
    review_note: null,
    created_at: "2026-09-03T10:00:00Z",
    reviewed_at: null,
    parks: { name: "Parc Est", formatted_address: "3 rue C" },
    proposedByName: null,
  },
  {
    id: "e4",
    park_id: "p4",
    user_id: null,
    organization_id: null,
    changes: {
      items: [
        { field: "ages", label: "Tranche d'âge", current: { min: 3, max: 10 }, proposed: { min: 4, max: 11 } },
        { field: "location", label: "Localisation", current: { latitude: 1, longitude: 1 }, proposed: { lat: 2, lng: 2 } },
      ],
    },
    status: "pending",
    reviewed_by: null,
    review_note: null,
    created_at: "2026-09-04T10:00:00Z",
    reviewed_at: null,
    parks: { name: "Parc Ouest", formatted_address: null },
    proposedByName: null,
  },
  {
    id: "e5",
    park_id: "p5",
    user_id: null,
    organization_id: null,
    changes: { items: [{ field: "ages", label: "Tranche d'âge", current: { min: 3, max: 10 }, proposed: { min: 4, max: 11 } }] },
    status: "approved",
    reviewed_by: "admin-1",
    review_note: null,
    created_at: "2026-09-05T10:00:00Z",
    reviewed_at: "2026-09-06T10:00:00Z",
    parks: { name: "Parc Approuvé", formatted_address: null },
    proposedByName: null,
  },
]);

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listParkEditsWithDetails: vi.fn().mockResolvedValue(FIXTURE),
  };
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderValidation() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/validation"]}>
        <LocationProbe />
        <Routes>
          <Route path="/validation" element={<Validation />} />
          <Route path="/validation/:editId" element={<div>DÉTAIL</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Validation — file de validation (Admin-3B-1)", () => {
  it("affiche un état de chargement avant que les données n'arrivent", () => {
    renderValidation();
    expect(screen.queryByText("Parc Nord")).toBeNull();
  });

  it("affiche les propositions en attente par défaut (onglet À traiter)", async () => {
    renderValidation();
    expect(await screen.findByText("Parc Nord")).toBeTruthy();
    expect(screen.getByText("Parc Sud")).toBeTruthy();
    expect(screen.getByText("Parc Est")).toBeTruthy();
    expect(screen.getByText("Parc Ouest")).toBeTruthy();
    // e5 est 'approved' : absent de l'onglet À traiter par défaut.
    expect(screen.queryByText("Parc Approuvé")).toBeNull();
  });

  it("montre 'Utilisateur' quand aucun nom d'auteur n'est résolu, sinon le vrai nom", async () => {
    renderValidation();
    await screen.findByText("Parc Nord");
    expect(screen.getByText("Jean Dupont")).toBeTruthy();
    expect(screen.getAllByText("Utilisateur").length).toBeGreaterThan(0);
  });

  it("mappe field='ages' sur le libellé Âges", async () => {
    renderValidation();
    const row = (await screen.findByText("Parc Nord")).closest("tr")!;
    expect(row.textContent).toContain("Âges");
  });

  it("mappe field='location' sur le libellé Localisation", async () => {
    renderValidation();
    const row = (await screen.findByText("Parc Sud")).closest("tr")!;
    expect(row.textContent).toContain("Localisation");
  });

  it("mappe field='feature:<code>' sur le libellé Équipements", async () => {
    renderValidation();
    const row = (await screen.findByText("Parc Est")).closest("tr")!;
    expect(row.textContent).toContain("Équipements");
  });

  it("mappe une proposition multi-catégories sur 'Plusieurs modifications'", async () => {
    renderValidation();
    const row = (await screen.findByText("Parc Ouest")).closest("tr")!;
    expect(row.textContent).toContain("Plusieurs modifications");
  });

  it("l'onglet Traitées affiche les propositions non-pending avec leur statut", async () => {
    renderValidation();
    await screen.findByText("Parc Nord");
    fireEvent.click(screen.getByRole("tab", { name: /Traitées/ }));
    const row = (await screen.findByText("Parc Approuvé")).closest("tr")!;
    expect(row.textContent).toContain("Approuvée");
    expect(screen.queryByText("Parc Nord")).toBeNull();
  });

  it("le filtre de recherche restreint la liste au nom du parc", async () => {
    renderValidation();
    await screen.findByText("Parc Nord");
    fireEvent.change(screen.getByLabelText("Rechercher"), { target: { value: "Nord" } });
    await waitFor(() => expect(screen.queryByText("Parc Sud")).toBeNull());
    expect(screen.getByText("Parc Nord")).toBeTruthy();
  });

  it("affiche un état d'erreur avec un bouton Réessayer", async () => {
    vi.mocked(listParkEditsWithDetails).mockRejectedValueOnce(new Error("boom"));
    renderValidation();
    expect(await screen.findByText("Impossible de charger la file de validation.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });

  it("cliquer une ligne ('Voir') navigue vers /validation/:editId", async () => {
    renderValidation();
    fireEvent.click(await screen.findByText("Parc Nord"));
    expect(screen.getByTestId("loc").textContent).toBe("/validation/e1");
  });
});
