import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { countParksByCreator, listAllUsers, listParks, listReviews } from "@toboggo/shared";
import Users from "./Users";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listAllUsers: vi.fn(),
    listParks: vi.fn().mockResolvedValue([]),
    listReviews: vi.fn().mockResolvedValue([]),
    countParksByCreator: vi.fn(),
  };
});

const USERS = [
  { id: "u1", name: "Alice", email: "alice@example.test", suspended: false },
  { id: "u2", name: "Bob", email: "bob@example.test", suspended: false },
] as never;

function renderUsers() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Users />
    </QueryClientProvider>,
  );
}

describe("Utilisateurs — compteurs de parcs (Lot A)", () => {
  it("lit les compteurs via countParksByCreator, jamais listParks() (tronquée à 1000)", async () => {
    vi.mocked(listAllUsers).mockResolvedValue(USERS);
    vi.mocked(countParksByCreator).mockResolvedValue({ counts: new Map([["u1", 1234]]), complete: true });
    renderUsers();
    expect(await screen.findByText(/alice@example.test · 1234 parcs/)).toBeTruthy();
    expect(screen.getByText(/bob@example.test · 0 parcs/)).toBeTruthy();
    expect(listParks).not.toHaveBeenCalled();
    expect(listReviews).toHaveBeenCalled();
  });

  it("signale un compteur minoré (+) quand le plafond de lecture est atteint", async () => {
    vi.mocked(listAllUsers).mockResolvedValue(USERS);
    vi.mocked(countParksByCreator).mockResolvedValue({ counts: new Map([["u1", 10_000]]), complete: false });
    renderUsers();
    expect(await screen.findByText(/alice@example.test · 10000\+ parcs/)).toBeTruthy();
  });
});
