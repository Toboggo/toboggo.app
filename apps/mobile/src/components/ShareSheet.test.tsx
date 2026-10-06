import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Park } from "@toboggo/shared";
import "../i18n/testInit";
import { ShareSheet, getParkShareUrl, DEFAULT_PUBLIC_APP_URL } from "./ShareSheet";

const park = { id: "p-1", name: "Parc des Lilas", city: "Lyon", photos: [] } as unknown as Park;
const url = getParkShareUrl("p-1");

function setup(onClose = vi.fn()) {
  render(<ShareSheet open onClose={onClose} park={park} />);
  return onClose;
}

function href(label: string) {
  return screen.getByText(label).closest("a")?.getAttribute("href") ?? "";
}

describe("ShareSheet", () => {
  const originalShare = navigator.share;
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  afterEach(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: originalShare });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });
  });

  it("canonical link uses the public production origin, never the current one", () => {
    expect(url).toBe(`${DEFAULT_PUBLIC_APP_URL}/park/p-1`);
    expect(url.startsWith(window.location.origin)).toBe(false);
    expect(getParkShareUrl("p-1", "https://example.org/")).toBe("https://example.org/park/p-1");
  });

  it("shows title, park name and city; no Instagram", () => {
    setup();
    expect(screen.getByText("Partager ce parc")).toBeTruthy();
    expect(screen.getByText("Lyon")).toBeTruthy();
    expect(screen.queryByText("Instagram")).toBeNull();
    expect(screen.getByText("Plus d’options")).toBeTruthy();
  });

  it("WhatsApp / SMS / Mail carry the encoded canonical link", () => {
    setup();
    const enc = encodeURIComponent(url);
    expect(href("WhatsApp")).toContain("https://wa.me/?text=");
    expect(href("WhatsApp")).toContain(enc);
    expect(href("SMS")).toMatch(/^sms:\?&body=/);
    expect(href("SMS")).toContain(enc);
    expect(href("Mail")).toContain("mailto:?subject=Parc%20des%20Lilas");
    expect(href("Mail")).toContain(enc);
  });

  it("Copier le lien writes the canonical URL and confirms", async () => {
    setup();
    fireEvent.click(screen.getByText("Copier le lien"));
    await waitFor(() => expect(screen.getByText("Lien copié")).toBeTruthy());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url);
  });

  it("Plus d’options uses native share with the canonical URL", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    setup();
    fireEvent.click(screen.getByText("Plus d’options"));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0][0].url).toBe(url);
  });

  it("Plus d’options: cancelling native share shows no error and does not copy", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    setup();
    fireEvent.click(screen.getByText("Plus d’options"));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("Plus d’options without native share falls back to copying the link", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    setup();
    fireEvent.click(screen.getByText("Plus d’options"));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url));
  });

  it("Fermer closes the sheet", () => {
    const onClose = setup();
    fireEvent.click(screen.getByText("Fermer"));
    expect(onClose).toHaveBeenCalled();
  });
});
