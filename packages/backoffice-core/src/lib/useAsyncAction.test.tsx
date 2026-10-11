import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ToastProvider } from "@toboggo/design-system";
import { useAsyncAction } from "./useAsyncAction";

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("useAsyncAction — F. a mutation cannot be submitted twice at once", () => {
  it("ignores a second call while the first is still in flight", async () => {
    let resolveFirst: () => void = () => {};
    const fn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { result } = renderHook(() => useAsyncAction(fn), { wrapper });

    let p1!: Promise<void>;
    let p2: Promise<void> | undefined;
    act(() => {
      p1 = result.current.run();
      p2 = result.current.run();
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);

    await act(async () => {
      resolveFirst();
      await p1;
      await p2;
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  it("allows a new call once the previous one has settled", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAsyncAction(fn), { wrapper });

    await act(async () => {
      await result.current.run();
    });
    await act(async () => {
      await result.current.run();
    });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("catches a rejection and clears `pending` instead of leaving it stuck", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAsyncAction(fn), { wrapper });

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.pending).toBe(false);
    // A second call is allowed after the failure (not permanently locked out).
    await act(async () => {
      await result.current.run();
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
