import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Card } from "./Card";

// CSS modules compile to `_<name>_<hash>` here (same transform in test and
// dev — verified against real DOM dumps elsewhere in this codebase), so
// `/_admin_/` reliably targets the `.admin` class without a false match on
// `.adminShadow` (`_adminShadow_...` never matches `/_admin_/` since the `_`
// after "admin" is required and absent there).
describe("Card — Admin-UI-7B (variant='admin' opt-in, default unchanged)", () => {
  it("default variant renders exactly as before (no admin-specific classes)", () => {
    const { container } = render(<Card data-testid="c">hi</Card>);
    const el = container.firstElementChild!;
    expect(el.className).not.toMatch(/_admin/);
  });

  it("flat (existing usage) is unaffected by the new variant/shadow props", () => {
    const { container } = render(
      <Card flat padding="sm">
        hi
      </Card>,
    );
    const el = container.firstElementChild!;
    expect(el.className).toMatch(/_flat_/);
    expect(el.className).not.toMatch(/_admin/);
  });

  it("variant='admin' adds the admin surface class", () => {
    const { container } = render(<Card variant="admin">hi</Card>);
    const el = container.firstElementChild!;
    expect(el.className).toMatch(/_admin_/);
  });

  it("shadow only applies alongside variant='admin'", () => {
    const { container: withoutVariant } = render(<Card shadow>hi</Card>);
    expect(withoutVariant.firstElementChild!.className).not.toMatch(/_adminShadow_/);

    const { container: withVariant } = render(
      <Card variant="admin" shadow>
        hi
      </Card>,
    );
    expect(withVariant.firstElementChild!.className).toMatch(/_adminShadow_/);
  });
});
