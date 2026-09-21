import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../i18n/testInit";
import EditInfoPickPark from "./EditInfoPickPark";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    searchParks: vi.fn().mockResolvedValue([{ id: "p1", name: "Square Voltaire", formatted_address: "Lyon" }]),
  };
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}{loc.search}</div>;
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/contribute/edit/pick-park"]}>
        <LocationProbe />
        <Routes>
          <Route path="/contribute/edit/pick-park" element={<EditInfoPickPark />} />
          <Route path="*" element={<div>OTHER</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const loc = () => screen.getByTestId("loc").textContent;

describe("EditInfoPickPark", () => {
  it("reuses the existing ParkPicker and forwards the chosen park to EditInfo", async () => {
    renderScreen();
    screen.getByText("Quel parc souhaitez-vous modifier ?");
    fireEvent.change(screen.getByPlaceholderText("Nom ou adresse du parc"), { target: { value: "Voltaire" } });

    fireEvent.click(await screen.findByText("Square Voltaire"));
    await waitFor(() => expect(loc()).toBe("/contribute/edit?park=p1"));
  });

  it("'none of these' routes to the add-park flow instead of duplicating the picker", () => {
    renderScreen();
    fireEvent.click(screen.getByText("Aucun de ceux-ci — ajouter un nouveau parc"));
    expect(loc()).toBe("/action-intro/add");
  });
});
