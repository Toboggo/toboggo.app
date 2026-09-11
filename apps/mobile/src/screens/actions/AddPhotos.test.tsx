import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { addParkPhotos, uploadPhoto } from "@toboggo/shared";
import "../../i18n/testInit";
import AddPhotos from "./AddPhotos";

// jsdom doesn't implement the Blob URL API used for in-memory previews.
if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => "blob:mock");
if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    // validateImageFile / ImageValidationError stay real — trivial small JPEGs
    // pass validation without any need to mock them.
    addParkPhotos: vi.fn().mockResolvedValue(undefined),
    uploadPhoto: vi.fn().mockResolvedValue("https://x/photo.jpg"),
  };
});

const PARK = { id: "p1", name: "Square Voltaire" };
vi.mock("../../lib/parksQuery", () => ({
  usePark: (id?: string) => ({ data: id === "p1" ? PARK : undefined }),
}));

// Mirrors the real requireAccount()/pendingResume pattern (session.ts) on a
// hoisted, test-controlled store — AddPhotos is the one remaining screen
// still on this in-memory just-in-time-auth mechanism (see the code comment
// at the top of AddPhotos.tsx for why it's kept).
const sess = vi.hoisted(() => ({ userId: null as string | null, pendingResume: null as (() => void) | null }));
vi.mock("../../lib/session", () => ({
  useSession: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const s = { userId: sess.userId };
      return sel ? sel(s) : s;
    },
    { getState: () => ({ userId: sess.userId }) },
  ),
  requireAccount: (navigate: (path: string) => void, action: () => void) => {
    if (sess.userId) {
      action();
      return;
    }
    sess.pendingResume = action;
    navigate("/login");
  },
}));

const toasts = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock("../../lib/toast", () => ({
  useToastStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const s = { show: (m: string) => toasts.list.push(m) };
      return sel ? sel(s) : s;
    },
    { getState: () => ({ show: (m: string) => toasts.list.push(m) }) },
  ),
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

// Real route path (App.tsx) — `requirePhotoAuth` navigates back to this exact
// path, so the test router must match it for the "return from auth" tests.
function renderPhotos(search = "?park=p1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/photo-add${search}`]}>
        <LocationProbe />
        <Routes>
          <Route path="/photo-add" element={<AddPhotos />} />
          <Route path="/login" element={<div>LOGIN</div>} />
          <Route path="/park/:id" element={<div>FICHE PARC</div>} />
          <Route path="/action-intro/add" element={<div>ADD</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const loc = () => screen.getByTestId("loc").textContent;
const makeFile = (name = "photo.jpg", type = "image/jpeg") => new File(["x"], name, { type });

function fileInput(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector('input[type="file"]');
}

function pick(container: HTMLElement, file = makeFile()) {
  fireEvent.change(fileInput(container)!, { target: { files: [file] } });
}

beforeEach(() => {
  localStorage.clear();
  sess.userId = null;
  sess.pendingResume = null;
  toasts.list.length = 0;
  vi.mocked(addParkPhotos).mockReset().mockResolvedValue(undefined);
  vi.mocked(uploadPhoto).mockReset().mockResolvedValue("https://x/photo.jpg" as never);
});

describe("AddPhotos — account required BEFORE the file picker (LOT 3D.F, point auth)", () => {
  it("guest: no <input type=\"file\"> is even rendered — nothing to pick before auth", async () => {
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    expect(fileInput(container)).toBeNull();
  });

  it("guest clicks a pick tile → auth is triggered instead of a file dialog; nothing uploaded", async () => {
    renderPhotos();
    await screen.findByText("Square Voltaire");
    fireEvent.click(screen.getAllByRole("button", { name: "+" })[0]);

    await screen.findByText("LOGIN");
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(addParkPhotos).not.toHaveBeenCalled();
  });

  it("after auth completes, the user lands back on AddPhotos and can now pick normally", async () => {
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    fireEvent.click(screen.getAllByRole("button", { name: "+" })[0]);
    await screen.findByText("LOGIN");

    // Just-in-time login completes — the stashed resume fires and routes back.
    sess.userId = "u1";
    sess.pendingResume?.();

    await waitFor(() => expect(loc()).toBe("/photo-add"));
    await screen.findByText("Square Voltaire");
    expect(fileInput(container)).toBeTruthy();

    pick(container, makeFile("after-login.jpg"));
    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(1);
  });

  it("if the session is lost after picking, submit re-routes through the same auth gate — never resumes with the old File", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container);

    sess.userId = null; // simulate an external logout mid-form
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));

    await screen.findByText("LOGIN");
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(addParkPhotos).not.toHaveBeenCalled();
  });
});

describe("AddPhotos — authenticated flow unchanged", () => {
  it("never writes a File/Blob (or anything else) to localStorage — no persistentDraft on this screen", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    expect(localStorage.length).toBe(0);
    pick(container);
    expect(localStorage.length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));
    await waitFor(() => expect(addParkPhotos).toHaveBeenCalledTimes(1));
    expect(localStorage.length).toBe(0);
  });

  it("a simple hide/show (component stays mounted) never loses the picked File", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container, makeFile("stays.jpg"));
    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(1);

    document.dispatchEvent(new Event("visibilitychange"));
    fireEvent(window, new Event("pagehide"));

    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(1);
  });

  it("ASSUMED V1 LIMITATION: a real remount (reload/eviction) loses the picked File — re-selection is required", async () => {
    sess.userId = "u1";
    const { container, unmount } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container);
    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(1);
    unmount();

    const { container: container2 } = renderPhotos();
    await screen.findByText("Square Voltaire");
    expect(container2.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(0);
  });

  it("submit success → upload then addParkPhotos, confirmation screen shown", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container, makeFile("a.jpg"));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));

    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledWith("parkPhotos", expect.any(File), "u1"));
    await waitFor(() => expect(addParkPhotos).toHaveBeenCalledWith("p1", ["https://x/photo.jpg"], { source: "user", userId: "u1" }));
    expect(await screen.findByText("Photo envoyée !")).toBeTruthy();
  });

  it("submit error → toast, stays on the form (not the confirmation screen)", async () => {
    sess.userId = "u1";
    vi.mocked(addParkPhotos).mockRejectedValueOnce(new Error("network down"));
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container);
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));

    // Server error details are never surfaced verbatim — a generic, translated
    // message is shown instead (see AddPhotos.tsx submit()'s catch).
    await waitFor(() => expect(toasts.list).toContain("Échec de l’envoi de la photo"));
    expect(screen.queryByText("Photo envoyée !")).toBeNull();
    expect(screen.getByRole("button", { name: /Envoyer/ })).toHaveProperty("disabled", false);
  });

  it("no double submission: two rapid clicks only upload once", async () => {
    sess.userId = "u1";
    let resolveUpload: (v: string) => void = () => {};
    vi.mocked(uploadPhoto).mockReset().mockReturnValue(new Promise((resolve) => (resolveUpload = resolve)) as never);
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container);
    const sendButton = screen.getByRole("button", { name: /Envoyer/ });
    fireEvent.click(sendButton);
    fireEvent.click(sendButton); // second click — button is now loading/disabled

    resolveUpload("https://x/photo.jpg");
    await waitFor(() => expect(addParkPhotos).toHaveBeenCalledTimes(1));
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
  });
});
