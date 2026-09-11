import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildDraftKey, createReview, readDraft, uploadPhoto, writeDraft, type DraftPrincipal } from "@toboggo/shared";
import "../../i18n/testInit";
import RatePark from "./RatePark";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    createReview: vi.fn(),
    addMedia: vi.fn().mockResolvedValue(undefined),
    uploadPhoto: vi.fn().mockResolvedValue("https://x/photo.jpg"),
    searchParks: vi.fn().mockResolvedValue([]),
  };
});

const PARK = { id: "p1", name: "Square Voltaire" };
vi.mock("../../lib/parksQuery", () => ({
  usePark: (id?: string) => ({ data: id === "p1" ? PARK : id === "p2" ? { id: "p2", name: "Parc Deux" } : undefined }),
}));

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

const key = (parkId: string, principal: DraftPrincipal) =>
  buildDraftKey({ surface: "mobile", flow: "park.rate", scope: { parkId }, principal });
const READ = { schemaVersion: 1, ttlMs: 24 * 60 * 60 * 1000 };
const RESUME_KEY = "toboggo:contrib-resume";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderRate(search = "?park=p1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/rate${search}`]}>
        <LocationProbe />
        <Routes>
          <Route path="/rate" element={<RatePark />} />
          <Route path="/login" element={<div>LOGIN</div>} />
          <Route path="/park/:id" element={<div>FICHE PARC</div>} />
          <Route path="/action-intro/add" element={<div>ADD</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const loc = () => screen.getByTestId("loc").textContent;
const commentField = () => screen.getByLabelText(/Votre commentaire/) as HTMLTextAreaElement;

async function rate(stars = 4) {
  fireEvent.click(await screen.findByRole("button", { name: `${stars} étoiles` }));
}
async function toStep2(stars = 4, parkId = "p1", principal?: DraftPrincipal) {
  await rate(stars);
  const p: DraftPrincipal = principal ?? (sess.userId ? { userId: sess.userId } : "guest");
  await waitFor(() => expect((readDraft(key(parkId, p), READ) as { stars?: number })?.stars).toBe(stars), { timeout: 2000 });
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
}

beforeEach(() => {
  localStorage.clear();
  sess.userId = "u1";
  toasts.list.length = 0;
  vi.mocked(createReview).mockReset().mockResolvedValue({ id: "r1" } as never);
  vi.mocked(uploadPhoto).mockReset().mockResolvedValue("https://x/photo.jpg" as never);
});
afterEach(() => vi.restoreAllMocks());

describe("RatePark — persistent draft (LOT 3D.E)", () => {
  it("no stored draft → starts on the rating step with 0 stars", async () => {
    renderRate();
    expect(await screen.findByText("Square Voltaire")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuer" })).toHaveProperty("disabled", true);
  });

  it("rating + comment autosave (debounced) under the user key", async () => {
    renderRate();
    await toStep2();
    fireEvent.change(commentField(), { target: { value: "Très bien" } });
    await waitFor(
      () => expect((readDraft(key("p1", { userId: "u1" }), READ) as { comment?: string })?.comment).toBe("Très bien"),
      { timeout: 2000 },
    );
  });

  it("restores a stored draft automatically, landing on the saved step", () => {
    writeDraft(
      key("p1", { userId: "u1" }),
      { step: 2, stars: 5, subRatings: { clean: 3, safety: 3, equipment: 3, comfort: 3 }, ageBand: "6-12", comment: "Repris", photo: null },
      { schemaVersion: 1 },
    );
    renderRate();
    expect(commentField().value).toBe("Repris");
  });

  it("step 2 WITHOUT stars (inconsistent) falls back to step 1, no crash", async () => {
    writeDraft(
      key("p1", { userId: "u1" }),
      { step: 2, stars: 0, subRatings: { clean: 2, safety: 2, equipment: 2, comfort: 2 }, ageBand: "3-6", comment: "orphan", photo: null },
      { schemaVersion: 1 },
    );
    renderRate();
    expect(await screen.findByText("Comment était votre visite ?")).toBeTruthy();
    expect(screen.queryByLabelText(/Votre commentaire/)).toBeNull();
  });

  it("flushes to storage on pagehide", async () => {
    renderRate();
    await rate(3);
    window.dispatchEvent(new Event("pagehide"));
    expect((readDraft(key("p1", { userId: "u1" }), READ) as { stars?: number })?.stars).toBe(3);
  });

  it("createReview success → the draft is cleared before navigating, no resurrection on late pagehide", async () => {
    renderRate();
    await toStep2();
    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));

    await waitFor(() => expect(createReview).toHaveBeenCalledTimes(1));
    await screen.findByText("Merci !");
    expect(readDraft(key("p1", { userId: "u1" }), READ)).toBeNull();
    window.dispatchEvent(new Event("pagehide"));
    expect(readDraft(key("p1", { userId: "u1" }), READ)).toBeNull();
  });

  it("createReview failure → stays on the form, draft conserved", async () => {
    vi.mocked(createReview).mockRejectedValue(new Error("network"));
    renderRate();
    await toStep2();
    fireEvent.change(commentField(), { target: { value: "Ne part pas" } });
    await waitFor(
      () => expect((readDraft(key("p1", { userId: "u1" }), READ) as { comment?: string })?.comment).toBe("Ne part pas"),
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));

    await waitFor(() => expect(createReview).toHaveBeenCalled());
    // Server error details are never surfaced verbatim — a generic, translated
    // message is shown instead (see doSubmit's catch).
    expect(toasts.list).toContain("Une erreur est survenue");
    expect(loc()).toBe("/rate");
    expect((readDraft(key("p1", { userId: "u1" }), READ) as { comment?: string })?.comment).toBe("Ne part pas");
  });

  it("a draft for park p1 is never restored for park p2", () => {
    writeDraft(
      key("p1", { userId: "u1" }),
      { step: 2, stars: 5, subRatings: { clean: 3, safety: 3, equipment: 3, comfort: 3 }, ageBand: "6-12", comment: "p1 only", photo: null },
      { schemaVersion: 1 },
    );
    renderRate("?park=p2");
    expect(readDraft(key("p2", { userId: "u1" }), READ)).toBeNull();
  });

  it("a draft written by user A is never restored for user B", () => {
    writeDraft(
      key("p1", { userId: "A" }),
      { step: 2, stars: 5, subRatings: { clean: 3, safety: 3, equipment: 3, comfort: 3 }, ageBand: "6-12", comment: "A private", photo: null },
      { schemaVersion: 1 },
    );
    sess.userId = "B";
    renderRate();
    expect(screen.getByRole("button", { name: "Continuer" })).toHaveProperty("disabled", true);
    expect(readDraft(key("p1", { userId: "B" }), READ)).toBeNull();
  });
});

describe("RatePark — guest → OAuth → authenticated", () => {
  it("guest rates, hits send → resume route stashed, draft under the guest key", async () => {
    sess.userId = null;
    renderRate();
    await toStep2(4, "p1", "guest");
    fireEvent.change(commentField(), { target: { value: "Invité" } });
    await waitFor(
      () => expect((readDraft(key("p1", "guest"), READ) as { comment?: string })?.comment).toBe("Invité"),
      { timeout: 2000 },
    );

    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));
    await screen.findByText("LOGIN");
    expect(JSON.parse(localStorage.getItem(RESUME_KEY)!).route).toBe("/rate?park=p1&resume=1");
    expect(createReview).not.toHaveBeenCalled();
    expect((readDraft(key("p1", "guest"), READ) as { comment?: string })?.comment).toBe("Invité");
  });

  it("back authenticated with ?resume=1 → guest draft adopted, guest key removed, review auto-sent", async () => {
    writeDraft(
      key("p1", "guest"),
      { step: 2, stars: 5, subRatings: { clean: 3, safety: 3, equipment: 3, comfort: 3 }, ageBand: "6-12", comment: "Repris après login", photo: null },
      { schemaVersion: 1 },
    );
    writeDraft(
      key("p9", "guest"),
      { step: 2, stars: 2, subRatings: { clean: 1, safety: 1, equipment: 1, comfort: 1 }, ageBand: "3-6", comment: "autre parc", photo: null },
      { schemaVersion: 1 },
    );
    sess.userId = "u1";
    renderRate("?park=p1&resume=1");

    await waitFor(() => expect(createReview).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createReview).mock.calls[0][0]).toMatchObject({ park_id: "p1", stars: 5, comment: "Repris après login" });
    expect(localStorage.getItem(key("p1", "guest"))).toBeNull();
    expect((readDraft(key("p9", "guest"), READ) as { comment?: string })?.comment).toBe("autre parc");
    await screen.findByText("Merci !");
    expect(readDraft(key("p1", { userId: "u1" }), READ)).toBeNull();
  });
});
