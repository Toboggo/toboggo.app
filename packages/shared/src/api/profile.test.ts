import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../supabaseClient";
import { InvalidUsernameError, setUsername } from "./profile";
import { makeFakeSupabase } from "../testUtils/fakeSupabase";

vi.mock("../supabaseClient", () => ({ getSupabase: vi.fn() }));

describe("setUsername", () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it("met à jour uniquement `name` de la ligne de l'utilisateur, valeur normalisée", async () => {
    const { client, queriesByTable } = makeFakeSupabase({
      profiles: { data: { id: "u1", name: "Camille et Léo" }, error: null },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const profile = await setUsername("u1", "  Camille   et Léo ");

    expect(profile.name).toBe("Camille et Léo");
    const calls = queriesByTable["profiles"][0].calls;
    expect(calls.find((c) => c.method === "update")?.args[0]).toEqual({ name: "Camille et Léo" });
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["id", "u1"]);
  });

  it("refuse un pseudo invalide sans appeler le serveur", async () => {
    await expect(setUsername("u1", "ab")).rejects.toBeInstanceOf(InvalidUsernameError);
    expect(getSupabase).not.toHaveBeenCalled();
  });

  it("traduit le rejet serveur (23514) en InvalidUsernameError", async () => {
    const { client } = makeFakeSupabase({
      profiles: { data: null, error: { code: "23514", message: "profiles.name invalide" } },
    });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await expect(setUsername("u1", "valide")).rejects.toBeInstanceOf(InvalidUsernameError);
  });

  it("propage les autres erreurs", async () => {
    const { client } = makeFakeSupabase({ profiles: { data: null, error: { code: "08006", message: "down" } } });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await expect(setUsername("u1", "valide")).rejects.toMatchObject({ code: "08006" });
  });
});
