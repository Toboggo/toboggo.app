import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { addParkPhotos, searchParks, uploadPhoto } from "@toboggo/shared";
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
    searchParks: vi.fn().mockResolvedValue([]),
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
          <Route path="/map" element={<div>CARTE</div>} />
          <Route path="/add" element={<div>ADD NOUVEL AJOUT</div>} />
          <Route path="/contributions" element={<div>MES AJOUTS</div>} />
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

// The camera input carries `capture` — the library one deliberately doesn't,
// so it (and only it) can open the native multi-select picker.
function cameraInput(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector('input[type="file"][capture]');
}

function libraryInput(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector('input[type="file"]:not([capture])');
}

function pick(container: HTMLElement, file = makeFile()) {
  fireEvent.change(fileInput(container)!, { target: { files: [file] } });
}

function pickFromLibrary(container: HTMLElement, files: File[]) {
  fireEvent.change(libraryInput(container)!, { target: { files } });
}

// The Photos step's main button no longer uploads anything — it only moves to
// the Confirmation step (see AddPhotos.tsx). Every test that used to click
// "Envoyer" straight after picking now goes through here first.
function goToConfirmation() {
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
}

beforeEach(() => {
  localStorage.clear();
  sess.userId = null;
  sess.pendingResume = null;
  toasts.list.length = 0;
  vi.mocked(addParkPhotos).mockReset().mockResolvedValue(undefined);
  vi.mocked(searchParks).mockReset().mockResolvedValue([]);
  vi.mocked(uploadPhoto).mockReset().mockResolvedValue("https://x/photo.jpg" as never);
});

describe("AddPhotos — account required BEFORE the file picker (LOT 3D.F, point auth)", () => {
  it("guest: no <input type=\"file\"> is even rendered — nothing to pick before auth", async () => {
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    expect(fileInput(container)).toBeNull();
  });

  it("guest clicks either action → auth is triggered instead of a file dialog; nothing uploaded", async () => {
    renderPhotos();
    await screen.findByText("Square Voltaire");
    fireEvent.click(screen.getByRole("button", { name: /Prendre une photo/ }));

    await screen.findByText("LOGIN");
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(addParkPhotos).not.toHaveBeenCalled();
  });

  it("guest clicks the library action → auth is triggered too, not just the camera one", async () => {
    renderPhotos();
    await screen.findByText("Square Voltaire");
    fireEvent.click(screen.getByRole("button", { name: /Choisir des photos/ }));

    await screen.findByText("LOGIN");
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("after auth completes, the user lands back on AddPhotos and can now pick normally", async () => {
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    fireEvent.click(screen.getByRole("button", { name: /Prendre une photo/ }));
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
    goToConfirmation();
    await screen.findByRole("button", { name: /Envoyer/ });

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
    goToConfirmation();
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
    goToConfirmation();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));

    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledWith("parkPhotos", expect.any(File), "u1"));
    await waitFor(() => expect(addParkPhotos).toHaveBeenCalledWith("p1", ["https://x/photo.jpg"], { source: "user", userId: "u1" }));
    expect(await screen.findByText("Merci pour votre coup de pouce !")).toBeTruthy();
  });

  it("submit error → toast, stays on the form (not the confirmation screen)", async () => {
    sess.userId = "u1";
    vi.mocked(addParkPhotos).mockRejectedValueOnce(new Error("network down"));
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container);
    goToConfirmation();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));

    // Server error details are never surfaced verbatim — a generic, translated
    // message is shown instead (see AddPhotos.tsx submit()'s catch).
    expect((await screen.findByRole("alert")).textContent).toMatch(/Vos photos sont conservées/);
    expect(screen.queryByText("Merci pour votre coup de pouce !")).toBeNull();
    expect(screen.getByRole("button", { name: /Envoyer/ })).toHaveProperty("disabled", false);
  });

  it("success sheet — primary CTA replaces the wizard entry with the park page", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container, makeFile("a.jpg"));
    goToConfirmation();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));
    await screen.findByText("Merci pour votre coup de pouce !");

    fireEvent.click(screen.getByRole("button", { name: "Revenir au parc" }));
    await screen.findByText("FICHE PARC");
    expect(loc()).toBe("/park/p1");
  });

  it("thank-you page — \"Voir mes ajouts\" replaces the wizard entry", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container, makeFile("a.jpg"));
    goToConfirmation();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));
    await screen.findByText("Merci pour votre coup de pouce !");

    fireEvent.click(screen.getByRole("button", { name: "Voir mes ajouts" }));
    await screen.findByText("MES AJOUTS");
    expect(loc()).toBe("/contributions");
  });

  it("success sheet — pluralized body is kept: one photo vs several", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container, makeFile("a.jpg"));
    pick(container, makeFile("b.jpg"));
    goToConfirmation();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));

    await screen.findByText("Merci pour votre coup de pouce !");
    expect(screen.getByText("Vos photos ont bien été envoyées.")).toBeTruthy();
    // En attente de modération → la vérification est mentionnée (et seulement ici).
    expect(screen.getByText("Elles seront vérifiées avant publication.")).toBeTruthy();
  });

  it("no double submission: two rapid clicks only upload once", async () => {
    sess.userId = "u1";
    let resolveUpload: (v: string) => void = () => {};
    vi.mocked(uploadPhoto).mockReset().mockReturnValue(new Promise((resolve) => (resolveUpload = resolve)) as never);
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container);
    goToConfirmation();
    const sendButton = screen.getByRole("button", { name: /Envoyer/ });
    fireEvent.click(sendButton);
    fireEvent.click(sendButton); // second click — button is now loading/disabled

    resolveUpload("https://x/photo.jpg");
    await waitFor(() => expect(addParkPhotos).toHaveBeenCalledTimes(1));
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
  });
});

describe("AddPhotos — take a photo vs choose from the library", () => {
  it("both actions are offered, each behind its own input", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");

    expect(screen.getByRole("button", { name: /Prendre une photo/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Choisir des photos/ })).toBeTruthy();
    expect(cameraInput(container)).toBeTruthy();
    expect(libraryInput(container)).toBeTruthy();
  });

  it("only the camera input carries `capture` — the library one must not force the camera open", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");

    expect(cameraInput(container)?.getAttribute("capture")).toBe("environment");
    expect(libraryInput(container)?.hasAttribute("capture")).toBe(false);
    expect(libraryInput(container)?.hasAttribute("multiple")).toBe(true);
  });

  it("the camera action still accepts a single shot, unchanged", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");

    fireEvent.change(cameraInput(container)!, { target: { files: [makeFile("shot.jpg")] } });
    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(1);
  });

  it("picking several photos at once from the library previews them all and updates the counter", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");

    pickFromLibrary(container, [makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")]);

    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(3);
    expect(screen.getByText("3 / 5 photos")).toBeTruthy();
  });

  it("removing one picked photo individually keeps the others", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");

    pickFromLibrary(container, [makeFile("a.jpg"), makeFile("b.jpg")]);
    fireEvent.click(container.querySelectorAll('button[aria-label="Retirer cette photo"]')[0]);

    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(1);
    expect(screen.getByText("1 / 5 photos")).toBeTruthy();
  });

  it("caps at 5 photos total: a library selection that would exceed the limit is truncated, with a toast", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");

    pickFromLibrary(container, [
      makeFile("a.jpg"),
      makeFile("b.jpg"),
      makeFile("c.jpg"),
      makeFile("d.jpg"),
      makeFile("e.jpg"),
      makeFile("f.jpg"),
    ]);

    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(5);
    expect(screen.getByText("5 / 5 photos")).toBeTruthy();
    expect(toasts.list).toContain("Vous pouvez ajouter 5 photos maximum.");
    // Both actions disappear once the cap is reached — nothing left to add.
    expect(screen.queryByRole("button", { name: /Prendre une photo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Choisir des photos/ })).toBeNull();
  });

  it("an invalid file in a multi-select is rejected with a toast, valid ones in the same batch are still kept", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");

    const notAnImage = new File(["x"], "notes.txt", { type: "text/plain" });
    pickFromLibrary(container, [makeFile("a.jpg"), notAnImage]);

    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(1);
    expect(toasts.list).toContain("Ce fichier n’est pas une image.");
  });

  it("submitting photos picked from the library goes through the same upload/moderation pipeline as the camera path", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");

    pickFromLibrary(container, [makeFile("a.jpg"), makeFile("b.jpg")]);
    goToConfirmation();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));

    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(2));
    expect(uploadPhoto).toHaveBeenCalledWith("parkPhotos", expect.any(File), "u1");
    await waitFor(() =>
      expect(addParkPhotos).toHaveBeenCalledWith("p1", ["https://x/photo.jpg", "https://x/photo.jpg"], {
        source: "user",
        userId: "u1",
      }),
    );
    expect(await screen.findByText("Merci pour votre coup de pouce !")).toBeTruthy();
  });
});

describe("AddPhotos — HEIC/HEIF caught before upload, not after (LOT photo-library, point 3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a HEIC file this browser can't decode is rejected up front with an explicit message — never reaches upload, never shows as a preview", async () => {
    sess.userId = "u1";
    // Simulates most Chromium engines, which have no built-in HEIC decoder.
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("no heic decoder")));
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");

    const heicFile = new File(["x"], "IMG_0001.heic", { type: "image/heic" });
    fireEvent.change(libraryInput(container)!, { target: { files: [heicFile] } });

    await waitFor(() =>
      expect(toasts.list).toContain(
        "Cette photo HEIC ne peut pas être traitée sur cet appareil. Essayez une photo JPG, PNG ou WebP.",
      ),
    );
    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(0);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("a HEIC file this browser CAN decode (e.g. Safari) is accepted like any other photo", async () => {
    sess.userId = "u1";
    // Simulates Safari's native HEIC decoder — createImageBitmap succeeds.
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 10, height: 10, close: () => {} }),
    );
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");

    const heicFile = new File(["x"], "IMG_0002.heic", { type: "image/heic" });
    fireEvent.change(libraryInput(container)!, { target: { files: [heicFile] } });

    await waitFor(() =>
      expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(1),
    );
    expect(toasts.list).not.toContain(
      "Cette photo HEIC ne peut pas être traitée sur cet appareil. Essayez une photo JPG, PNG ou WebP.",
    );
  });

  it("a non-HEIC file is never subjected to the decode probe at all", async () => {
    sess.userId = "u1";
    const probe = vi.fn();
    vi.stubGlobal("createImageBitmap", probe);
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");

    pickFromLibrary(container, [makeFile("a.jpg")]);

    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(1);
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("AddPhotos — real Confirmation step (Continuer / Modifier les photos)", () => {
  it("picking a photo alone never uploads anything", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");

    pick(container);

    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(addParkPhotos).not.toHaveBeenCalled();
  });

  it("clicking \"Continuer\" moves to the Confirmation step without uploading anything", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container);

    goToConfirmation();

    // "Confirmation" also appears as a (future/current) stepper label at every
    // step — the heading is what proves the screen itself changed.
    expect(await screen.findByRole("heading", { name: "Vérifier et envoyer" })).toBeTruthy();
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(addParkPhotos).not.toHaveBeenCalled();
  });

  it("the selected photos are carried over to the Confirmation step, with a ready-to-send count", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pickFromLibrary(container, [makeFile("a.jpg"), makeFile("b.jpg")]);

    goToConfirmation();

    await screen.findByText("2 photos prêtes à être envoyées");
    // Two thumbnails, not the pick tiles/actions — Confirmation is read-only.
    expect(container.querySelectorAll('[style*="background-image"]')).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Prendre une photo/ })).toBeNull();
  });

  it("\"Modifier les photos\" returns to the Photos step without losing the selection", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pickFromLibrary(container, [makeFile("a.jpg"), makeFile("b.jpg")]);
    goToConfirmation();
    await screen.findByText("2 photos prêtes à être envoyées");

    fireEvent.click(screen.getByRole("button", { name: /Modifier — Photos/ }));

    expect(await screen.findByText("2 / 5 photos")).toBeTruthy();
    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(2);
  });

  it("the upload only fires on \"Envoyer\" in Confirmation, never before", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container);
    goToConfirmation();
    await screen.findByText("1 photo prête à être envoyée");
    expect(uploadPhoto).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));

    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(1));
    expect(addParkPhotos).toHaveBeenCalledTimes(1);
  });

  it("the back arrow from Confirmation also returns to Photos without losing the selection", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container, makeFile("a.jpg"));
    goToConfirmation();
    await screen.findByText("1 photo prête à être envoyée");

    fireEvent.click(screen.getByLabelText("Retour"));

    expect(await screen.findByText("1 / 5 photos")).toBeTruthy();
    expect(container.querySelectorAll('button[aria-label="Retirer cette photo"]')).toHaveLength(1);
  });
});

describe("AddPhotos — parcours en 3 étapes", () => {
  it("park from the park page → only 2 displayed steps; photos required (Continuer disabled) then recap", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    expect(await screen.findByText("Étape 1 sur 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuer" })).toHaveProperty("disabled", true);
    pick(container);
    expect(screen.getByRole("button", { name: "Continuer" })).toHaveProperty("disabled", false);
    goToConfirmation();
    expect(await screen.findByText("Étape 2 sur 2")).toBeTruthy();
    expect(screen.getByText("Vos photos seront vérifiées avant publication.")).toBeTruthy();
    // le parc est fixé : pas de « Modifier » sur la carte Parc
    expect(screen.queryByRole("button", { name: /Modifier — Parc/ })).toBeNull();
  });

  it("no park yet → 3 steps starting with an explicit park choice", async () => {
    sess.userId = "u1";
    vi.mocked(searchParks).mockResolvedValue([{ id: "p1", name: "Square Voltaire", formatted_address: "1 rue X", photos: [] }] as never);
    renderPhotos("");
    expect(await screen.findByText("Étape 1 sur 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuer" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Rechercher un parc"), { target: { value: "Volt" } });
    fireEvent.click(await screen.findByRole("button", { name: /Square Voltaire/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(await screen.findByText("Étape 2 sur 3")).toBeTruthy();
  });

  it("failure keeps the photos; the retry does NOT re-upload what was already uploaded; double tap sends once", async () => {
    sess.userId = "u1";
    vi.mocked(addParkPhotos).mockRejectedValueOnce(new Error("db"));
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container, makeFile("a.jpg"));
    goToConfirmation();
    const btn = await screen.findByRole("button", { name: "Envoyer les photos" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await screen.findByRole("alert");
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(addParkPhotos).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("button", { name: "Envoyer les photos" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer les photos" }));
    await screen.findByText("Merci pour votre coup de pouce !");
    expect(uploadPhoto).toHaveBeenCalledTimes(1); // déjà téléversée : réutilisée
    expect(addParkPhotos).toHaveBeenCalledTimes(2);
  });

  it("closing with picked photos asks for confirmation", async () => {
    sess.userId = "u1";
    const { container } = renderPhotos();
    await screen.findByText("Square Voltaire");
    pick(container);
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/seront perdues/)).toBeTruthy();
  });

  it("« Je ne trouve pas mon parc » : explique, puis ouvre un NOUVEL ajout (sans rien envoyer)", async () => {
    renderPhotos("");
    fireEvent.click(await screen.findByRole("button", { name: "Je ne trouve pas mon parc" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Ajoutez d’abord ce parc")).toBeTruthy();
    expect(within(dialog).getByText("Il sera vérifié avant d’apparaître dans Toboggo.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuer à chercher" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Je ne trouve pas mon parc" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ajouter un parc" }));
    expect(await screen.findByText("ADD NOUVEL AJOUT")).toBeTruthy();
  });
});
