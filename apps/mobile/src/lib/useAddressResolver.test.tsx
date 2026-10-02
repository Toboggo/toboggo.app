import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { reverseGeocode, type ReverseGeocodedAddress } from "@toboggo/shared";
import { useAddressResolver } from "./useAddressResolver";

vi.mock("@toboggo/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@toboggo/shared")>()),
  reverseGeocode: vi.fn(),
}));

const addr = (line: string): ReverseGeocodedAddress => ({
  address_line: line, postal_code: null, city: null, admin_area_1: null, admin_area_2: null, country_code: null, formatted: null,
});

function setup() {
  const onResolved = vi.fn();
  const onUnresolved = vi.fn();
  const onStart = vi.fn();
  const hook = renderHook(() => useAddressResolver({ onStart, onResolved, onUnresolved }));
  return { ...hook, onResolved, onUnresolved, onStart };
}

beforeEach(() => vi.mocked(reverseGeocode).mockReset());

describe("useAddressResolver", () => {
  it("coordonnées invalides → aucun appel", () => {
    const { result } = setup();
    act(() => {
      result.current.resolve(NaN, 3);
      result.current.resolve(0, 0);
      result.current.resolve(91, 3);
    });
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it("ne fait aucun appel au montage", () => {
    const { onStart } = setup();
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("onStart n'est appelé que pour une vraie nouvelle requête (pas pour une position dédoublonnée ou invalide)", async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(addr("A"));
    const { result, onStart, onResolved } = setup();
    act(() => {
      result.current.resolve(NaN, 1);
      result.current.resolve(44.1, 3.1);
      result.current.resolve(44.1, 3.1);
    });
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledWith(expect.anything(), { lat: 44.1, lng: 3.1 });
  });

  it("même position redemandée → un seul appel", async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(addr("A"));
    const { result, onResolved } = setup();
    act(() => {
      result.current.resolve(44.1, 3.1);
      result.current.resolve(44.1, 3.1);
    });
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
  });

  it("une réponse ancienne ne remplace pas la plus récente (et la requête ancienne est abandonnée)", async () => {
    let resolveOld!: (a: ReverseGeocodedAddress) => void;
    const signals: AbortSignal[] = [];
    vi.mocked(reverseGeocode)
      .mockImplementationOnce((_la, _ln, o) => {
        signals.push(o!.signal!);
        return new Promise((r) => (resolveOld = r));
      })
      .mockImplementationOnce((_la, _ln, o) => {
        signals.push(o!.signal!);
        return Promise.resolve(addr("NOUVELLE"));
      });
    const { result, onResolved } = setup();
    act(() => result.current.resolve(44.1, 3.1));
    act(() => result.current.resolve(44.2, 3.2));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ address_line: "NOUVELLE" }), { lat: 44.2, lng: 3.2 }));

    expect(signals[0].aborted).toBe(true);
    await act(async () => resolveOld(addr("ANCIENNE")));
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onResolved).not.toHaveBeenCalledWith(expect.objectContaining({ address_line: "ANCIENNE" }));
  });

  it("erreur → onUnresolved (jamais onResolved) et la même position peut être retentée", async () => {
    vi.mocked(reverseGeocode).mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(addr("OK"));
    const { result, onResolved, onUnresolved } = setup();
    act(() => result.current.resolve(44.1, 3.1));
    await waitFor(() => expect(onUnresolved).toHaveBeenCalledTimes(1));
    expect(onResolved).not.toHaveBeenCalled();

    act(() => result.current.resolve(44.1, 3.1));
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
  });

  it("aucun résultat (null) → onUnresolved", async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(null);
    const { result, onUnresolved } = setup();
    act(() => result.current.resolve(44.1, 3.1));
    await waitFor(() => expect(onUnresolved).toHaveBeenCalledTimes(1));
  });

  it("démontage → réponse tardive ignorée", async () => {
    let finish!: (a: ReverseGeocodedAddress) => void;
    vi.mocked(reverseGeocode).mockImplementationOnce(() => new Promise((r) => (finish = r)));
    const { result, unmount, onResolved } = setup();
    act(() => result.current.resolve(44.1, 3.1));
    unmount();
    finish(addr("TARD"));
    await new Promise((r) => setTimeout(r, 0));
    expect(onResolved).not.toHaveBeenCalled();
  });
});
