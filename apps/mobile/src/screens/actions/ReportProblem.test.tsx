import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildDraftKey, createReport, readDraft, writeDraft, type DraftPrincipal } from "@toboggo/shared";
import "../../i18n/testInit";
import ReportProblem from "./ReportProblem";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    createReport: vi.fn().mockResolvedValue({ id: "r1" }),
    uploadPhoto: vi.fn().mockResolvedValue("https://x/y.jpg"),
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

const PARK = { id: "p1", name: "Square Voltaire", features: {}, organization_id: null };
vi.mock("../../lib/parksQuery", () => ({
  usePark: (id?: string) => ({ data: id === "p1" ? PARK : undefined, isLoading: false, isError: false }),
}));

const key = (parkId: string, principal: DraftPrincipal) =>
  buildDraftKey({ surface: "mobile", flow: "park.report", scope: { parkId }, principal });
const READ = { schemaVersion: 1, ttlMs: 24 * 60 * 60 * 1000 };
const RESUME_KEY = "toboggo:contrib-resume";

function renderReport(search = "?park=p1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/report${search}`]}>
        <Routes>
          <Route path="/report" element={<ReportProblem />} />
          <Route path="/login" element={<div>LOGIN</div>} />
          <Route path="/park/:id" element={<div>FICHE PARC</div>} />
          <Route path="/map" element={<div>MAP</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const commentField = () => screen.getByLabelText(/Décrivez le problème/) as HTMLTextAreaElement;
const equipmentField = () => screen.getByLabelText(/Équipement concerné/) as HTMLSelectElement;

async function fillStep2(comment = "Le toboggan est fissuré") {
  fireEvent.click(await screen.findByText("Problème de sécurité"));
  fireEvent.change(await screen.findByLabelText(/Décrivez le problème/), { target: { value: comment } });
}

beforeEach(() => {
  localStorage.clear();
  sess.userId = "u1";
  toasts.list.length = 0;
  vi.mocked(createReport).mockClear().mockResolvedValue({ id: "r1" } as never);
});
afterEach(() => vi.restoreAllMocks());

describe("ReportProblem — persistent draft (LOT 3D.D)", () => {
  it("no stored draft → the form starts empty on the reason step", () => {
    renderReport();
    expect(screen.getByText("Quel est le problème ?")).toBeTruthy();
  });

  it("typing autosaves the draft (debounced) under the user key", async () => {
    renderReport();
    await fillStep2("test fissure");
    await waitFor(
      () => expect((readDraft(key("p1", { userId: "u1" }), READ) as { comment?: string })?.comment).toBe("test fissure"),
      { timeout: 2000 },
    );
  });

  it("restores a stored draft automatically (interruption / refresh)", async () => {
    writeDraft(key("p1", { userId: "u1" }), { reason: "safety", equipment: "Balançoire", comment: "déjà écrit" }, { schemaVersion: 1 });
    renderReport();
    // jumped straight to the details step, fields rehydrated
    await waitFor(() => expect(commentField().value).toBe("déjà écrit"));
    expect(equipmentField().value).toBe("Balançoire");
  });

  it("submit success → the draft is removed and does not come back on pagehide", async () => {
    renderReport();
    await fillStep2("à envoyer");
    await waitFor(() => expect(readDraft(key("p1", { userId: "u1" }), READ)).not.toBeNull(), { timeout: 2000 });

    fireEvent.click(screen.getByRole("button", { name: /Envoyer le signalement/ }));
    await waitFor(() => expect(createReport).toHaveBeenCalledTimes(1));
    await screen.findByText("Signalement envoyé !");
    expect(readDraft(key("p1", { userId: "u1" }), READ)).toBeNull();
    window.dispatchEvent(new Event("pagehide"));
    expect(readDraft(key("p1", { userId: "u1" }), READ)).toBeNull();
  });

  it("submit failure → the form and the draft are kept", async () => {
    vi.mocked(createReport).mockRejectedValue(new Error("network"));
    renderReport();
    await fillStep2("échec");
    await waitFor(() => expect(readDraft(key("p1", { userId: "u1" }), READ)).not.toBeNull(), { timeout: 2000 });

    fireEvent.click(screen.getByRole("button", { name: /Envoyer le signalement/ }));
    await waitFor(() => expect(createReport).toHaveBeenCalled());
    // Server error details are never surfaced verbatim — a generic, translated
    // message is shown instead (see doSubmit's catch).
    expect(toasts.list).toContain("Une erreur est survenue");
    expect(commentField().value).toBe("échec");
    expect((readDraft(key("p1", { userId: "u1" }), READ) as { comment?: string })?.comment).toBe("échec");
  });

  it("a draft for park p1 is not restored for park p2", async () => {
    writeDraft(key("p1", { userId: "u1" }), { reason: "safety", equipment: "Autre", comment: "p1 only" }, { schemaVersion: 1 });
    // usePark mock returns undefined for anything but p1 → render p1 then check p2 in isolation via the key
    renderReport("?park=p2");
    expect(readDraft(key("p2", { userId: "u1" }), READ)).toBeNull();
  });

  it("a draft written by user A is not restored for user B", async () => {
    writeDraft(key("p1", { userId: "A" }), { reason: "safety", equipment: "Autre", comment: "A private" }, { schemaVersion: 1 });
    sess.userId = "B";
    renderReport();
    expect(screen.getByText("Quel est le problème ?")).toBeTruthy(); // empty, step 1
    expect(readDraft(key("p1", { userId: "B" }), READ)).toBeNull();
  });
});

describe("ReportProblem — guest → OAuth → authenticated", () => {
  it("guest fills the form, hits send → resume route stashed, draft under the guest key", async () => {
    sess.userId = null;
    renderReport();
    await fillStep2("signalé en invité");
    await waitFor(
      () => expect((readDraft(key("p1", "guest"), READ) as { comment?: string })?.comment).toBe("signalé en invité"),
      { timeout: 2000 },
    );

    fireEvent.click(screen.getByRole("button", { name: /Envoyer le signalement/ }));
    await screen.findByText("LOGIN");
    expect(JSON.parse(localStorage.getItem(RESUME_KEY)!).route).toBe("/report?park=p1&resume=1");
    expect(createReport).not.toHaveBeenCalled();
    // guest draft still there for the round-trip
    expect((readDraft(key("p1", "guest"), READ) as { comment?: string })?.comment).toBe("signalé en invité");
  });

  it("back authenticated with ?resume=1 → guest draft adopted, guest key removed, report auto-sent", async () => {
    // guest left a draft; another guest draft for a different park must survive
    writeDraft(key("p1", "guest"), { reason: "safety", equipment: "Toboggan", comment: "repris après login" }, { schemaVersion: 1 });
    writeDraft(key("p9", "guest"), { reason: "safety", equipment: "Autre", comment: "autre parc" }, { schemaVersion: 1 });
    sess.userId = "u1";

    renderReport("?park=p1&resume=1");

    await waitFor(() => expect(createReport).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createReport).mock.calls[0][0]).toMatchObject({
      park_id: "p1",
      user_id: "u1",
      reason: "safety",
      equipment: "Toboggan",
      comment: "repris après login",
    });
    // guest key handed over then removed; the other guest draft is untouched
    expect(localStorage.getItem(key("p1", "guest"))).toBeNull();
    expect((readDraft(key("p9", "guest"), READ) as { comment?: string })?.comment).toBe("autre parc");
    // after a successful auto-send the user draft is cleared too
    await screen.findByText("Signalement envoyé !");
    expect(readDraft(key("p1", { userId: "u1" }), READ)).toBeNull();
  });

  it("guest + user draft collide → the newer one (by savedAt) wins", async () => {
    const base = 1_700_000_000_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(base);
    writeDraft(key("p1", { userId: "u1" }), { reason: "safety", equipment: "Autre", comment: "vieux user" }, { schemaVersion: 1 });
    now.mockReturnValue(base + 4_000);
    writeDraft(key("p1", "guest"), { reason: "cleanliness", equipment: "Toboggan", comment: "guest récent" }, { schemaVersion: 1 });
    now.mockReturnValue(base + 8_000);
    sess.userId = "u1";

    renderReport("?park=p1");
    await waitFor(() =>
      expect((readDraft(key("p1", { userId: "u1" }), READ) as { comment?: string })?.comment).toBe("guest récent"),
    );
    expect(localStorage.getItem(key("p1", "guest"))).toBeNull();
  });
});
