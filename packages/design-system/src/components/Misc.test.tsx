import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "./Misc";

describe("StatCard — secondary line (COLL-02C)", () => {
  it("renders a secondary line when provided", () => {
    render(<StatCard value={12} label="Avis reçus" secondary="★ 4.3 moyenne" onClick={vi.fn()} />);
    expect(screen.getByText("★ 4.3 moyenne")).toBeTruthy();
  });

  it("renders no secondary line when omitted — existing callers are unaffected", () => {
    render(<StatCard value={3} label="Entretiens" onClick={vi.fn()} />);
    expect(screen.queryByText(/moyenne/)).toBeNull();
  });
});
