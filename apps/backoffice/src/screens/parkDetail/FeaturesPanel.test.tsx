import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@toboggo/design-system";
import { buildDraftKey, listFeatures, listParkFeatures, setParkFeature, removeParkFeature, readDraft, writeDraft } from "@toboggo/shared";
import { FeaturesPanel } from "./FeaturesPanel";

vi.mock("@toboggo/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@toboggo/shared")>();
  return {
    ...actual,
    listFeatures: vi.fn(),
    listParkFeatures: vi.fn(),
    setParkFeature: vi.fn().mockResolvedValue(undefined),
    removeParkFeature: vi.fn().mockResolvedValue(undefined),
    logActivity: vi.fn().mockResolvedValue(undefined),
    FEATURE_LABEL: {
      slide: "Toboggan",
      swing: "Balançoire",
      toilets: "Toilettes",
      wheelchair_access: "Accès fauteuil roulant",
      fence_status: "Clôture",
      surface_type: "Revêtement de sol",
    },
  };
});
const orgScopeState = vi.hoisted(() => ({ communeId: "org-1" as string | null }));
vi.mock("../../lib/orgScope", () => ({ useOrgScope: () => ({ isAdmin: false, communeId: orgScopeState.communeId }) }));
const orgSessionState = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("../../lib/orgSession", () => ({
  useOrgSession: (sel?: (s: unknown) => unknown) => {
    const state = { userName: "Testeur", userId: orgSessionState.userId };
    return sel ? sel(state) : state;
  },
}));

const CATALOGUE = [
  { id: "f-slide", code: "slide", category: "play", value_set: null, sort_order: 1, is_active: true, label_key: "", icon_key: null, created_at: "" },
  { id: "f-swing", code: "swing", category: "play", value_set: null, sort_order: 2, is_active: true, label_key: "", icon_key: null, created_at: "" },
  { id: "f-toilets", code: "toilets", category: "service", value_set: null, sort_order: 1, is_active: true, label_key: "", icon_key: null, created_at: "" },
  { id: "f-wheel", code: "wheelchair_access", category: "accessibility", value_set: null, sort_order: 1, is_active: true, label_key: "", icon_key: null, created_at: "" },
  {
    id: "f-fence",
    code: "fence_status",
    category: "environment",
    value_set: ["fully_fenced", "partially_fenced", "not_fenced", "unknown"],
    sort_order: 1,
    is_active: true,
    label_key: "",
    icon_key: null,
    created_at: "",
  },
  { id: "f-guard", code: "guard_rail", category: "safety", value_set: null, sort_order: 1, is_active: true, label_key: "", icon_key: null, created_at: "" },
];

function pf(feature_id: string, status: string, value: string | null = null, updated_at = "") {
  return { park_id: "p1", feature_id, status, value, quantity: null, note: null, source_id: null, verified_at: null, updated_at };
}

const park = { id: "p1", name: "Parc Test" } as never;

function renderPanel(canEdit = true, thePark: { id: string; name: string } = park) {
  const onDirtyChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <FeaturesPanel park={thePark as never} canEdit={canEdit} onDirtyChange={onDirtyChange} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, onDirtyChange };
}

describe("FeaturesPanel (Lot 3C.2)", () => {
  beforeEach(() => {
    localStorage.clear();
    orgScopeState.communeId = "org-1";
    orgSessionState.userId = "u1";
    vi.mocked(listFeatures).mockReset().mockResolvedValue(CATALOGUE as never);
    vi.mocked(listParkFeatures).mockReset().mockResolvedValue([]);
    vi.mocked(setParkFeature).mockReset().mockResolvedValue(undefined);
    vi.mocked(removeParkFeature).mockReset().mockResolvedValue(undefined);
  });

  it("shows a useful empty state with a 'Compléter' action when nothing is recorded", async () => {
    renderPanel();
    expect(await screen.findByText("Aucune caractéristique renseignée")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compléter" })).toBeTruthy();
  });

  it("hides 'Compléter' without edit permission", async () => {
    renderPanel(false);
    await screen.findByText("Aucune caractéristique renseignée");
    expect(screen.queryByRole("button", { name: "Compléter" })).toBeNull();
  });

  it("shows a factual counter over the catalogue size (safety excluded → 5)", async () => {
    vi.mocked(listParkFeatures).mockResolvedValue([pf("f-slide", "available"), pf("f-toilets", "unavailable")] as never);
    renderPanel();
    expect(await screen.findByText("2 caractéristiques renseignées sur 5")).toBeTruthy();
  });

  it("read mode: available → positive, unavailable → sober negative, unknown/missing → not shown as 'Non'", async () => {
    vi.mocked(listParkFeatures).mockResolvedValue([
      pf("f-slide", "available"),
      pf("f-toilets", "unavailable"),
      pf("f-swing", "unknown"),
    ] as never);
    renderPanel();
    expect(await screen.findByText("Toboggan")).toBeTruthy();
    expect(screen.getByText("Toilettes — absent")).toBeTruthy();
    // swing has an explicit 'unknown' row → treated as not-renseigné, never rendered as "Non"
    expect(screen.queryByText(/Balançoire/)).toBeNull();
  });

  it("does not render the Safety category (0 active features)", async () => {
    vi.mocked(listParkFeatures).mockResolvedValue([pf("f-slide", "available")] as never);
    renderPanel();
    await screen.findByText("Toboggan");
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.getByText("Jeux")).toBeTruthy();
    expect(screen.getByText("Services")).toBeTruthy();
    expect(screen.getByText("Accessibilité")).toBeTruthy();
    expect(screen.getByText("Environnement / Aménagement")).toBeTruthy();
    expect(screen.queryByText("Sécurité")).toBeNull();
    expect(screen.queryByText(/guard_rail|guard rail/i)).toBeNull();
  });

  it("edit mode: each boolean feature is a 3-state radiogroup with nothing pre-answered when unknown", async () => {
    renderPanel();
    await screen.findByText("Aucune caractéristique renseignée");
    fireEvent.click(screen.getByRole("button", { name: "Compléter" }));

    const groups = await screen.findAllByRole("radiogroup");
    expect(groups.length).toBe(4); // slide, swing, toilets, wheelchair_access (fence = <select>)
    const slideGroup = screen.getByRole("radiogroup", { name: "Toboggan" });
    const radios = slideGroup.querySelectorAll('[role="radio"]');
    expect([...radios].map((r) => r.textContent)).toEqual(["Oui", "Non", "Non renseigné"]);
    // unknown → "Non renseigné" is the checked one, NOT "Oui"/"Non"
    expect(slideGroup.querySelector('[aria-checked="true"]')?.textContent).toBe("Non renseigné");
  });

  it("environment value_set: human labels only, plus 'Non renseigné', never a raw code or 'unknown'", async () => {
    renderPanel();
    await screen.findByText("Aucune caractéristique renseignée");
    fireEvent.click(screen.getByRole("button", { name: "Compléter" }));
    const select = (await screen.findByLabelText("Clôture")) as HTMLSelectElement;
    const opts = [...select.options].map((o) => o.textContent);
    expect(opts).toEqual(["Non renseigné", "Entièrement clôturé", "Partiellement clôturé", "Non clôturé"]);
    expect(opts.join(" ")).not.toMatch(/fully_fenced|not_fenced|unknown/);
  });

  it("dirty-state: a change flags dirty and the edit bar counts it; Annuler reverts", async () => {
    const { onDirtyChange } = renderPanel();
    await screen.findByText("Aucune caractéristique renseignée");
    fireEvent.click(screen.getByRole("button", { name: "Compléter" }));

    const slideGroup = await screen.findByRole("radiogroup", { name: "Toboggan" });
    fireEvent.click(slideGroup.querySelector('[role="radio"]')!); // "Oui"
    expect(await screen.findByText("1 modification")).toBeTruthy();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  it("save writes ONLY the changed features (setParkFeature once, not 5 times)", async () => {
    renderPanel();
    await screen.findByText("Aucune caractéristique renseignée");
    fireEvent.click(screen.getByRole("button", { name: "Compléter" }));
    const swingGroup = await screen.findByRole("radiogroup", { name: "Balançoire" });
    fireEvent.click(swingGroup.querySelectorAll('[role="radio"]')[1]!); // "Non"
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(setParkFeature).toHaveBeenCalledTimes(1));
    expect(setParkFeature).toHaveBeenCalledWith("p1", "f-swing", "unavailable");
    expect(removeParkFeature).not.toHaveBeenCalled();
  });

  it("setting a recorded feature back to 'Non renseigné' calls removeParkFeature", async () => {
    vi.mocked(listParkFeatures).mockResolvedValue([pf("f-slide", "available")] as never);
    renderPanel();
    await screen.findByText("Toboggan");
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    const slideGroup = await screen.findByRole("radiogroup", { name: "Toboggan" });
    fireEvent.click(slideGroup.querySelectorAll('[role="radio"]')[2]!); // "Non renseigné"
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(removeParkFeature).toHaveBeenCalledWith("p1", "f-slide"));
    expect(setParkFeature).not.toHaveBeenCalled();
  });

  it("partial save failure: surfaces which failed and stays in edit mode", async () => {
    vi.mocked(setParkFeature).mockRejectedValueOnce(new Error("RLS"));
    renderPanel();
    await screen.findByText("Aucune caractéristique renseignée");
    fireEvent.click(screen.getByRole("button", { name: "Compléter" }));
    const slideGroup = await screen.findByRole("radiogroup", { name: "Toboggan" });
    fireEvent.click(slideGroup.querySelector('[role="radio"]')!); // "Oui" → will fail
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText(/Échec .*: Toboggan/)).toBeTruthy();
    // still editing — the edit bar is present
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeTruthy();
  });

  it("edit mode: every category is collapsed by default; opening several is allowed (non-exclusive)", async () => {
    renderPanel();
    await screen.findByText("Aucune caractéristique renseignée");
    fireEvent.click(screen.getByRole("button", { name: "Compléter" }));
    const groupEls = document.querySelectorAll("details");
    expect(groupEls.length).toBe(4);
    // all 4 headers are immediately visible, none open
    ["Jeux", "Services", "Accessibilité", "Environnement / Aménagement"].forEach((label) =>
      expect(screen.getAllByText(label).length).toBeGreaterThan(0),
    );
    [...groupEls].forEach((el) => expect((el as HTMLDetailsElement).open).toBe(false));

    // open two — the second does not close the first
    fireEvent.click(screen.getAllByText("Jeux")[0]);
    await waitFor(() => expect((groupEls[0] as HTMLDetailsElement).open).toBe(true));
    fireEvent.click(screen.getAllByText("Services")[0]);
    await waitFor(() => expect((groupEls[1] as HTMLDetailsElement).open).toBe(true));
    expect((groupEls[0] as HTMLDetailsElement).open).toBe(true);
  });

  it("edit-mode category counters: exactly 1 → singular, everything else → plural", async () => {
    vi.mocked(listParkFeatures).mockResolvedValue([pf("f-slide", "available")] as never);
    renderPanel();
    await screen.findByText("Toboggan");
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.getByText("1 / 2 renseignée")).toBeTruthy(); // Jeux — exactly 1 → singular
    // Services / Accessibilité / Environnement: 0 answered → plural
    expect(screen.getAllByText("0 / 1 renseignées")).toHaveLength(3);
  });

  it("surface_type: 'mixed' → « Mixte », no raw code, plus a discreet single-value hint", async () => {
    vi.mocked(listFeatures).mockResolvedValue([
      ...CATALOGUE,
      {
        id: "f-surface",
        code: "surface_type",
        category: "environment",
        value_set: ["rubber", "sand", "grass", "wood_chips", "gravel", "concrete", "mixed", "unknown"],
        sort_order: 2,
        is_active: true,
        label_key: "",
        icon_key: null,
        created_at: "",
      },
    ] as never);
    renderPanel();
    await screen.findByText("Aucune caractéristique renseignée");
    fireEvent.click(screen.getByRole("button", { name: "Compléter" }));

    const select = (await screen.findByLabelText(/Revêtement de sol/)) as HTMLSelectElement;
    const opts = [...select.options].map((o) => o.textContent);
    expect(opts).toContain("Mixte");
    expect(opts).not.toContain("Revêtement mixte");
    expect(opts.join(" ")).not.toMatch(/mixed|wood_chips|unknown/);
    expect(screen.getByText("Choisissez « Mixte » si plusieurs revêtements sont présents.")).toBeTruthy();
  });

  it("shows a sober help line at the top of edit mode", async () => {
    renderPanel();
    await screen.findByText("Aucune caractéristique renseignée");
    fireEvent.click(screen.getByRole("button", { name: "Compléter" }));
    expect(await screen.findByText(/Laissez « Non renseigné » en cas de doute/)).toBeTruthy();
  });

  it("temporarily_unavailable: represented as its own explicit state in edit mode, never as 'Non'", async () => {
    vi.mocked(listParkFeatures).mockResolvedValue([pf("f-slide", "temporarily_unavailable")] as never);
    renderPanel();
    expect(await screen.findByText("Toboggan — Temporairement indisponible")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    const slideGroup = await screen.findByRole("radiogroup", { name: "Toboggan" });
    expect([...slideGroup.querySelectorAll('[role="radio"]')].map((r) => r.textContent)).toEqual([
      "Oui",
      "Non",
      "Temp. indisponible",
      "Non renseigné",
    ]);
    expect(slideGroup.querySelector('[aria-checked="true"]')?.textContent).toBe("Temp. indisponible");
    // a normal feature keeps just 3 options — no generalised 4th button
    expect(screen.getByRole("radiogroup", { name: "Balançoire" }).querySelectorAll('[role="radio"]')).toHaveLength(3);
  });

  it("NON-REGRESSION: entering edit + saving another feature never converts temporarily_unavailable to unavailable", async () => {
    vi.mocked(listParkFeatures).mockResolvedValue([pf("f-slide", "temporarily_unavailable")] as never);
    renderPanel();
    await screen.findByText("Toboggan — Temporairement indisponible");
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));

    const swingGroup = await screen.findByRole("radiogroup", { name: "Balançoire" });
    fireEvent.click(swingGroup.querySelectorAll('[role="radio"]')[0]!); // change a DIFFERENT feature → "Oui"
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(setParkFeature).toHaveBeenCalledWith("p1", "f-swing", "available"));
    // f-slide is never written in any form, and no row is ever written as temporarily_unavailable
    expect(vi.mocked(setParkFeature).mock.calls.some((c) => c[1] === "f-slide")).toBe(false);
    expect(vi.mocked(setParkFeature).mock.calls.some((c) => c[2] === "temporarily_unavailable")).toBe(false);
    expect(vi.mocked(removeParkFeature).mock.calls.some((c) => c[1] === "f-slide")).toBe(false);
  });

  it("choosing 'Non' on a temporarily_unavailable row is an explicit change that IS written", async () => {
    vi.mocked(listParkFeatures).mockResolvedValue([pf("f-slide", "temporarily_unavailable")] as never);
    renderPanel();
    await screen.findByText("Toboggan — Temporairement indisponible");
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    const slideGroup = await screen.findByRole("radiogroup", { name: "Toboggan" });
    fireEvent.click(slideGroup.querySelectorAll('[role="radio"]')[1]!); // "Non" — explicit user choice
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(setParkFeature).toHaveBeenCalledWith("p1", "f-slide", "unavailable"));
  });
});

// ── Persistent draft (LOT 3D.F) ───────────────────────────────────────────
const draftKey = (parkId: string, organizationId: string | null, userId: string) =>
  buildDraftKey({
    surface: "bo",
    flow: "park.edit.features",
    scope: { parkId, organizationId: organizationId ?? "admin" },
    principal: { userId },
  });
const READ = { schemaVersion: 1, ttlMs: 72 * 60 * 60 * 1000 };
function fp(pfs: { updated_at: string }[]): string {
  if (pfs.length === 0) return "0:";
  let max = pfs[0].updated_at;
  for (const p of pfs) if (p.updated_at > max) max = p.updated_at;
  return `${pfs.length}:${max}`;
}

describe("FeaturesPanel — persistent draft (LOT 3D.F)", () => {
  beforeEach(() => {
    localStorage.clear();
    orgScopeState.communeId = "org-1";
    orgSessionState.userId = "u1";
    vi.mocked(listFeatures).mockReset().mockResolvedValue(CATALOGUE as never);
    vi.mocked(listParkFeatures).mockReset().mockResolvedValue([]);
    vi.mocked(setParkFeature).mockReset().mockResolvedValue(undefined);
    vi.mocked(removeParkFeature).mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  async function enterEdit() {
    await screen.findByText("Aucune caractéristique renseignée");
    fireEvent.click(screen.getByRole("button", { name: "Compléter" }));
    return screen.findByRole("radiogroup", { name: "Toboggan" });
  }

  it("no stored draft → edit mode starts from plain server data, no restore toast", async () => {
    renderPanel();
    await enterEdit();
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
  });

  it("a modification autosaves (debounced) under the draft key, tagged with the current baseFingerprint", async () => {
    renderPanel();
    const slideGroup = await enterEdit();
    fireEvent.click(slideGroup.querySelectorAll('[role="radio"]')[0]!); // "Oui"
    await waitFor(() => {
      const stored = readDraft(draftKey("p1", "org-1", "u1"), READ) as {
        values?: Record<string, { kind?: string }>;
        baseFingerprint?: string;
      };
      expect(stored?.values?.["f-slide"]?.kind).toBe("available");
      expect(stored?.baseFingerprint).toBe(fp([]));
    });
  });

  it("a fresh draft (baseFingerprint matches the server) is restored automatically on mount, with a toast", async () => {
    writeDraft(
      draftKey("p1", "org-1", "u1"),
      { values: { "f-slide": { kind: "available" } }, baseFingerprint: fp([]) },
      { schemaVersion: 1 },
    );
    renderPanel();
    expect(await screen.findByText("Brouillon restauré")).toBeTruthy();
    const slideGroup = await screen.findByRole("radiogroup", { name: "Toboggan" });
    expect(slideGroup.querySelector('[aria-checked="true"]')?.textContent).toBe("Oui");
  });

  it("save success clears the draft before leaving edit mode", async () => {
    renderPanel();
    const slideGroup = await enterEdit();
    fireEvent.click(slideGroup.querySelectorAll('[role="radio"]')[0]!); // "Oui"
    await waitFor(() =>
      expect((readDraft(draftKey("p1", "org-1", "u1"), READ) as { values?: Record<string, unknown> })?.values?.["f-slide"]).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(setParkFeature).toHaveBeenCalledTimes(1));
    expect(readDraft(draftKey("p1", "org-1", "u1"), READ)).toBeNull();
  });

  it("a partial save failure keeps the draft (stays in edit mode for retry)", async () => {
    vi.mocked(setParkFeature).mockRejectedValueOnce(new Error("RLS"));
    renderPanel();
    const slideGroup = await enterEdit();
    fireEvent.click(slideGroup.querySelectorAll('[role="radio"]')[0]!); // "Oui" → will fail
    await waitFor(() =>
      expect((readDraft(draftKey("p1", "org-1", "u1"), READ) as { values?: Record<string, unknown> })?.values?.["f-slide"]).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText(/Échec .*: Toboggan/);
    expect((readDraft(draftKey("p1", "org-1", "u1"), READ) as { values?: Record<string, unknown> })?.values?.["f-slide"]).toBeTruthy();
  });

  it("explicit Annuler clears the draft", async () => {
    renderPanel();
    const slideGroup = await enterEdit();
    fireEvent.click(slideGroup.querySelectorAll('[role="radio"]')[0]!); // "Oui"
    await waitFor(() =>
      expect((readDraft(draftKey("p1", "org-1", "u1"), READ) as { values?: Record<string, unknown> })?.values?.["f-slide"]).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(readDraft(draftKey("p1", "org-1", "u1"), READ)).toBeNull();
  });

  it("a draft for park p1 is never restored, and stays untouched, when viewing park p2", async () => {
    writeDraft(
      draftKey("p1", "org-1", "u1"),
      { values: { "f-slide": { kind: "available" } }, baseFingerprint: fp([]) },
      { schemaVersion: 1 },
    );
    renderPanel(true, { id: "p2", name: "Autre parc" });
    await screen.findByText("Aucune caractéristique renseignée");
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
    expect(
      (readDraft(draftKey("p1", "org-1", "u1"), READ) as { values?: Record<string, unknown> })?.values?.["f-slide"],
    ).toBeTruthy();
  });

  it("a draft written by user A is never restored, and stays untouched, for user B", async () => {
    writeDraft(
      draftKey("p1", "org-1", "u1"),
      { values: { "f-slide": { kind: "available" } }, baseFingerprint: fp([]) },
      { schemaVersion: 1 },
    );
    orgSessionState.userId = "u2";
    renderPanel();
    await screen.findByText("Aucune caractéristique renseignée");
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
    expect(
      (readDraft(draftKey("p1", "org-1", "u1"), READ) as { values?: Record<string, unknown> })?.values?.["f-slide"],
    ).toBeTruthy();
  });

  it("a draft under one organisation is never restored under another (same park, same user)", async () => {
    writeDraft(
      draftKey("p1", "org-1", "u1"),
      { values: { "f-slide": { kind: "available" } }, baseFingerprint: fp([]) },
      { schemaVersion: 1 },
    );
    orgScopeState.communeId = "org-2";
    renderPanel();
    await screen.findByText("Aucune caractéristique renseignée");
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
  });

  it("a stale draft (server characteristics changed since) is discarded, never silently applied", async () => {
    vi.mocked(listParkFeatures).mockResolvedValue([pf("f-slide", "available", null, "2026-01-01T00:00:00Z")] as never);
    writeDraft(
      draftKey("p1", "org-1", "u1"),
      { values: { "f-slide": { kind: "unavailable" } }, baseFingerprint: "0:" }, // stale: fingerprint computed before f-slide existed
      { schemaVersion: 1 },
    );
    renderPanel();
    await screen.findByText("Toboggan");
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
    await waitFor(() => expect(readDraft(draftKey("p1", "org-1", "u1"), READ)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    const slideGroup = await screen.findByRole("radiogroup", { name: "Toboggan" });
    // Server truth (available), not the discarded stale draft (unavailable).
    expect(slideGroup.querySelector('[aria-checked="true"]')?.textContent).toBe("Oui");
  });

  it("no resurrection after clear: saving then remounting starts clean", async () => {
    const { unmount } = renderPanel();
    const slideGroup = await enterEdit();
    fireEvent.click(slideGroup.querySelectorAll('[role="radio"]')[0]!); // "Oui"
    await waitFor(() =>
      expect((readDraft(draftKey("p1", "org-1", "u1"), READ) as { values?: Record<string, unknown> })?.values?.["f-slide"]).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(setParkFeature).toHaveBeenCalledTimes(1));
    unmount();

    renderPanel();
    await screen.findByText("Aucune caractéristique renseignée");
    expect(screen.queryByText("Brouillon restauré")).toBeNull();
  });
});
