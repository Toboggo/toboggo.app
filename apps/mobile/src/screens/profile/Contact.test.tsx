import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { sendContactMessage } from "@toboggo/shared";
import "../../i18n/testInit";
import Contact from "./Contact";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return { ...actual, sendContactMessage: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("../../lib/session", () => ({
  useSession: (sel: (s: unknown) => unknown) => sel({ profile: null }),
}));

function renderContact(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Contact />
    </MemoryRouter>,
  );
}

async function fillAndSend() {
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Ana" } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@example.com" } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Super app" } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await waitFor(() => expect(sendContactMessage).toHaveBeenCalledTimes(1));
}

beforeEach(() => vi.mocked(sendContactMessage).mockClear());

describe("Contact — feedback subject", () => {
  it("preselects « Avis sur Toboggo » from ?subject=feedback and sends it", async () => {
    renderContact("/contact?subject=feedback");
    await fillAndSend();
    expect(vi.mocked(sendContactMessage).mock.calls[0][0]).toMatchObject({ subject: "Avis sur Toboggo", message: "Super app" });
  });

  it("keeps « Question générale » as default without the param", async () => {
    renderContact("/contact");
    await fillAndSend();
    expect(vi.mocked(sendContactMessage).mock.calls[0][0].subject).toBe("Question générale");
  });
});
