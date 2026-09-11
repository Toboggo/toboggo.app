import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildDraftKey, readDraft, submitParkEdit, writeDraft, type DraftPrincipal } from "@toboggo/shared";
import EditInfo from "./EditInfo";

vi.mock("maplibre-gl", () => ({
  __esModule: true,
  default: { Map: class {}, Marker: class {}, NavigationControl: class {} },
}));

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    submitParkEdit: vi.fn().mockResolvedValue(undefined),
    listFeatures: vi.fn().mockResolvedValue([]),
  };
});

const sess = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("../../lib/session", () => ({
  useSession: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const s = { userId: sess.userId, profile: { name: "Alice" } };
      return sel ? sel(s) : s;
    },
    { getState: () => ({ userId: sess.userId }) },
  ),
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

const PARK = {
  id: "p1",
  name: "Square Voltaire",
  description: "Petit square",
  latitude: 45.7,
  longitude: 4.8,
  age_min: null,
  age_max: null,
  features: {},
  formatted_address: null,
  organization_id: null,
};
vi.mock("../../lib/parksQuery", () => ({
  usePark: (id?: string) => ({ data: id === "p1" ? PARK : undefined, isLoading: false, isError: false }),
}));

const key = (parkId: string, principal: DraftPrincipal) =>
  buildDraftKey({ surface: "mobile", flow: "park.edit-info", scope: { parkId }, principal });
const READ = { schemaVersion: 1, ttlMs: 24 * 60 * 60 * 1000 };
const RESUME_KEY = "toboggo:contrib-resume";

function renderEdit(search = "?park=p1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/contribute/edit${search}`]}>
        <Routes>
          <Route path="/contribute/edit" element={<EditInfo />} />
          <Route path="/login" element={<div>LOGIN</div>} />
          <Route path="/park/:id" element={<div>FICHE PARC</div>} />
          <Route path="/map" element={<div>MAP</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** step 0 → pick "Informations générales" → change the name so `items` is non-empty */
async function proposeNewName(name: string) {
  fireEvent.click(await screen.findByText("Informations générales"));
  fireEvent.change(await screen.findByLabelText("Nom du parc"), { target: { value: name } });
}

beforeEach(() => {
  localStorage.clear();
  sess.userId = "u1";
  toasts.list.length = 0;
  vi.mocked(submitParkEdit).mockClear().mockResolvedValue(undefined as never);
});
afterEach(() => vi.restoreAllMocks());

describe("EditInfo — persistent draft (LOT 3D.D)", () => {
  it("no stored draft → starts on the 'Type' step", async () => {
    renderEdit();
    expect(await screen.findByText("Que souhaitez-vous corriger ?")).toBeTruthy();
  });

  it("typing autosaves the draft (debounced) under the user key", async () => {
    renderEdit();
    await proposeNewName("Square Hugo");
    await waitFor(
      () => expect((readDraft(key("p1", { userId: "u1" }), READ) as { name?: string })?.name).toBe("Square Hugo"),
      { timeout: 2000 },
    );
  });

  it("restores a stored draft automatically (interruption / refresh)", async () => {
    writeDraft(
      key("p1", { userId: "u1" }),
      { step: 1, target: "general", seeded: true, name: "Square Repris", description: "Petit square", ageLow: 0, ageHigh: 12, agesTouched: false, featureStatus: {}, lat: 45.7, lng: 4.8, freeText: "", note: "" },
      { schemaVersion: 1 },
    );
    renderEdit();
    await waitFor(() => expect((screen.getByLabelText("Nom du parc") as HTMLInputElement).value).toBe("Square Repris"));
    expect(screen.getByText("Brouillon repris.")).toBeTruthy();
  });

  it("submit success → the draft is cleared and cannot come back on pagehide", async () => {
    renderEdit();
    await proposeNewName("Square Envoyé");
    await waitFor(() => expect(readDraft(key("p1", { userId: "u1" }), READ)).not.toBeNull(), { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));
    fireEvent.click(await screen.findByRole("button", { name: "Proposer la modification" }));

    await waitFor(() => expect(submitParkEdit).toHaveBeenCalledTimes(1));
    await screen.findByText("Merci !");
    expect(readDraft(key("p1", { userId: "u1" }), READ)).toBeNull();
    window.dispatchEvent(new Event("pagehide"));
    expect(readDraft(key("p1", { userId: "u1" }), READ)).toBeNull();
  });

  it("submit failure → the form and the draft are kept", async () => {
    vi.mocked(submitParkEdit).mockRejectedValue(new Error("RLS"));
    renderEdit();
    await proposeNewName("Square Échec");
    await waitFor(() => expect(readDraft(key("p1", { userId: "u1" }), READ)).not.toBeNull(), { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));
    fireEvent.click(await screen.findByRole("button", { name: "Proposer la modification" }));

    await waitFor(() => expect(submitParkEdit).toHaveBeenCalled());
    expect(toasts.list).toContain("RLS");
    expect((readDraft(key("p1", { userId: "u1" }), READ) as { name?: string })?.name).toBe("Square Échec");
  });

  it("the X (close) is the explicit discard — it clears the draft", async () => {
    renderEdit();
    await proposeNewName("Square Abandonné");
    await waitFor(() => expect(readDraft(key("p1", { userId: "u1" }), READ)).not.toBeNull(), { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    await screen.findByText("FICHE PARC");
    expect(readDraft(key("p1", { userId: "u1" }), READ)).toBeNull();
  });

  it("a draft is isolated by park and by user", async () => {
    writeDraft(key("p1", { userId: "A" }), { step: 1, target: "general", seeded: true, name: "A only", description: "", ageLow: 0, ageHigh: 12, agesTouched: false, featureStatus: {}, lat: null, lng: null, freeText: "", note: "" }, { schemaVersion: 1 });
    sess.userId = "B";
    renderEdit();
    expect(await screen.findByText("Que souhaitez-vous corriger ?")).toBeTruthy();
    expect(readDraft(key("p1", { userId: "B" }), READ)).toBeNull();
    expect(readDraft(key("p2", { userId: "A" }), READ)).toBeNull();
  });
});

describe("EditInfo — guest → OAuth → authenticated", () => {
  it("guest send → resume route stashed, draft under the guest key", async () => {
    sess.userId = null;
    renderEdit();
    await proposeNewName("Square Invité");
    await waitFor(
      () => expect((readDraft(key("p1", "guest"), READ) as { name?: string })?.name).toBe("Square Invité"),
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));
    fireEvent.click(await screen.findByRole("button", { name: "Proposer la modification" }));

    await screen.findByText("LOGIN");
    expect(JSON.parse(localStorage.getItem(RESUME_KEY)!).route).toBe("/contribute/edit?park=p1&resume=1");
    expect(submitParkEdit).not.toHaveBeenCalled();
    expect((readDraft(key("p1", "guest"), READ) as { name?: string })?.name).toBe("Square Invité");
  });

  it("back authenticated with ?resume=1 → guest draft adopted, guest key removed, edit auto-sent; other guest drafts untouched", async () => {
    const full = { step: 2, target: "general" as const, seeded: true, name: "Square Après Login", description: "Petit square", ageLow: 0, ageHigh: 12, agesTouched: false, featureStatus: {}, lat: 45.7, lng: 4.8, freeText: "", note: "" };
    writeDraft(key("p1", "guest"), full, { schemaVersion: 1 });
    writeDraft(key("p9", "guest"), { ...full, name: "autre parc" }, { schemaVersion: 1 });
    sess.userId = "u1";

    renderEdit("?park=p1&resume=1");

    await waitFor(() => expect(submitParkEdit).toHaveBeenCalledTimes(1));
    const changes = vi.mocked(submitParkEdit).mock.calls[0][0].changes as { items: { field: string; proposed: unknown }[] };
    expect(changes.items).toContainEqual(expect.objectContaining({ field: "name", proposed: "Square Après Login" }));
    expect(localStorage.getItem(key("p1", "guest"))).toBeNull();
    expect((readDraft(key("p9", "guest"), READ) as { name?: string })?.name).toBe("autre parc");
    await screen.findByText("Merci !");
    expect(readDraft(key("p1", { userId: "u1" }), READ)).toBeNull();
  });
});
