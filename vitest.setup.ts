import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without this, React Testing Library renders from different test files (or
// different `it` blocks) pile up in the shared jsdom `document.body`, making
// `screen.getByText(...)` matches ambiguous across tests.
afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver — needed by BottomSheet's "fit" content
// measurement. A no-op stub is enough here: BottomSheet always measures once
// synchronously before observing, so the initial layout is already correct.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
