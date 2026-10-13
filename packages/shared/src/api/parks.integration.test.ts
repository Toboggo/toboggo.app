import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "../supabaseClient";
import {
  countParksByCreator,
  getParkCountryDistribution,
  getParkStatusCounts,
  isParkInOrganization,
  listAllParksForExport,
  listParksCapped,
  listParksPage,
} from "./parks";
import { listReports } from "./reports";
import { listReviews } from "./reviews";
import { listPendingMedia } from "./parkDetails";
import { listPendingParkEditsForOrg } from "./contributions";

vi.mock("../supabaseClient", () => ({ getSupabase: vi.fn() }));

// Intégration contre la pile Supabase LOCALE (PostgREST + RLS réels) — ignorée si elle n'est pas
// joignable (CI). N'écrit que des lignes `LOTA-TEST …` en base LOCALE et les supprime ensuite.
// Clés = clés de démo publiques de `supabase start`. Jamais STAGING/PROD.
const URL_LOCAL = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function localStackUp(): Promise<boolean> {
  try {
    const r = await fetch(`${URL_LOCAL}/rest/v1/parks?select=id&limit=1`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      signal: AbortSignal.timeout(1500),
    });
    return r.ok;
  } catch {
    return false;
  }
}
const up = await localStackUp();

const PREFIX = "LOTA-TEST";
const ORG_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const ORG_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const N_A = 1200; // > max_rows
const N_B = 30;
const TRICKY = [`${PREFIX} Parc "Les Pins", (nord) \\ test`, `${PREFIX} 50%_ Parc`, `${PREFIX} Parc, virgule`];

describe.skipIf(!up)("intégration PostgREST + RLS (pile locale)", () => {
  const svc: SupabaseClient = createClient(URL_LOCAL, SERVICE, { auth: { persistSession: false } });
  const anon: SupabaseClient = createClient(URL_LOCAL, ANON, { auth: { persistSession: false } });
  let member: SupabaseClient;
  let staff: SupabaseClient;
  const userIds: string[] = [];
  const use = (c: SupabaseClient) => vi.mocked(getSupabase).mockReturnValue(c as never);

  async function mkUser(email: string, role: string, orgId: string | null) {
    const pwd = "Lota-Test-Pwd-9!x";
    const { data, error } = await svc.auth.admin.createUser({ email, password: pwd, email_confirm: true });
    if (error) throw error;
    userIds.push(data.user.id);
    const { error: tmErr } = await svc.from("team_members").insert({ user_id: data.user.id, name: email, email, role, organization_id: orgId });
    if (tmErr) throw tmErr;
    const c = createClient(URL_LOCAL, ANON, { auth: { persistSession: false } });
    const { error: siErr } = await c.auth.signInWithPassword({ email, password: pwd });
    if (siErr) throw siErr;
    return c;
  }

  beforeAll(async () => {
    await cleanup();
    // `communes` = miroir V1 de `organizations` (même uuid) exigé par la FK de team_members.commune_id
    await svc.from("communes").insert([{ id: ORG_A, name: `${PREFIX} A` }, { id: ORG_B, name: `${PREFIX} B` }]).throwOnError();
    await svc.from("organizations").insert([
      { id: ORG_A, name: `${PREFIX} A`, type: "municipality" },
      { id: ORG_B, name: `${PREFIX} B`, type: "municipality" },
    ]).throwOnError();
    const mk = (i: number, name: string) => ({
      name, latitude: 45 + i / 10_000, longitude: 4 + i / 10_000, country_code: "FR", timezone: "Europe/Paris",
      moderation_status: "pending", verification_status: "unverified",
    });
    const rowsA = Array.from({ length: N_A }, (_, i) => mk(i, `${PREFIX} A ${String(i).padStart(4, "0")}`));
    TRICKY.forEach((n, i) => rowsA.push(mk(N_A + i, n)));
    const rowsB = Array.from({ length: N_B }, (_, i) => mk(5000 + i, `${PREFIX} B ${i}`));
    for (const [rows, org] of [[rowsA, ORG_A], [rowsB, ORG_B]] as const) {
      for (let i = 0; i < rows.length; i += 300) {
        const { data } = await svc.from("parks").insert(rows.slice(i, i + 300)).select("id").throwOnError();
        await svc.from("organization_parks").insert(data!.map((p) => ({ organization_id: org, park_id: p.id }))).throwOnError();
      }
    }
    member = await mkUser("lota-member@example.test", "gestionnaire", ORG_A);
    staff = await mkUser("lota-staff@example.test", "super_admin", null);
  }, 120_000);

  async function cleanup() {
    await svc.from("parks").delete().like("name", `${PREFIX}%`);
    await svc.from("team_members").delete().like("email", "lota-%@example.test");
    await svc.from("organizations").delete().in("id", [ORG_A, ORG_B]);
    await svc.from("communes").delete().in("id", [ORG_A, ORG_B]);
    for (const e of ["lota-member@example.test", "lota-staff@example.test"]) {
      const { data } = await svc.auth.admin.listUsers({ perPage: 200 });
      const u = data?.users.find((x) => x.email === e);
      if (u) await svc.auth.admin.deleteUser(u.id);
    }
  }
  afterAll(cleanup, 120_000);

  it("RLS — le public (anon) ne voit AUCUN parc pending, ni par la liste, ni par les compteurs, ni par l'export", async () => {
    use(anon);
    const page = await listParksPage({ q: PREFIX });
    expect(page.total).toBe(0);
    expect((await getParkStatusCounts(["pending"])).pending).toBe(0);
    expect(await listAllParksForExport({ q: PREFIX })).toHaveLength(0);
    expect((await listParksCapped({ communeId: ORG_A })).rows).toHaveLength(0);
  });

  it("collectivité (membre de A) : lit ses 1203 parcs pending (> max_rows) par jointure serveur", async () => {
    use(member);
    const { rows, truncated } = await listParksCapped({ communeId: ORG_A });
    expect(rows).toHaveLength(N_A + TRICKY.length);
    expect(truncated).toBe(false);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect((await getParkStatusCounts(["pending"], { communeId: ORG_A })).pending).toBe(N_A + TRICKY.length);
    const page = await listParksPage({ communeId: ORG_A, status: ["pending"], page: 2 });
    expect(page.total).toBe(N_A + TRICKY.length);
    expect(page.rows).toHaveLength(25);
  });

  it("collectivité (membre de A) : ne voit RIEN de l'organisation B (périmètre non élargi)", async () => {
    use(member);
    expect((await listParksCapped({ communeId: ORG_B })).rows).toHaveLength(0);
    expect((await listParksPage({ communeId: ORG_A, organizationId: ORG_B })).total).toBe(0);
    expect(await isParkInOrganization(ORG_B, (await listParksCapped({ communeId: ORG_A })).rows[0].id)).toBe(false);
  });

  it("staff : filtre « Collectivité » exact, source d'origine OSM/vide déterministe, tri stable sans doublon", async () => {
    use(staff);
    const a = await listParksPage({ organizationId: ORG_A, sort: "name", order: "asc", page: 1 });
    expect(a.total).toBe(N_A + TRICKY.length);
    const b = await listParksPage({ organizationId: ORG_B });
    expect(b.total).toBe(N_B);
    const seen = new Set<string>();
    for (let p = 1; p <= 4; p++) {
      const res = await listParksPage({ organizationId: ORG_A, sort: "name", order: "asc", page: p });
      for (const r of res.rows) {
        expect(seen.has(r.id)).toBe(false);
        seen.add(r.id);
      }
    }
    expect(seen.size).toBe(100);
    // filtre source (alias src_filter) : les parcs de test n'ont pas de source → 0 ; osm → catalogue importé
    expect((await listParksPage({ organizationId: ORG_A, sourceTypes: ["osm"] })).total).toBe(0);
    expect((await listParksPage({ sourceTypes: ["osm"] })).total).toBeGreaterThan(1000);
    // les deux jointures cumulées (communeId ∩ organizationId)
    expect((await listParksPage({ communeId: ORG_A, organizationId: ORG_B })).total).toBe(0);
  });

  it("export keyset réel (noms avec virgules, guillemets, parenthèses, %, _) : complet, sans doublon, ordre exact", async () => {
    use(staff);
    for (const order of ["asc", "desc"] as const) {
      const rows = await listAllParksForExport({ organizationId: ORG_A, sort: "name", order });
      expect(rows).toHaveLength(N_A + TRICKY.length);
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      const names = rows.map((r) => r.name);
      // ordre côté base (collation) : on vérifie surtout l'absence de trou/doublon et la cohérence entre pages
      expect(new Set(names)).toEqual(new Set([...Array.from({ length: N_A }, (_, i) => `${PREFIX} A ${String(i).padStart(4, "0")}`), ...TRICKY]));
    }
    const byDate = await listAllParksForExport({ organizationId: ORG_A, sort: "updated_at", order: "desc" });
    expect(byDate).toHaveLength(N_A + TRICKY.length);
  });

  it("répartition par pays réelle = SQL, comptes par créateur, status counts", async () => {
    use(staff);
    const dist = await getParkCountryDistribution();
    const { count: fr } = await svc.from("park_public").select("id", { count: "exact", head: true }).eq("country_code", "FR");
    expect(dist.find((d) => d.country_code === "FR")?.count).toBe(fr);
    const total = dist.reduce((s, d) => s + d.count, 0);
    const { count: all } = await svc.from("park_public").select("id", { count: "exact", head: true });
    expect(total).toBe(all);
    const { complete } = await countParksByCreator();
    expect(complete).toBe(true);
  });

  it("requêtes de collectivité (reports / reviews / médias / propositions) : syntaxe de jointure acceptée par PostgREST", async () => {
    use(member);
    await expect(listReports({ communeId: ORG_A })).resolves.toBeDefined();
    await expect(listReviews({ communeId: ORG_A })).resolves.toBeDefined();
    await expect(listPendingMedia({ communeId: ORG_A })).resolves.toBeDefined();
    await expect(listPendingParkEditsForOrg(ORG_A)).resolves.toBeDefined();
  });
});
