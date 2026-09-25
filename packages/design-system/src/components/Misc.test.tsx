import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorState, StatCard } from "./Misc";

describe("StatCard — Admin-UI-7B (icon/hint/trend/tone additive, existing usage unchanged)", () => {
  it("renders value/label only, disabled, when no onClick is passed — matches Maintenance.tsx's existing call shape", () => {
    const { container } = render(<StatCard value={3} label="À venir" />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("À venir")).toBeTruthy();
    expect((screen.getByRole("button", { name: /À venir/ }) as HTMLButtonElement).disabled).toBe(true);
    // No icon/hint/trend markup when those props are omitted.
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders the icon only when the icon prop is passed", () => {
    const { container } = render(<StatCard value={1} label="Parcs" icon="ic-list" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("is enabled and clickable when onClick is passed", () => {
    const onClick = vi.fn();
    render(<StatCard value={5} label="Ouverts" onClick={onClick} />);
    const btn = screen.getByRole("button", { name: /Ouverts/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it("shows hint and trend only when provided", () => {
    render(<StatCard value={12} label="Signalements" hint="dont 2 critiques" trend={{ label: "+3", direction: "up" }} />);
    expect(screen.getByText("dont 2 critiques")).toBeTruthy();
    expect(screen.getByText("+3")).toBeTruthy();
  });

  it("never fabricates a trend — omitted entirely unless the caller supplies one", () => {
    render(<StatCard value={12} label="Signalements" />);
    expect(screen.queryByText(/^[+-]/)).toBeNull();
  });
});

describe("ErrorState — Admin-UI-7B (shared compact error pattern)", () => {
  it("shows a default message and calls onRetry", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByText("Impossible de charger ces données.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("accepts a custom message", () => {
    render(<ErrorState message="Erreur réseau." onRetry={() => {}} />);
    expect(screen.getByText("Erreur réseau.")).toBeTruthy();
  });
});
