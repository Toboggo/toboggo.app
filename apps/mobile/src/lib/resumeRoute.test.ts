import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearResumeRoute, setResumeRoute, takeResumeRoute } from "./resumeRoute";

const RESUME_KEY = "toboggo:contrib-resume";

beforeEach(() => {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resumeRoute", () => {
  it("round-trips a route and is single-use (one-shot)", () => {
    setResumeRoute("/report?park=p1&resume=1");
    expect(takeResumeRoute()).toBe("/report?park=p1&resume=1");
    // consumed: a second read returns null and the key is gone
    expect(takeResumeRoute()).toBeNull();
    expect(localStorage.getItem(RESUME_KEY)).toBeNull();
  });

  it("survives 29 min, is dropped past 30 min", () => {
    const base = 1_700_000_000_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(base);
    setResumeRoute("/contribute/edit?park=p1&resume=1");
    now.mockReturnValue(base + 29 * 60 * 1000);
    expect(takeResumeRoute()).toBe("/contribute/edit?park=p1&resume=1");

    now.mockReturnValue(base);
    setResumeRoute("/report?park=p1&resume=1");
    now.mockReturnValue(base + 31 * 60 * 1000);
    expect(takeResumeRoute()).toBeNull();
    expect(localStorage.getItem(RESUME_KEY)).toBeNull();
  });

  it("rejects a non-absolute / malformed route, and clears it", () => {
    localStorage.setItem(RESUME_KEY, JSON.stringify({ savedAt: Date.now(), route: "https://evil.example" }));
    expect(takeResumeRoute()).toBeNull();
    localStorage.setItem(RESUME_KEY, "{not json");
    expect(takeResumeRoute()).toBeNull();
    expect(localStorage.getItem(RESUME_KEY)).toBeNull();
  });

  it("holds no form data — only the route string", () => {
    setResumeRoute("/report?park=p1&resume=1");
    const raw = JSON.parse(localStorage.getItem(RESUME_KEY)!);
    expect(Object.keys(raw).sort()).toEqual(["route", "savedAt"]);
  });

  it("clearResumeRoute removes the marker; every call degrades safely without localStorage", () => {
    setResumeRoute("/x");
    clearResumeRoute();
    expect(localStorage.getItem(RESUME_KEY)).toBeNull();

    vi.stubGlobal("localStorage", undefined);
    expect(() => setResumeRoute("/y")).not.toThrow();
    expect(takeResumeRoute()).toBeNull();
    expect(() => clearResumeRoute()).not.toThrow();
  });
});
