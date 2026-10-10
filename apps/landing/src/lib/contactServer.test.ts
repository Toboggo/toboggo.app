import { describe, expect, it, vi } from "vitest";
import { MAX_BODY_CHARS, handleContact, type ContactEnv } from "./contactServer";
import { sendContactApi, type ContactInput } from "./contact";

const ENV: ContactEnv = { RESEND_API_KEY: "test-key", CONTACT_TO_EMAIL: "inbox@example.test", CONTACT_FROM_EMAIL: "Toboggo <noreply@example.test>" };
const valid = { name: "Camille", email: "camille@example.test", subject: "Question générale", organization: "", message: "Bonjour, une question sur l'app.", website: "", elapsedMs: 8000 };

function req(body: unknown, init: { method?: string; origin?: string | null; type?: string } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": init.type ?? "application/json" };
  if (init.origin !== null) headers.Origin = init.origin ?? "https://toboggo-website.vercel.app";
  return new Request("https://toboggo-website.vercel.app/api/contact", { method: init.method ?? "POST", headers, body: init.method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}
const okFetch = () => vi.fn(async () => new Response("{}", { status: 200 }));

describe("handleContact", () => {
  it("envoie via Resend avec la clé en en-tête serveur, jamais dans le corps", async () => {
    const f = okFetch();
    const res = await handleContact(req(valid), ENV, f as unknown as typeof fetch);
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const sent = JSON.parse(String(init.body));
    expect(sent.to).toEqual(["inbox@example.test"]);
    expect(sent.reply_to).toBe("camille@example.test");
    expect(JSON.stringify(sent)).not.toContain("test-key");
    expect(sent.html).toBeUndefined();
  });

  it("503 not_configured sans appel réseau quand une variable manque", async () => {
    const f = okFetch();
    for (const missing of ["RESEND_API_KEY", "CONTACT_TO_EMAIL", "CONTACT_FROM_EMAIL"] as const) {
      const res = await handleContact(req(valid), { ...ENV, [missing]: undefined }, f as unknown as typeof fetch);
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe("not_configured");
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("honeypot rempli ou envoi trop rapide : faux succès, rien n'est envoyé", async () => {
    const f = okFetch();
    expect((await handleContact(req({ ...valid, website: "http://spam" }), ENV, f as unknown as typeof fetch)).status).toBe(200);
    expect((await handleContact(req({ ...valid, elapsedMs: 100 }), ENV, f as unknown as typeof fetch)).status).toBe(200);
    expect((await handleContact(req({ ...valid, elapsedMs: undefined }), ENV, f as unknown as typeof fetch)).status).toBe(200);
    expect(f).not.toHaveBeenCalled();
  });

  it("validation serveur : 422 sur e-mail invalide, message trop court, sujet inconnu", async () => {
    const f = okFetch();
    for (const bad of [{ email: "pas-un-mail" }, { message: "court" }, { subject: "Autre" }, { name: " " }]) {
      const res = await handleContact(req({ ...valid, ...bad }), ENV, f as unknown as typeof fetch);
      expect(res.status).toBe(422);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("refuse méthode, origine, type de contenu, JSON et taille invalides", async () => {
    const f = okFetch() as unknown as typeof fetch;
    expect((await handleContact(req(valid, { method: "GET" }), ENV, f)).status).toBe(405);
    expect((await handleContact(req(valid, { origin: "https://evil.example" }), ENV, f)).status).toBe(403);
    expect((await handleContact(req(valid, { origin: null }), ENV, f)).status).toBe(403);
    expect((await handleContact(req(valid, { type: "text/plain" }), ENV, f)).status).toBe(415);
    expect((await handleContact(req("{pas du json"), ENV, f)).status).toBe(400);
    expect((await handleContact(req("x".repeat(MAX_BODY_CHARS + 1)), ENV, f)).status).toBe(413);
  });

  it("neutralise les sauts de ligne dans l'objet du mail", async () => {
    const f = okFetch();
    await handleContact(req({ ...valid, name: "Eve\r\nBcc: x@example.test" }), ENV, f as unknown as typeof fetch);
    const sent = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.subject).not.toMatch(/[\r\n]/);
  });

  it("502 si Resend échoue (HTTP ou réseau)", async () => {
    const down = vi.fn(async () => new Response("{}", { status: 500 }));
    expect((await handleContact(req(valid), ENV, down as unknown as typeof fetch)).status).toBe(502);
    const boom = vi.fn(async () => { throw new Error("net"); });
    expect((await handleContact(req(valid), ENV, boom as unknown as typeof fetch)).status).toBe(502);
  });
});

describe("sendContactApi (client)", () => {
  const input: ContactInput = { name: "A", email: "a@example.test", subject: "Question générale", organization: "", message: "message assez long", website: "" };
  const reply = (status: number) => vi.fn(async () => new Response("{}", { status })) as unknown as typeof fetch;

  it("sent / unavailable / erreur", async () => {
    expect(await sendContactApi(input, 5000, reply(200))).toBe("sent");
    for (const s of [404, 405, 502, 503]) expect(await sendContactApi(input, 5000, reply(s))).toBe("unavailable");
    expect(await sendContactApi(input, 5000, vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe("unavailable");
    await expect(sendContactApi(input, 5000, reply(422))).rejects.toThrow();
    await expect(sendContactApi(input, 5000, reply(403))).rejects.toThrow();
  });
});
