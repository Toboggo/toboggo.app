// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@toboggo/shared", () => ({
  listPendingMedia: vi.fn(),
  listParkEdits: vi.fn(),
  getParkCountryDistribution: vi.fn(),
  listOrganizationsWithCounts: vi.fn(),
  countAllUsers: vi.fn(),
}));

import { listParkEdits, listPendingMedia } from "@toboggo/shared";
import { queryClient as appQueryClient } from "./queryClient";
import { usePendingEditsAdmin, usePendingMedia } from "./sharedQueries";
import { useInView } from "./useInView";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("sharedQueries — one request for a dataset needed by several consumers", () => {
  beforeEach(() => {
    vi.mocked(listPendingMedia).mockReset().mockResolvedValue([{ id: "m1" }, { id: "m2" }] as never);
    vi.mocked(listParkEdits).mockReset().mockResolvedValue([{ id: "e1" }] as never);
  });

  it("pending media: a full-list consumer and a count consumer (select) share one fetch", async () => {
    const client = new QueryClient();
    const { result } = renderHook(
      () => ({ list: usePendingMedia("c1"), count: usePendingMedia("c1", { select: (rows) => rows.length }) }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.count.data).toBe(2));
    expect(result.current.list.data).toHaveLength(2);
    expect(listPendingMedia).toHaveBeenCalledTimes(1);
    expect(listPendingMedia).toHaveBeenCalledWith({ communeId: "c1" });
  });

  it("pending edits (admin): Shell badge + dashboard share one fetch, and `enabled` is honoured", async () => {
    const client = new QueryClient();
    const { result } = renderHook(
      () => ({ badge: usePendingEditsAdmin({ select: (r) => r.length }), dash: usePendingEditsAdmin() }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.badge.data).toBe(1));
    expect(listParkEdits).toHaveBeenCalledTimes(1);
    expect(listParkEdits).toHaveBeenCalledWith({ status: ["pending"] });

    vi.mocked(listParkEdits).mockClear();
    renderHook(() => usePendingEditsAdmin({ enabled: false }), { wrapper: wrapper(new QueryClient()) });
    expect(listParkEdits).not.toHaveBeenCalled();
  });
});

describe("back-office QueryClient defaults", () => {
  it("does not refetch on window focus and keeps data fresh for 60 s", () => {
    const defaults = appQueryClient.getDefaultOptions().queries;
    expect(defaults?.refetchOnWindowFocus).toBe(false);
    expect(defaults?.staleTime).toBe(60_000);
  });
});

describe("useInView", () => {
  it("falls back to `true` when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { result } = renderHook(() => useInView());
    expect(result.current[1]).toBe(true);
    vi.unstubAllGlobals();
  });
});
