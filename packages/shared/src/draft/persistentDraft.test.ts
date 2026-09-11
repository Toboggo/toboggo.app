import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adoptGuestDraft,
  buildDraftKey,
  clearDraft,
  DRAFT_NAMESPACE,
  purgeAllDrafts,
  purgeDrafts,
  purgeDraftsForPrincipal,
  readDraft,
  sweepDrafts,
  writeDraft,
} from "./persistentDraft";

/** Minimal in-memory Storage. `failNextSet` / `throwOnAccess` simulate quota
 *  and SecurityError. */
class FakeStorage {
  private map = new Map<string, string>();
  failMode: "none" | "quota" | "generic" = "none";

  get length() {
    return this.map.size;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    if (this.failMode === "quota") {
      throw new DOMException("quota", "QuotaExceededError");
    }
    if (this.failMode === "generic") {
      throw new DOMException("nope", "SecurityError");
    }
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
  /** test helper — write bypassing failMode */
  _raw(k: string, v: string) {
    this.map.set(k, v);
  }
  _dump() {
    return Object.fromEntries(this.map);
  }
}

let store: FakeStorage;

function installStorage(value: unknown) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      if (value === "throw-on-access") throw new DOMException("x", "SecurityError");
      return value;
    },
  });
}

beforeEach(() => {
  store = new FakeStorage();
  installStorage(store);
});

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
  vi.restoreAllMocks();
});

const KEY = "toboggo:draft:bo:park.new:u=alice";
const READ = { schemaVersion: 1, ttlMs: 60_000 };

describe("writeDraft / readDraft", () => {
  it("round-trips through a { v, savedAt, data } envelope", () => {
    const before = Date.now();
    expect(writeDraft(KEY, { name: "Square X", ages: [2, 8] }, { schemaVersion: 1 })).toBe("ok");

    const rawEnv = JSON.parse(store.getItem(KEY)!);
    expect(rawEnv.v).toBe(1);
    expect(typeof rawEnv.savedAt).toBe("number");
    expect(rawEnv.savedAt).toBeGreaterThanOrEqual(before);
    expect(rawEnv.data).toEqual({ name: "Square X", ages: [2, 8] });

    expect(readDraft(KEY, READ)).toEqual({ name: "Square X", ages: [2, 8] });
  });

  it("returns null and removes the entry once past its TTL", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    writeDraft(KEY, { a: 1 }, { schemaVersion: 1 });
    vi.spyOn(Date, "now").mockReturnValue(1_000_000 + 90_000);
    expect(readDraft(KEY, { schemaVersion: 1, ttlMs: 60_000 })).toBeNull();
    expect(store.getItem(KEY)).toBeNull();
  });

  it("returns a fresh draft that is within its TTL", () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    writeDraft(KEY, { a: 1 }, { schemaVersion: 1 });
    vi.spyOn(Date, "now").mockReturnValue(2_000_000 + 30_000);
    expect(readDraft(KEY, { schemaVersion: 1, ttlMs: 60_000 })).toEqual({ a: 1 });
  });

  it("drops corrupt JSON and returns null", () => {
    store._raw(KEY, "{not json");
    expect(readDraft(KEY, READ)).toBeNull();
    expect(store.getItem(KEY)).toBeNull();
  });

  it("drops a malformed envelope (no savedAt/v)", () => {
    store._raw(KEY, JSON.stringify({ data: { a: 1 } }));
    expect(readDraft(KEY, READ)).toBeNull();
    expect(store.getItem(KEY)).toBeNull();
  });

  it("serialises Set via replacer/reviver", () => {
    const replacer = (_k: string, v: unknown) => (v instanceof Set ? { __set: [...v] } : v);
    const reviver = (_k: string, v: unknown) =>
      v && typeof v === "object" && Array.isArray((v as { __set?: unknown[] }).__set)
        ? new Set((v as { __set: unknown[] }).__set)
        : v;
    writeDraft(KEY, { tags: new Set(["a", "b"]) }, { schemaVersion: 1, replacer });
    const out = readDraft<{ tags: Set<string> }>(KEY, { ...READ, reviver });
    expect(out!.tags).toBeInstanceOf(Set);
    expect([...out!.tags]).toEqual(["a", "b"]);
  });
});

describe("schemaVersion / migration", () => {
  it("reads when the stored version matches", () => {
    writeDraft(KEY, { a: 1 }, { schemaVersion: 3 });
    expect(readDraft(KEY, { schemaVersion: 3, ttlMs: 60_000 })).toEqual({ a: 1 });
  });

  it("runs migrate() on a version mismatch and keeps the migrated value", () => {
    writeDraft(KEY, { old: 1 }, { schemaVersion: 1 });
    const out = readDraft(KEY, {
      schemaVersion: 2,
      ttlMs: 60_000,
      migrate: (data, from) => {
        expect(from).toBe(1);
        return { migrated: (data as { old: number }).old };
      },
    });
    expect(out).toEqual({ migrated: 1 });
  });

  it("discards the draft when there is no migrate() for a mismatch", () => {
    writeDraft(KEY, { a: 1 }, { schemaVersion: 1 });
    expect(readDraft(KEY, { schemaVersion: 2, ttlMs: 60_000 })).toBeNull();
    expect(store.getItem(KEY)).toBeNull();
  });

  it("discards when migrate() returns null", () => {
    writeDraft(KEY, { a: 1 }, { schemaVersion: 1 });
    expect(readDraft(KEY, { schemaVersion: 2, ttlMs: 60_000, migrate: () => null })).toBeNull();
    expect(store.getItem(KEY)).toBeNull();
  });
});

describe("localStorage unavailable", () => {
  it("writeDraft → 'unavailable' when localStorage is undefined", () => {
    installStorage(undefined);
    expect(writeDraft(KEY, { a: 1 }, { schemaVersion: 1 })).toBe("unavailable");
  });

  it("readDraft → null when localStorage is undefined", () => {
    installStorage(undefined);
    expect(readDraft(KEY, READ)).toBeNull();
  });

  it("writeDraft → 'unavailable' when accessing localStorage throws (SecurityError)", () => {
    installStorage("throw-on-access");
    expect(writeDraft(KEY, { a: 1 }, { schemaVersion: 1 })).toBe("unavailable");
    expect(readDraft(KEY, READ)).toBeNull();
  });

  it("writeDraft → 'unavailable' when setItem throws a non-quota error", () => {
    store.failMode = "generic";
    expect(writeDraft(KEY, { a: 1 }, { schemaVersion: 1 })).toBe("unavailable");
  });

  it("writeDraft → 'unavailable' for a non-serialisable value", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(writeDraft(KEY, circular, { schemaVersion: 1 })).toBe("unavailable");
  });
});

describe("quota handling", () => {
  it("sweeps expired/corrupt entries then retries once, returning 'ok' when room is freed", () => {
    // one corrupt + one ancient draft occupy space
    store._raw(DRAFT_NAMESPACE + "bo:x:u=old", "garbage");
    store._raw(
      DRAFT_NAMESPACE + "bo:y:u=old",
      JSON.stringify({ v: 1, savedAt: Date.now() - 30 * 24 * 3600_000, data: {} }),
    );
    // and one perfectly valid recent draft from another user
    writeDraft(DRAFT_NAMESPACE + "bo:z:u=bob", { keep: true }, { schemaVersion: 1 });

    // next set fails once with quota, then (after sweep) succeeds
    let calls = 0;
    const realSet = store.setItem.bind(store);
    vi.spyOn(store, "setItem").mockImplementation((k: string, v: string) => {
      calls++;
      if (calls === 1) throw new DOMException("quota", "QuotaExceededError");
      realSet(k, v);
    });

    const res = writeDraft(KEY, { a: 1 }, { schemaVersion: 1 });
    expect(res).toBe("ok");
    // corrupt + ancient gone…
    expect(store.getItem(DRAFT_NAMESPACE + "bo:x:u=old")).toBeNull();
    expect(store.getItem(DRAFT_NAMESPACE + "bo:y:u=old")).toBeNull();
    // …the valid recent draft of another user survived
    expect(JSON.parse(store.getItem(DRAFT_NAMESPACE + "bo:z:u=bob")!).data).toEqual({ keep: true });
  });

  it("returns 'quota' (never destroys a valid draft) when the quota stays exceeded", () => {
    writeDraft(DRAFT_NAMESPACE + "bo:z:u=bob", { keep: true }, { schemaVersion: 1 });
    store.failMode = "quota"; // every set throws quota, forever

    expect(writeDraft(KEY, { a: 1 }, { schemaVersion: 1 })).toBe("quota");
    // the other user's valid draft is untouched
    expect(JSON.parse(store.getItem(DRAFT_NAMESPACE + "bo:z:u=bob")!).data).toEqual({ keep: true });
  });
});

describe("buildDraftKey", () => {
  it("is deterministic regardless of scope insertion order", () => {
    const a = buildDraftKey({
      surface: "bo",
      flow: "park.edit",
      scope: { parkId: "p1", section: "info" },
      principal: { userId: "u1" },
    });
    const b = buildDraftKey({
      surface: "bo",
      flow: "park.edit",
      scope: { section: "info", parkId: "p1" },
      principal: { userId: "u1" },
    });
    expect(a).toBe(b);
    expect(a.startsWith(DRAFT_NAMESPACE)).toBe(true);
  });

  it("isolates by userId", () => {
    const parts = { surface: "mobile" as const, flow: "report", scope: { parkId: "p1" } };
    expect(buildDraftKey({ ...parts, principal: { userId: "alice" } })).not.toBe(
      buildDraftKey({ ...parts, principal: { userId: "bob" } }),
    );
  });

  it("isolates by organizationId (passed as scope)", () => {
    const parts = { surface: "bo" as const, flow: "park.new", principal: { userId: "u1" } };
    expect(buildDraftKey({ ...parts, scope: { org: "orgA" } })).not.toBe(
      buildDraftKey({ ...parts, scope: { org: "orgB" } }),
    );
  });

  it("guest and signed-in produce different keys; nullish userId ⇒ guest", () => {
    const base = { surface: "mobile" as const, flow: "park.add" };
    expect(buildDraftKey({ ...base, principal: "guest" })).toBe(
      buildDraftKey({ ...base, principal: { userId: null } }),
    );
    expect(buildDraftKey({ ...base, principal: "guest" })).not.toBe(
      buildDraftKey({ ...base, principal: { userId: "u1" } }),
    );
  });

  it("percent-encodes segments so a value cannot inject the separator", () => {
    const k = buildDraftKey({
      surface: "bo",
      flow: "x",
      scope: { weird: "a:b:c" },
      principal: { userId: "u:1" },
    });
    expect(k.split(":").length).toBe(
      // namespace has 2 colons, then surface:flow:scope:principal = 3 more
      DRAFT_NAMESPACE.split(":").length - 1 + 4,
    );
  });
});

describe("sweepDrafts", () => {
  it("removes corrupt and long-expired drafts, keeps valid ones, ignores foreign keys", () => {
    localStorage.setItem("unrelated:key", "keep me");
    localStorage.setItem("toboggo:contrib-draft:old", "legacy — not our namespace");
    store._raw(DRAFT_NAMESPACE + "a", "not json");
    store._raw(
      DRAFT_NAMESPACE + "b",
      JSON.stringify({ v: 1, savedAt: Date.now() - 10 * 24 * 3600_000, data: {} }),
    );
    writeDraft(DRAFT_NAMESPACE + "c", { fresh: 1 }, { schemaVersion: 1 });

    const removed = sweepDrafts();
    expect(removed).toBe(2);
    expect(store.getItem(DRAFT_NAMESPACE + "a")).toBeNull();
    expect(store.getItem(DRAFT_NAMESPACE + "b")).toBeNull();
    expect(store.getItem(DRAFT_NAMESPACE + "c")).not.toBeNull();
    expect(localStorage.getItem("unrelated:key")).toBe("keep me");
    expect(localStorage.getItem("toboggo:contrib-draft:old")).toBe("legacy — not our namespace");
  });

  it("respects a custom maxAgeMs / now", () => {
    store._raw(DRAFT_NAMESPACE + "b", JSON.stringify({ v: 1, savedAt: 1000, data: {} }));
    expect(sweepDrafts({ maxAgeMs: 500, now: 2000 })).toBe(1);
  });
});

describe("purge — scoped, never cross-principal", () => {
  beforeEach(() => {
    writeDraft(buildDraftKey({ surface: "bo", flow: "park.new", principal: { userId: "A" } }), { x: 1 }, { schemaVersion: 1 });
    writeDraft(buildDraftKey({ surface: "bo", flow: "park.edit", scope: { parkId: "p1" }, principal: { userId: "A" } }), { x: 2 }, { schemaVersion: 1 });
    writeDraft(buildDraftKey({ surface: "bo", flow: "park.new", principal: { userId: "B" } }), { x: 3 }, { schemaVersion: 1 });
    writeDraft(buildDraftKey({ surface: "mobile", flow: "report", scope: { parkId: "p1" }, principal: "guest" }), { x: 4 }, { schemaVersion: 1 });
    localStorage.setItem("unrelated", "keep");
  });

  it("purgeDraftsForPrincipal removes only that user's drafts", () => {
    const removed = purgeDraftsForPrincipal({ userId: "A" });
    expect(removed).toBe(2);
    expect(readDraft(buildDraftKey({ surface: "bo", flow: "park.new", principal: { userId: "A" } }), READ)).toBeNull();
    // B and guest untouched
    expect(readDraft(buildDraftKey({ surface: "bo", flow: "park.new", principal: { userId: "B" } }), READ)).toEqual({ x: 3 });
    expect(readDraft(buildDraftKey({ surface: "mobile", flow: "report", scope: { parkId: "p1" }, principal: "guest" }), READ)).toEqual({ x: 4 });
  });

  it("purgeDraftsForPrincipal('guest') leaves signed-in drafts alone", () => {
    expect(purgeDraftsForPrincipal("guest")).toBe(1);
    expect(readDraft(buildDraftKey({ surface: "bo", flow: "park.new", principal: { userId: "A" } }), READ)).toEqual({ x: 1 });
  });

  it("purgeDrafts by prefix targets a whole flow", () => {
    expect(purgeDrafts({ prefix: "bo:park.new:" })).toBe(2); // A + B
    expect(readDraft(buildDraftKey({ surface: "bo", flow: "park.edit", scope: { parkId: "p1" }, principal: { userId: "A" } }), READ)).toEqual({ x: 2 });
  });

  it("purgeAllDrafts clears the namespace but nothing else", () => {
    expect(purgeAllDrafts()).toBe(4);
    expect(localStorage.getItem("unrelated")).toBe("keep");
  });
});

describe("clearDraft", () => {
  it("removes one key, no-ops when storage is gone", () => {
    writeDraft(KEY, { a: 1 }, { schemaVersion: 1 });
    clearDraft(KEY);
    expect(store.getItem(KEY)).toBeNull();
    installStorage(undefined);
    expect(() => clearDraft(KEY)).not.toThrow();
  });
});

describe("adoptGuestDraft — guest → signed-in handover", () => {
  const guestKey = buildDraftKey({ surface: "mobile", flow: "park.report", scope: { parkId: "p1" }, principal: "guest" });
  const userKey = buildDraftKey({ surface: "mobile", flow: "park.report", scope: { parkId: "p1" }, principal: { userId: "alice" } });
  const otherGuest = buildDraftKey({ surface: "mobile", flow: "park.edit-info", scope: { parkId: "p9" }, principal: "guest" });

  it("moves the guest draft to the user key and deletes the guest key", () => {
    writeDraft(guestKey, { comment: "en cours" }, { schemaVersion: 1 });
    writeDraft(otherGuest, { name: "autre" }, { schemaVersion: 1 });

    expect(adoptGuestDraft(guestKey, userKey)).toBe(true);
    expect(readDraft(userKey, READ)).toEqual({ comment: "en cours" });
    expect(store.getItem(guestKey)).toBeNull();
    // a guest draft for another flow/park is untouched
    expect(readDraft(otherGuest, READ)).toEqual({ name: "autre" });
  });

  it("no guest draft → no-op, returns false", () => {
    writeDraft(userKey, { comment: "user's" }, { schemaVersion: 1 });
    expect(adoptGuestDraft(guestKey, userKey)).toBe(false);
    expect(readDraft(userKey, READ)).toEqual({ comment: "user's" });
  });

  it("on collision, the NEWER draft by savedAt wins; the guest key is always removed", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    writeDraft(userKey, { v: "old user" }, { schemaVersion: 1 });
    vi.spyOn(Date, "now").mockReturnValue(2_000);
    writeDraft(guestKey, { v: "new guest" }, { schemaVersion: 1 });

    expect(adoptGuestDraft(guestKey, userKey)).toBe(true);
    expect(readDraft(userKey, { schemaVersion: 1, ttlMs: 10_000 })).toEqual({ v: "new guest" });
    expect(store.getItem(guestKey)).toBeNull();
  });

  it("on collision, a NEWER user draft is kept and the guest draft discarded", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    writeDraft(guestKey, { v: "old guest" }, { schemaVersion: 1 });
    vi.spyOn(Date, "now").mockReturnValue(2_000);
    writeDraft(userKey, { v: "new user" }, { schemaVersion: 1 });

    expect(adoptGuestDraft(guestKey, userKey)).toBe(false);
    expect(readDraft(userKey, { schemaVersion: 1, ttlMs: 10_000 })).toEqual({ v: "new user" });
    expect(store.getItem(guestKey)).toBeNull();
  });

  it("never merges fields — it is one raw envelope or the other", () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000);
    writeDraft(guestKey, { reason: "danger", comment: "guest note" }, { schemaVersion: 1 });
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    writeDraft(userKey, { reason: null, equipment: "Toboggan" }, { schemaVersion: 1 });

    adoptGuestDraft(guestKey, userKey); // guest is newer → guest wins wholesale
    expect(readDraft(userKey, { schemaVersion: 1, ttlMs: 10_000 })).toEqual({
      reason: "danger",
      comment: "guest note",
    });
  });

  it("no-ops safely when storage is unavailable or keys are equal", () => {
    installStorage(undefined);
    expect(adoptGuestDraft(guestKey, userKey)).toBe(false);
    installStorage(store);
    writeDraft(guestKey, { a: 1 }, { schemaVersion: 1 });
    expect(adoptGuestDraft(guestKey, guestKey)).toBe(false);
    expect(store.getItem(guestKey)).not.toBeNull();
  });
});
