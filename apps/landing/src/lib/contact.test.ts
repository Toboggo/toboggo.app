import { describe, expect, it, vi } from "vitest";
import { buildPayload, ContactSendError, looksLikeBot, MIN_FILL_MS, sendContact, subjectFromParam, validateContact, type ContactInput } from "./contact";

const valid: ContactInput = {
  name: "Camille Test",
  email: "camille@example.org",
  subject: "Question générale",
  organization: "",
  message: "Bonjour, ceci est un message de test.",
  website: "",
};

describe("subjectFromParam", () => {
  it("maps only known subjects, case-insensitively", () => {
    expect(subjectFromParam("partenariat")).toBe("Partenariat");
    expect(subjectFromParam(" Presse ")).toBe("Presse");
    expect(subjectFromParam("technique")).toBe("Problème technique");
    expect(subjectFromParam("n'importe quoi")).toBeNull();
    expect(subjectFromParam(null)).toBeNull();
  });
});

describe("validateContact", () => {
  it("accepts a valid message", () => {
    expect(validateContact(valid)).toBeNull();
  });

  it("rejects each invalid field with a French message", () => {
    expect(validateContact({ ...valid, name: "  " })?.field).toBe("name");
    expect(validateContact({ ...valid, email: "pas-un-mail" })?.field).toBe("email");
    expect(validateContact({ ...valid, email: "a@b" })?.field).toBe("email");
    expect(validateContact({ ...valid, subject: "Autre" })?.field).toBe("subject");
    expect(validateContact({ ...valid, message: "court" })?.field).toBe("message");
    expect(validateContact({ ...valid, message: "x".repeat(5001) })?.field).toBe("message");
    expect(validateContact({ ...valid, name: "x".repeat(101) })?.message).toMatch(/100/);
  });
});

describe("looksLikeBot", () => {
  it("flags a filled honeypot or an instant submission", () => {
    expect(looksLikeBot({ website: "http://spam" }, 60_000)).toBe(true);
    expect(looksLikeBot({ website: "" }, MIN_FILL_MS - 1)).toBe(true);
    expect(looksLikeBot({ website: "" }, MIN_FILL_MS)).toBe(false);
  });
});

describe("buildPayload", () => {
  it("only sends the four existing columns", () => {
    expect(Object.keys(buildPayload(valid)).sort()).toEqual(["email", "message", "name", "subject"]);
  });

  it("prefixes the organization for partnership requests only", () => {
    const partnership = buildPayload({ ...valid, subject: "Partenariat", organization: " Mairie de Test " });
    expect(partnership.message).toBe("Collectivité : Mairie de Test\n\nBonjour, ceci est un message de test.");
    expect(buildPayload({ ...valid, subject: "Partenariat", organization: "" }).message).toBe(valid.message);
    expect(buildPayload({ ...valid, subject: "Presse", organization: "Mairie de Test" }).message).toBe(valid.message);
  });

  it("trims and caps the organization", () => {
    const p = buildPayload({ ...valid, subject: "Partenariat", organization: "x".repeat(400) });
    expect(p.message.split("\n")[0]).toBe(`Collectivité : ${"x".repeat(150)}`);
  });
});

describe("sendContact", () => {
  it("POSTs JSON with the anon key and return=minimal", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    await sendContact("https://x.supabase.co/rest/v1/contact_messages", "anon", buildPayload(valid), fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.supabase.co/rest/v1/contact_messages");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Prefer).toBe("return=minimal");
    expect(JSON.parse(init.body as string)).toEqual(buildPayload(valid));
  });

  it("throws a typed error on a non-2xx response", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 401 }));
    await expect(sendContact("u", "k", buildPayload(valid), fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(ContactSendError);
  });
});
