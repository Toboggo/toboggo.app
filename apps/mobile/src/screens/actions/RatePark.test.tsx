import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildDraftKey, createReview, listMyReviews, readDraft, searchParks, uploadPhoto, writeDraft, type DraftPrincipal } from "@toboggo/shared";
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
    listMyReviews: vi.fn().mockResolvedValue([]),
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
const READ = { schemaVersion: 2, ttlMs: 24 * 60 * 60 * 1000 };
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
          <Route path="/add" element={<div>ADD NOUVEL AJOUT</div>} />
          <Route path="/park/:id" element={<div>FICHE PARC</div>} />
          <Route path="/map" element={<div>CARTE</div>} />
          <Route path="/contributions" element={<div>MES AJOUTS</div>} />
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
/** Étape « Mon expérience » : note choisie (le commentaire est sur la même étape). */
async function toExperience(stars = 4, parkId = "p1", principal?: DraftPrincipal) {
  await rate(stars);
  const p: DraftPrincipal = principal ?? (sess.userId ? { userId: sess.userId } : "guest");
  await waitFor(() => expect((readDraft(key(parkId, p), READ) as { stars?: number })?.stars).toBe(stars), { timeout: 2000 });
}
/** Étape « Vérifier mon avis ». */
async function toVerify(stars = 4, parkId = "p1", principal?: DraftPrincipal) {
  await toExperience(stars, parkId, principal);
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
  await screen.findByText("Vérifier mon avis");
}

beforeEach(() => {
  localStorage.clear();
  sess.userId = "u1";
  toasts.list.length = 0;
  vi.mocked(createReview).mockReset().mockResolvedValue({ id: "r1" } as never);
  vi.mocked(listMyReviews).mockReset().mockResolvedValue([]);
  vi.mocked(searchParks).mockReset().mockResolvedValue([]);
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
    writeDraft(key("p1", { userId: "u1" }), { step: 1, stars: 2, subRatings: { clean: 2, safety: 2, equipment: 2, comfort: 2 }, ageBand: "3-6", comment: "Déjà écrit", photo: null }, { schemaVersion: 2 });
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
    await toExperience();
    fireEvent.change(commentField(), { target: { value: "Très bien" } });
    await waitFor(
      () => expect((readDraft(key("p1", { userId: "u1" }), READ) as { comment?: string })?.comment).toBe("Très bien"),
      { timeout: 2000 },
    );
  });

  it("restores a stored draft automatically, landing on the saved step", () => {
    writeDraft(
      key("p1", { userId: "u1" }),
      { step: 1, stars: 5, subRatings: { clean: 3, safety: 3, equipment: 3, comfort: 3 }, ageBand: "6-12", comment: "Repris", photo: null },
      { schemaVersion: 2 },
    );
    renderRate();
    expect(commentField().value).toBe("Repris");
  });

  it("step 2 WITHOUT stars (inconsistent) falls back to step 1, no crash", async () => {
    writeDraft(
      key("p1", { userId: "u1" }),
      { step: 2, stars: 0, subRatings: { clean: 2, safety: 2, equipment: 2, comfort: 2 }, ageBand: "3-6", comment: "orphan", photo: null },
      { schemaVersion: 2 },
    );
    renderRate();
    expect(await screen.findByText("Comment était votre visite ?")).toBeTruthy();
    expect(screen.queryByText("Vérifier mon avis")).toBeNull();
  });

  it("flushes to storage on pagehide", async () => {
    renderRate();
    await rate(3);
    window.dispatchEvent(new Event("pagehide"));
    expect((readDraft(key("p1", { userId: "u1" }), READ) as { stars?: number })?.stars).toBe(3);
  });

  it("createReview success → the draft is cleared before navigating, no resurrection on late pagehide", async () => {
    renderRate();
    await toVerify();
    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));

    await waitFor(() => expect(createReview).toHaveBeenCalledTimes(1));
    await screen.findByText("Merci pour votre coup de pouce !");
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
    await toExperience();
    fireEvent.change(commentField(), { target: { value: "Ne part pas" } });
    await waitFor(
      () => expect((readDraft(key("p1", { userId: "u1" }), READ) as { comment?: string })?.comment).toBe("Ne part pas"),
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    await screen.findByText("Vérifier mon avis");
    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));

    await waitFor(() => expect(createReview).toHaveBeenCalled());
    // Server error details are never surfaced verbatim — a clear inline message
    // is shown instead, answers kept, button re-enabled for a retry.
    expect((await screen.findByRole("alert")).textContent).toMatch(/Vos réponses sont conservées/);
    await waitFor(() => expect(screen.getByRole("button", { name: "Publier mon avis" })).toHaveProperty("disabled", false));
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
      { schemaVersion: 2 },
    );
    renderRate("?park=p2");
    expect(readDraft(key("p2", { userId: "u1" }), READ)).toBeNull();
  });

  it("a draft written by user A is never restored for user B", () => {
    writeDraft(
      key("p1", { userId: "A" }),
      { step: 2, stars: 5, subRatings: { clean: 3, safety: 3, equipment: 3, comfort: 3 }, ageBand: "6-12", comment: "A private", photo: null },
      { schemaVersion: 2 },
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
    await toVerify();
    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));
    await screen.findByText("Merci pour votre coup de pouce !");

    fireEvent.click(screen.getByRole("button", { name: "Revenir au parc" }));
    await screen.findByText("FICHE PARC");
    expect(loc()).toBe("/park/p1");
  });

  it("secondary link \"Voir mes ajouts\" replaces the wizard entry", async () => {
    renderRate();
    await toVerify();
    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));
    await screen.findByText("Merci pour votre coup de pouce !");

    fireEvent.click(screen.getByRole("button", { name: "Voir mes ajouts" }));
    await screen.findByText("MES AJOUTS");
    expect(loc()).toBe("/contributions");
  });

  it("no photo attached → the review is published, no photo-moderation mention", async () => {
    renderRate();
    await toVerify();
    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));
    await screen.findByText("Merci pour votre coup de pouce !");

    expect(addMediaMock).not.toHaveBeenCalled();
    // Avis publié tout de suite, aucune photo : aucune mention de vérification.
    expect(screen.queryByText(/vérifié/)).toBeNull();
    expect(screen.getByText(/Votre avis est publié/)).toBeTruthy();
  });

  it("photo attached → the review is published, but the photo is separately called out as pending review", async () => {
    const { container } = renderRate();
    await toExperience();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "photo.jpg", { type: "image/jpeg" })] } });
    await waitFor(() =>
      expect((readDraft(key("p1", { userId: "u1" }), READ) as { photo?: string })?.photo).toBe("https://x/photo.jpg"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    await screen.findByText("Vérifier mon avis");

    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));
    await waitFor(() =>
      expect(addMediaMock).toHaveBeenCalledWith({ park_id: "p1", url: "https://x/photo.jpg", source: "user", user_id: "u1" }),
    );
    await screen.findByText("Merci pour votre coup de pouce !");
    expect(screen.getByText("Votre photo sera vérifiée avant d’être visible.")).toBeTruthy();
  });
});

describe("RatePark — guest → OAuth → authenticated", () => {
  it("guest rates, hits send → resume route stashed, draft under the guest key", async () => {
    sess.userId = null;
    renderRate();
    await toExperience(4, "p1", "guest");
    fireEvent.change(commentField(), { target: { value: "Invité" } });
    await waitFor(
      () => expect((readDraft(key("p1", "guest"), READ) as { comment?: string })?.comment).toBe("Invité"),
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    await screen.findByText("Vérifier mon avis");

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
      { schemaVersion: 2 },
    );
    writeDraft(
      key("p9", "guest"),
      { step: 2, stars: 2, subRatings: { clean: 1, safety: 1, equipment: 1, comfort: 1 }, ageBand: "3-6", comment: "autre parc", photo: null },
      { schemaVersion: 2 },
    );
    sess.userId = "u1";
    renderRate("?park=p1&resume=1");

    await waitFor(() => expect(createReview).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createReview).mock.calls[0][0]).toMatchObject({ park_id: "p1", stars: 5, comment: "Repris après login" });
    expect(localStorage.getItem(key("p1", "guest"))).toBeNull();
    expect((readDraft(key("p9", "guest"), READ) as { comment?: string })?.comment).toBe("autre parc");
    await screen.findByText("Merci pour votre coup de pouce !");
    expect(readDraft(key("p1", { userId: "u1" }), READ)).toBeNull();
  });
});

describe("RatePark — parcours en 3 étapes", () => {
  it("park preselected → 2 displayed steps (« Étape 1 sur 2 »), no chooser; summary lets the user edit", async () => {
    renderRate();
    await screen.findByText("Square Voltaire");
    expect(screen.getByText("Étape 1 sur 2")).toBeTruthy();
    await toVerify(3);
    expect(screen.getByText("Étape 2 sur 2")).toBeTruthy();
    expect(screen.getByText("Bien")).toBeTruthy(); // libellé explicite de la note
    fireEvent.click(screen.getByRole("button", { name: /Modifier — Avis/ }));
    await screen.findByText("Comment était votre visite ?");
    expect(screen.getByRole("button", { name: "3 étoiles" })).toBeTruthy();
  });

  it("explicit star label under the stars", async () => {
    renderRate();
    await rate(5);
    expect(screen.getByText("Excellent")).toBeTruthy();
  });

  it("criteria faces are labelled radios (≥44px targets via class) and persist", async () => {
    renderRate();
    await rate(4);
    const group = screen.getByRole("radiogroup", { name: "Propreté" });
    fireEvent.click(within(group).getByRole("radio", { name: "Bon" }));
    await waitFor(() =>
      expect((readDraft(key("p1", { userId: "u1" }), READ) as { subRatings?: { clean?: number } })?.subRatings?.clean).toBe(3),
    );
  });

  it("les 4 critères : défaut 2 (Moyen) ; Mauvais/Moyen/Bon stockent exactement 1/2/3 ; récapitulatif en mots", async () => {
    renderRate();
    await rate(4);
    for (const crit of ["Propreté", "Sécurité", "Équipements", "Confort"]) {
      const group = screen.getByRole("radiogroup", { name: crit });
      expect(within(group).getByRole("radio", { name: "Moyen" }).getAttribute("aria-checked")).toBe("true");
    }
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Propreté" })).getByRole("radio", { name: "Mauvais" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Sécurité" })).getByRole("radio", { name: "Bon" }));
    await waitFor(() => {
      const d = readDraft(key("p1", { userId: "u1" }), READ) as { subRatings?: Record<string, number> } | null;
      expect(d?.subRatings).toEqual({ clean: 1, safety: 3, equipment: 2, comfort: 2 });
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(await screen.findByText(/Propreté : Mauvais · Sécurité : Bon · Équipements : Moyen · Confort : Moyen/)).toBeTruthy();
  });

  it("deux changements successifs sur deux critères sont tous deux conservés (formulaire, brouillon, récapitulatif)", async () => {
    renderRate();
    await rate(4);
    const radio = (crit: string, name: string) =>
      within(screen.getByRole("radiogroup", { name: crit })).getByRole("radio", { name });
    // Les deux clics partent dans le même `act` : pas de rendu entre eux.
    act(() => {
      fireEvent.click(radio("Propreté", "Mauvais"));
      fireEvent.click(radio("Sécurité", "Bon"));
    });
    expect(radio("Propreté", "Mauvais").getAttribute("aria-checked")).toBe("true");
    expect(radio("Sécurité", "Bon").getAttribute("aria-checked")).toBe("true");
    expect(radio("Équipements", "Moyen").getAttribute("aria-checked")).toBe("true");
    await waitFor(() => {
      const d = readDraft(key("p1", { userId: "u1" }), READ) as { subRatings?: Record<string, number> } | null;
      expect(d?.subRatings).toEqual({ clean: 1, safety: 3, equipment: 2, comfort: 2 });
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(await screen.findByText(/Propreté : Mauvais · Sécurité : Bon · Équipements : Moyen · Confort : Moyen/)).toBeTruthy();
  });

  it("no park yet → chooser first (3 steps), explicit selection required, then the experience step", async () => {
    vi.mocked(searchParks).mockResolvedValue([{ id: "p1", name: "Square Voltaire", formatted_address: "1 rue X", photos: [] }] as never);
    renderRate("");
    expect(await screen.findByText("Étape 1 sur 3")).toBeTruthy();
    const cont = screen.getByRole("button", { name: "Continuer" });
    expect(cont).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Rechercher un parc"), { target: { value: "Volt" } });
    fireEvent.click(await screen.findByRole("button", { name: /Square Voltaire/ }));
    expect(screen.getByRole("button", { name: "Continuer" })).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    await screen.findByText("Comment était votre visite ?");
    expect(screen.getByText("Étape 2 sur 3")).toBeTruthy();
  });

  it("an existing review → the edit flow is offered instead of a duplicate", async () => {
    vi.mocked(listMyReviews).mockResolvedValue([{ id: "r9", park_id: "p1", status: "published" }] as never);
    renderRate();
    expect(await screen.findByText(/Vous avez déjà donné votre avis/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Modifier mon avis" }));
    expect(loc()).toBe("/review/r9/edit");
    expect(createReview).not.toHaveBeenCalled();
  });

  it("failure keeps answers, re-enables the button, and a retry succeeds; a double tap sends once", async () => {
    vi.mocked(createReview).mockRejectedValueOnce(new Error("network"));
    renderRate();
    await toVerify();
    const btn = screen.getByRole("button", { name: "Publier mon avis" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await screen.findByRole("alert");
    expect(createReview).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("button", { name: "Publier mon avis" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Publier mon avis" }));
    await screen.findByText("Merci pour votre coup de pouce !");
    expect(createReview).toHaveBeenCalledTimes(2);
  });

  it("a v1 draft sitting on the comment step is migrated to the experience step", async () => {
    writeDraft(
      key("p1", { userId: "u1" }),
      { step: 2, stars: 5, subRatings: { clean: 3, safety: 3, equipment: 3, comfort: 3 }, ageBand: "6-12", comment: "v1", photo: null },
      { schemaVersion: 1 },
    );
    renderRate();
    expect(commentField().value).toBe("v1");
    expect(screen.getByText("Étape 1 sur 2")).toBeTruthy();
  });

  it("« Parc introuvable ? » : le panneau explique, se ferme sans rien perdre, puis ouvre un NOUVEL ajout (sans rien envoyer)", async () => {
    renderRate("");
    fireEvent.change(await screen.findByLabelText("Rechercher un parc"), { target: { value: "Voltaire" } });
    fireEvent.click(await screen.findByRole("button", { name: /Parc introuvable/ }));
    const dialog = screen.getByRole("dialog", { name: "Votre parc n’est pas encore ici ?" });
    expect(within(dialog).getByText("Ajoutez-le pour aider les autres familles à le retrouver.")).toBeTruthy();
    expect(within(dialog).getByText("Le parc sera vérifié avant d’apparaître dans Toboggo.")).toBeTruthy();
    expect(within(dialog).getByText("Une fois publié, vous pourrez y ajouter un avis, des photos ou un signalement.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuer à chercher" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByLabelText("Rechercher un parc") as HTMLInputElement).value).toBe("Voltaire");
    fireEvent.click(screen.getByRole("button", { name: /Parc introuvable/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ajouter ce parc" }));
    expect(await screen.findByText("ADD NOUVEL AJOUT")).toBeTruthy();
  });
});
