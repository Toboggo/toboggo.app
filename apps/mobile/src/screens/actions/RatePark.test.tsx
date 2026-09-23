import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildDraftKey, createReview, readDraft, uploadPhoto, writeDraft, type DraftPrincipal } from "@toboggo/shared";
import "../../i18n/testInit";
import RatePark from "./RatePark";

const addMediaMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    createReview: vi.fn(),
    addMedia: addMediaMock,
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

const trackEventMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/analytics", () => ({ trackEvent: trackEventMock }));

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
          <Route path="/map" element={<div>CARTE</div>} />
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
  trackEventMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("RatePark — persistent draft (LOT 3D.E)", () => {
  it("no stored draft → starts on the rating step with 0 stars", async () => {
    renderRate();
    expect(await screen.findByText("Square Voltaire")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuer" })).toHaveProperty("disabled", true);
  });

  it("?stars=4 (visit prompt) → lands on the rating step with 4 stars preselected", async () => {
    renderRate("?park=p1&stars=4");
    expect(await screen.findByText("Square Voltaire")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuer" })).toHaveProperty("disabled", false);
    await waitFor(() => expect((readDraft(key("p1", { userId: "u1" }), READ) as { stars?: number })?.stars).toBe(4), { timeout: 2000 });
  });

  it("?stars= overrides the star count of an older stored draft", async () => {
    writeDraft(key("p1", { userId: "u1" }), { step: 1, stars: 2, subRatings: { clean: 2, safety: 2, equipment: 2, comfort: 2 }, ageBand: "3-6", comment: "Déjà écrit", photo: null }, { schemaVersion: 1 });
    renderRate("?park=p1&stars=5");
    await screen.findByText("Square Voltaire");
    await waitFor(() => expect((readDraft(key("p1", { userId: "u1" }), READ) as { stars?: number; comment?: string })).toMatchObject({ stars: 5, comment: "Déjà écrit" }), { timeout: 2000 });
  });

  it("visit prompt URL (?stars=4&source=visit_prompt) → 4 stars preselected, entry_point 'visit_prompt'", async () => {
    renderRate("?park=p1&stars=4&source=visit_prompt");
    expect(await screen.findByText("Square Voltaire")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuer" })).toHaveProperty("disabled", false);
    await waitFor(() => expect((readDraft(key("p1", { userId: "u1" }), READ) as { stars?: number })?.stars).toBe(4), { timeout: 2000 });
    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(trackEventMock).toHaveBeenCalledWith("contribution_started", {
      contribution_type: "review",
      park_id: "p1",
      entry_point: "visit_prompt",
    });
  });

  it("?stars=4 without source=visit_prompt is NOT attributed to the visit prompt (stays 'unknown')", async () => {
    renderRate("?park=p1&stars=4");
    await screen.findByText("Square Voltaire");
    expect(trackEventMock).toHaveBeenCalledWith("contribution_started", expect.objectContaining({ entry_point: "unknown" }));
  });

  it.each([
    ["?park=p1&source=bogus", "unknown"],
    ["?park=p1&stars=4&source=VISIT_PROMPT", "unknown"],
    ["?source=bogus", "direct_link"],
  ])("invalid source (%s) keeps the existing behaviour → %s", async (search, expected) => {
    renderRate(search);
    await waitFor(() => expect(trackEventMock).toHaveBeenCalledTimes(1));
    expect(trackEventMock).toHaveBeenCalledWith("contribution_started", expect.objectContaining({ entry_point: expected }));
  });

  it("resume wins over source=visit_prompt (contribution_resume unchanged)", async () => {
    renderRate("?park=p1&resume=1&source=visit_prompt");
    await waitFor(() => expect(trackEventMock).toHaveBeenCalledTimes(1));
    expect(trackEventMock).toHaveBeenCalledWith("contribution_started", expect.objectContaining({ entry_point: "contribution_resume" }));
  });

  it("ignores an invalid ?stars= value", async () => {
    renderRate("?park=p1&stars=9");
    await screen.findByText("Square Voltaire");
    expect(screen.getByRole("button", { name: "Continuer" })).toHaveProperty("disabled", true);
  });

  it("tracks contribution_started exactly once on mount, entry_point 'unknown' since /rate?park= is also reachable from GlobalOverlays' visit prompt", async () => {
    renderRate();
    await screen.findByText("Square Voltaire");
    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(trackEventMock).toHaveBeenCalledWith("contribution_started", {
      contribution_type: "review",
      park_id: "p1",
      entry_point: "unknown",
    });
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

    // contribution_completed — une seule fois, après le succès confirmé.
    expect(trackEventMock).toHaveBeenCalledWith("contribution_completed", {
      contribution_type: "review",
      park_id: "p1",
      had_just_in_time_auth: false,
      has_photo: false,
    });
    expect(trackEventMock.mock.calls.filter((c) => c[0] === "contribution_completed")).toHaveLength(1);
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

    // contribution_completed ne doit JAMAIS être tracké pour une soumission
    // échouée — seul contribution_started (au montage) a pu être appelé.
    expect(trackEventMock).not.toHaveBeenCalledWith("contribution_completed", expect.anything());
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

describe("RatePark — success sheet", () => {
  it("primary CTA \"Voir le parc\" replaces the wizard entry with the park page", async () => {
    renderRate();
    await toStep2();
    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));
    await screen.findByText("Merci !");

    fireEvent.click(screen.getByRole("button", { name: "Voir le parc" }));
    await screen.findByText("FICHE PARC");
    expect(loc()).toBe("/park/p1");
  });

  it("secondary CTA \"Retour à la carte\" replaces the wizard entry with the map", async () => {
    renderRate();
    await toStep2();
    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));
    await screen.findByText("Merci !");

    fireEvent.click(screen.getByRole("button", { name: "Retour à la carte" }));
    await screen.findByText("CARTE");
    expect(loc()).toBe("/map");
  });

  it("dismissing the sheet (backdrop) also replaces the wizard entry with the map — never back into the finished wizard", async () => {
    renderRate();
    await toStep2();
    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));
    await screen.findByText("Merci !");

    const backdrop = document.body.querySelector('[class*="sheetBackdrop"]');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);
    await screen.findByText("CARTE");
    expect(loc()).toBe("/map");
  });

  it("no photo attached → the review is published, no photo-moderation mention", async () => {
    renderRate();
    await toStep2();
    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));
    const heading = await screen.findByText("Merci !");

    expect(addMediaMock).not.toHaveBeenCalled();
    expect(heading.nextElementSibling?.textContent).not.toMatch(/vérification/);
  });

  it("photo attached → the review is published, but the photo is separately called out as pending review", async () => {
    const { container } = renderRate();
    await toStep2();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "photo.jpg", { type: "image/jpeg" })] } });
    await waitFor(() =>
      expect((readDraft(key("p1", { userId: "u1" }), READ) as { photo?: string })?.photo).toBe("https://x/photo.jpg"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));
    await waitFor(() =>
      expect(addMediaMock).toHaveBeenCalledWith({ park_id: "p1", url: "https://x/photo.jpg", source: "user", user_id: "u1" }),
    );
    const heading = await screen.findByText("Merci !");
    expect(heading.nextElementSibling?.textContent).toContain("vérification par notre équipe");
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
