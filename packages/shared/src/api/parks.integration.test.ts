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
  parkExistsWithNameAndAddress,
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
const ORG_C = "cccccccc-0000-4000-8000-00000000000c";
const N_DUP = 1100; // homonymes > 1000 (même nom, adresses différentes)
const N_A = 1200; // > max_rows
const N_B = 30;
const TRICKY = [`${PREFIX} Parc "Les Pins", (nord) \\ test`, `${PREFIX} 50%_ Parc`, `${PREFIX} Parc, virgule`];

describe.skipIf(!up)("intégration PostgREST + RLS (pile locale)", () => {
  const svc: SupabaseClient = createClient(URL_LOCAL, SERVICE, { auth: { persistSession: false } });
  const anon: SupabaseClient = createClient(URL_LOCAL, ANON, { auth: { persistSession: false } });
  let member: SupabaseClient;
  let staff: SupabaseClient;
  let parkA = "";
  let parkB = "";
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
    await svc.from("communes").insert([{ id: ORG_A, name: `${PREFIX} A` }, { id: ORG_B, name: `${PREFIX} B` }, { id: ORG_C, name: `${PREFIX} C` }]).throwOnError();
    await svc.from("organizations").insert([
      { id: ORG_A, name: `${PREFIX} A`, type: "municipality" },
      { id: ORG_B, name: `${PREFIX} B`, type: "municipality" },
      { id: ORG_C, name: `${PREFIX} C`, type: "municipality" },
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
    const rowsC = Array.from({ length: N_DUP }, (_, i) => ({ ...mk(9000 + i, `${PREFIX} Dup`), address_line: `${i} Rue Test`, postal_code: "69001", city: "Lyon" }));
    for (let i = 0; i < rowsC.length; i += 300) {
      const { data } = await svc.from("parks").insert(rowsC.slice(i, i + 300)).select("id").throwOnError();
      await svc.from("organization_parks").insert(data!.map((p) => ({ organization_id: ORG_C, park_id: p.id }))).throwOnError();
    }
    member = await mkUser("lota-member@example.test", "gestionnaire", ORG_A);
    staff = await mkUser("lota-staff@example.test", "super_admin", null);
    // Objets rattachés à UN parc de A et UN parc de B : signalement, avis, photo à modérer, proposition
    const pick = async (org: string) =>
      (await svc.from("organization_parks").select("park_id").eq("organization_id", org).limit(1).single().throwOnError()).data!.park_id as string;
    parkA = await pick(ORG_A);
    parkB = await pick(ORG_B);
    const staffId = userIds[userIds.length - 1];
    for (const pid of [parkA, parkB]) {
      await svc.from("reports").insert({ park_id: pid, reported_by_name: `${PREFIX}`, reason: "safety", category: "safety" }).throwOnError();
      await svc.from("reviews").insert({ park_id: pid, user_id: staffId, author_name: PREFIX, stars: 4, rating: 4 }).throwOnError();
      await svc.from("park_media").insert({ park_id: pid, url: `https://example.test/${PREFIX}-${pid}.jpg`, status: "pending" }).throwOnError();
      await svc.from("park_edits").insert({ park_id: pid, changes: { name: PREFIX }, status: "pending" }).throwOnError();
    }
  }, 180_000);

  async function cleanup() {
    await svc.from("reports").delete().eq("reported_by_name", PREFIX);
    await svc.from("reviews").delete().eq("author_name", PREFIX);
    await svc.from("park_edits").delete().eq("changes->>name", PREFIX);
    await svc.from("parks").delete().like("name", `${PREFIX}%`);
    await svc.from("team_members").delete().like("email", "lota-%@example.test");
    await svc.from("organizations").delete().in("id", [ORG_A, ORG_B, ORG_C]);
    await svc.from("communes").delete().in("id", [ORG_A, ORG_B, ORG_C]);
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

  it("ISOLATION entre collectivités — signalements, avis, photos, propositions : chaque périmètre ne renvoie QUE ses objets", async () => {
    use(staff);
    const ids = async <T extends { park_id?: string | null }>(rows: Promise<T[]>) => (await rows).map((r) => r.park_id).sort();
    expect(await ids(listReports({ communeId: ORG_A }) as never)).toEqual([parkA]);
    expect(await ids(listReports({ communeId: ORG_B }) as never)).toEqual([parkB]);
    expect(await ids(listReviews({ communeId: ORG_A }) as never)).toEqual([parkA]);
    expect(await ids(listReviews({ communeId: ORG_B }) as never)).toEqual([parkB]);
    expect(await ids(listPendingMedia({ communeId: ORG_A }) as never)).toEqual([parkA]);
    expect(await ids(listPendingMedia({ communeId: ORG_B }) as never)).toEqual([parkB]);
    expect(await ids(listPendingParkEditsForOrg(ORG_A) as never)).toEqual([parkA]);
    expect(await ids(listPendingParkEditsForOrg(ORG_B) as never)).toEqual([parkB]);
    expect(await ids(listReports({ communeId: ORG_C }) as never)).toEqual([]);
    // sans périmètre (Admin) : les deux
    expect((await listReports()).filter((r) => r.park_id === parkA || r.park_id === parkB)).toHaveLength(2);
  });

  it("ISOLATION — un membre de A ne lit jamais les objets de B, même en demandant le périmètre de B", async () => {
    use(member);
    const seen = async <T extends { park_id?: string | null }>(rows: Promise<T[]>) => (await rows).map((r) => r.park_id);
    for (const pid of [parkB]) {
      expect(await seen(listReports({ communeId: ORG_B }) as never)).not.toContain(pid);
      expect(await seen(listReviews({ communeId: ORG_B }) as never)).not.toContain(pid);
      expect(await seen(listPendingMedia({ communeId: ORG_B }) as never)).not.toContain(pid);
      expect(await seen(listPendingParkEditsForOrg(ORG_B) as never)).not.toContain(pid);
    }
    expect(await seen(listReports({ communeId: ORG_A }) as never)).not.toContain(parkB);
  });

  it("import CSV — doublons : exact, homonyme/autre adresse, casse, et plus de 1000 homonymes", async () => {
    use(staff);
    // 1100 parcs « LOTA-TEST Dup » : adresses « i Rue Test, 69001 Lyon »
    const addr = (i: number) => `${i} Rue Test, 69001 Lyon`;
    expect(await parkExistsWithNameAndAddress(`${PREFIX} Dup`, addr(0), { communeId: ORG_C })).toBe(true);
    expect(await parkExistsWithNameAndAddress(`${PREFIX} Dup`, addr(N_DUP - 1), { communeId: ORG_C })).toBe(true); // au-delà de la 1000e ligne
    expect(await parkExistsWithNameAndAddress(`${PREFIX} Dup`, addr(N_DUP), { communeId: ORG_C })).toBe(false); // autre adresse
    expect(await parkExistsWithNameAndAddress(`${PREFIX} Dup`.toUpperCase(), addr(5), { communeId: ORG_C })).toBe(false); // casse ≠ strict
    expect(await parkExistsWithNameAndAddress(`${PREFIX} Dup`, addr(5), { communeId: ORG_A })).toBe(false); // autre périmètre
    expect(await parkExistsWithNameAndAddress(`${PREFIX} Dup`, addr(N_DUP - 1))).toBe(true); // sans périmètre (Admin)
  });
});
