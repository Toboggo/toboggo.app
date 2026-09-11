import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without this, React Testing Library renders from different test files (or
// different `it` blocks) pile up in the shared jsdom `document.body`, making
// `screen.getByText(...)` matches ambiguous across tests.
afterEach(() => {
  cleanup();
});
