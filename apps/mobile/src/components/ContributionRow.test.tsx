import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { UserContribution } from "@toboggo/shared";
import "../i18n/testInit";
import { ContributionRow } from "./ContributionRow";

const base: UserContribution = {
  id: "review:r1",
  sourceId: "r1",
  type: "review",
  parkId: "p1",
  parkName: "Square Voltaire",
  city: "Lyon",
  createdAt: "2026-09-01T10:00:00Z",
  status: "published",
  thumbnail: null,
  rating: 4,
  editedAt: "2026-09-20T10:00:00Z",
};

describe("ContributionRow — review edit entry", () => {
  it("offers « Modifier mon avis » from the ⋯ menu of a published review, and shows « Modifié le »", () => {
    const onEdit = vi.fn();
    render(<ContributionRow item={base} onClick={() => {}} onEditReview={onEdit} />);
    expect(screen.getByText(/Modifié le/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Actions sur votre avis" }));
    fireEvent.click(screen.getByRole("button", { name: /Modifier mon avis/ }));
    expect(onEdit).toHaveBeenCalledWith(base);
  });

  it("opens a compact dialog (title, park subtitle, Annuler) closable by Annuler, backdrop and Escape; scroll locked while open", () => {
    render(<ContributionRow item={base} onClick={() => {}} onEditReview={vi.fn()} />);
    const open = () => fireEvent.click(screen.getByRole("button", { name: "Actions sur votre avis" }));

    open();
    const dialog = screen.getByRole("dialog", { name: "Votre avis" });
    expect(dialog.textContent).toContain("Square Voltaire");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");

    open();
    fireEvent.click(screen.getByTestId("review-menu-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();

    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers no menu for non-reviews or non-published reviews", () => {
    const onEdit = vi.fn();
    const { rerender } = render(<ContributionRow item={{ ...base, status: "flagged" }} onClick={() => {}} onEditReview={onEdit} />);
    expect(screen.queryByRole("button", { name: "Actions sur votre avis" })).toBeNull();
    rerender(<ContributionRow item={{ ...base, type: "report" }} onClick={() => {}} onEditReview={onEdit} />);
    expect(screen.queryByRole("button", { name: "Actions sur votre avis" })).toBeNull();
  });
});
