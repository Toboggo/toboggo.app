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

// Distances: « Automatique » follows the device region (lib/distanceUnit.ts).
// jsdom reports en-US, which would flip every distance assertion to miles —
// pin a metric region so the suite is deterministic; tests that exercise the
// miles/auto behaviour pass their own language list or stub this property.
if (typeof navigator !== "undefined") {
  Object.defineProperty(navigator, "languages", { value: ["fr-FR"], configurable: true });
  Object.defineProperty(navigator, "language", { value: "fr-FR", configurable: true });
}

// jsdom n'implémente pas window.scrollTo (les parcours remontent en haut à chaque étape).
if (typeof window !== "undefined") {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}
