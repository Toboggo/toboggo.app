import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithGoogleMock = vi.hoisted(() => vi.fn());
vi.mock("@toboggo/shared", () => ({ signInWithGoogle: signInWithGoogleMock }));

import {
  clearGoogleLoginMarker,
  consumeGoogleLoginMarker,
  isNewAccount,
  markGoogleLoginStarted,
  startGoogleLogin,
} from "./googleLogin";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  signInWithGoogleMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("googleLogin marker", () => {
  it("is consumed exactly once", () => {
    markGoogleLoginStarted();
    expect(consumeGoogleLoginMarker()).toBe(true);
    expect(consumeGoogleLoginMarker()).toBe(false);
    expect(store.size).toBe(0);
  });

  it("is absent by default", () => {
    expect(consumeGoogleLoginMarker()).toBe(false);
  });

  it("expires after the TTL and is still removed", () => {
    vi.useFakeTimers();
    markGoogleLoginStarted();
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(consumeGoogleLoginMarker()).toBe(false);
    expect(store.size).toBe(0);
  });

  it("clearGoogleLoginMarker removes it", () => {
    markGoogleLoginStarted();
    clearGoogleLoginMarker();
    expect(consumeGoogleLoginMarker()).toBe(false);
  });

  it("survives unavailable storage without throwing", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => markGoogleLoginStarted()).not.toThrow();
    expect(consumeGoogleLoginMarker()).toBe(false);
    expect(() => clearGoogleLoginMarker()).not.toThrow();
  });
});

describe("startGoogleLogin", () => {
  it("sets the marker before starting the OAuth redirect", async () => {
    let markedAtCall = false;
    signInWithGoogleMock.mockImplementation(async () => {
      markedAtCall = store.size === 1;
    });
    await startGoogleLogin();
    expect(markedAtCall).toBe(true);
    expect(consumeGoogleLoginMarker()).toBe(true);
  });

  it("removes the marker and rethrows if the start fails", async () => {
    signInWithGoogleMock.mockRejectedValue(new Error("provider disabled"));
    await expect(startGoogleLogin()).rejects.toThrow("provider disabled");
    expect(store.size).toBe(0);
  });
});

describe("isNewAccount", () => {
  it("true when last_sign_in_at is written with created_at (account just created)", () => {
    expect(isNewAccount({ created_at: "2026-10-01T12:00:00.000Z", last_sign_in_at: "2026-10-01T12:00:00.080Z" })).toBe(true);
  });
  it("false for an older account (incl. email account linking Google later)", () => {
    expect(isNewAccount({ created_at: "2026-09-01T12:00:00.000Z", last_sign_in_at: "2026-10-01T12:00:00.000Z" })).toBe(false);
  });
  it("false (login) when data is missing, invalid or inconsistent", () => {
    expect(isNewAccount({})).toBe(false);
    expect(isNewAccount({ created_at: "x", last_sign_in_at: "y" })).toBe(false);
    expect(isNewAccount({ created_at: "2026-10-01T12:00:00.000Z", last_sign_in_at: "2026-10-01T11:59:00.000Z" })).toBe(false);
  });
});
