import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "../../i18n/testInit";
import { UpdateBanner } from "../../components/UpdateBanner";
import {
  RELOAD_GUARD_KEY,
  RELOAD_GUARD_WINDOW_MS,
  UPDATE_CHECK_INTERVAL_MS,
  initPreloadErrorGuard,
  initPwaUpdates,
  isUserBusy,
  reloadOnce,
  usePwaUpdateStore,
} from "./pwaUpdate";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    data,
  };
}

function fakeServiceWorker(controller: object | null) {
  const listeners = new Map<string, Set<() => void>>();
  const update = vi.fn().mockResolvedValue(undefined);
  const sw = {
    controller,
    register: vi.fn().mockResolvedValue({ update }),
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
    emit: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
  };
  return { sw: sw as unknown as ServiceWorkerContainer & { emit: (t: string) => void; register: typeof sw.register }, update };
}

const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  usePwaUpdateStore.setState({ updateAvailable: false });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  (document.activeElement as HTMLElement | null)?.blur();
});

describe("initPwaUpdates", () => {
  function setup(opts: { controller?: object | null; busy?: boolean } = {}) {
    const { sw, update } = fakeServiceWorker(opts.controller === undefined ? {} : opts.controller);
    const reload = vi.fn();
    const storage = memoryStorage();
    const cleanup = initPwaUpdates({
      serviceWorker: sw,
      doc: document,
      win: window,
      isBusy: () => opts.busy ?? false,
      reload,
      storage,
      scriptUrl: "/sw.js",
    });
    return { sw, update, reload, storage, cleanup };
  }

  it("registers /sw.js exactly once and checks for an update at startup", async () => {
    const { sw, update, cleanup } = setup();
    await flush();
    expect(sw.register).toHaveBeenCalledTimes(1);
    expect(sw.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(update).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("checks for an update when the app returns to the foreground, not when hidden", async () => {
    const { update, cleanup } = setup();
    await flush();
    update.mockClear();
    setVisibility("hidden");
    expect(update).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(update).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("checks for an update every 30 minutes", async () => {
    const { update, cleanup } = setup();
    await flush();
    update.mockClear();
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(update).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it("reloads once when a new service worker takes control", () => {
    const { sw, reload, cleanup } = setup();
    sw.emit("controllerchange");
    sw.emit("controllerchange");
    expect(reload).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does not reload on the first-install controllerchange (no previous controller)", () => {
    const { sw, reload, cleanup } = setup({ controller: null });
    sw.emit("controllerchange");
    expect(reload).not.toHaveBeenCalled();
    sw.emit("controllerchange"); // a real update afterwards
    expect(reload).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("shows the banner instead of reloading while the user is busy", () => {
    const { sw, reload, cleanup } = setup({ busy: true });
    sw.emit("controllerchange");
    expect(reload).not.toHaveBeenCalled();
    expect(usePwaUpdateStore.getState().updateAvailable).toBe(true);
    cleanup();
  });

  it("swallows update() failures (offline)", async () => {
    const { update, cleanup } = setup();
    await flush();
    update.mockRejectedValueOnce(new Error("offline"));
    expect(() => setVisibility("visible")).not.toThrow();
    await flush();
    cleanup();
  });
});

describe("reloadOnce (anti-loop guard)", () => {
  it("refuses a second reload inside the guard window, allows it after", () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    expect(reloadOnce(reload, storage, 1_000_000)).toBe(true);
    expect(reloadOnce(reload, storage, 1_000_000 + 1000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnce(reload, storage, 1_000_000 + RELOAD_GUARD_WINDOW_MS + 1)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("refuses to reload when sessionStorage is unavailable", () => {
    const reload = vi.fn();
    expect(reloadOnce(reload, null)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("vite:preloadError guard", () => {
  function setup(opts: { busy?: boolean; storage?: ReturnType<typeof memoryStorage> } = {}) {
    const target = new EventTarget();
    const reload = vi.fn();
    const storage = opts.storage ?? memoryStorage();
    initPreloadErrorGuard(target as unknown as Window, { isBusy: () => opts.busy ?? false, reload, storage });
    const fire = () => {
      const e = new Event("vite:preloadError", { cancelable: true });
      target.dispatchEvent(e);
      return e;
    };
    return { reload, fire, storage };
  }

  it("reloads once and swallows the error", () => {
    const { reload, fire } = setup();
    const first = fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);
  });

  it("does not reload a second time (guard) and lets the error propagate", () => {
    const { reload, fire } = setup();
    fire();
    const second = fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });

  it("does not reload mid-input: shows the banner instead", () => {
    const { reload, fire } = setup({ busy: true });
    const e = fire();
    expect(reload).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
    expect(usePwaUpdateStore.getState().updateAvailable).toBe(true);
  });

  it("ignores a previous stale guard entry after the window", () => {
    const { reload, fire } = setup({ storage: memoryStorage({ [RELOAD_GUARD_KEY]: "1" }) });
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("isUserBusy", () => {
  it("is busy on wizard/form routes", () => {
    for (const p of ["/rate", "/add", "/report", "/photo-add", "/contribute/edit", "/login", "/profile/children/new", "/profile/children/c1"]) {
      expect(isUserBusy(document, p), p).toBe(true);
    }
  });
  it("is not busy on browsing routes", () => {
    for (const p of ["/", "/map", "/park/p1", "/favorites", "/profile", "/profile/children", "/about", "/address"]) {
      expect(isUserBusy(document, p), p).toBe(false);
    }
  });
  it("is busy while a text field is focused, anywhere", () => {
    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);
    input.focus();
    expect(isUserBusy(document, "/map")).toBe(true);
    input.remove();
    expect(isUserBusy(document, "/map")).toBe(false);
  });
});

describe("UpdateBanner", () => {
  it("is hidden by default", () => {
    render(<UpdateBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("appears when an update is pending and reloads on click", () => {
    const { location } = window;
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...location, reload: reloadSpy } });
    usePwaUpdateStore.setState({ updateAvailable: true });
    render(<UpdateBanner />);
    expect(screen.getByRole("status").textContent).toContain("Une nouvelle version de Toboggo est disponible");
    fireEvent.click(screen.getByRole("button", { name: "Mettre à jour" }));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, "location", { configurable: true, value: location });
  });
});
